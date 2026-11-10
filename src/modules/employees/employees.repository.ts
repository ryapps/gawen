import { randomUUID } from "node:crypto";
import {
  EmployeeStatus,
  JoinRequestStatus,
  OrganizationRole,
  Prisma,
} from "../../generated/prisma/client.js";
import prisma from "../../lib/prisma.js";

const employeeManagementSelect = {
  id: true,
  organizationId: true,
  userId: true,
  fullName: true,
  phone: true,
  position: true,
  status: true,
  hiredAt: true,
  user: {
    select: {
      name: true,
      email: true,
      phone: true,
      photoProfile: true,
    },
  },
} as const;

export async function findEmployees(
  organizationIds: string[],
  input: {
    search?: string;
    status?: EmployeeStatus;
    page: number;
    limit: number;
  },
) {
  const search = input.search || undefined;
  const where: Prisma.EmployeeWhereInput = {
    organizationId: { in: organizationIds },
    ...(input.status ? { status: input.status } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            {
              user: {
                is: {
                  name: { contains: search, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [employees, total] = await prisma.$transaction([
    prisma.employee.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: employeeManagementSelect,
    }),
    prisma.employee.count({ where }),
  ]);
  return { employees, total };
}

export function findEmployee(employeeId: string, organizationIds: string[]) {
  return prisma.employee.findFirst({
    where: { id: employeeId, organizationId: { in: organizationIds } },
    select: employeeManagementSelect,
  });
}

export async function updateEmployeePosition(
  employeeId: string,
  organizationIds: string[],
  position: string | null,
) {
  const updated = await prisma.employee.updateMany({
    where: { id: employeeId, organizationId: { in: organizationIds } },
    data: { position },
  });
  if (updated.count !== 1) return null;
  return findEmployee(employeeId, organizationIds);
}

export async function updateEmployeeStatus(
  employeeId: string,
  organizationIds: string[],
  status: EmployeeStatus,
) {
  const updated = await prisma.employee.updateMany({
    where: { id: employeeId, organizationId: { in: organizationIds } },
    data: { status },
  });
  if (updated.count !== 1) return null;
  return findEmployee(employeeId, organizationIds);
}

async function syncEmployeeForMembership(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
) {
  const user = await transaction.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, phone: true },
  });
  const existing = await transaction.employee.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true, hiredAt: true },
  });
  if (existing) {
    await transaction.employee.update({
      where: { id: existing.id },
      data: {
        fullName: user.name,
        phone: user.phone,
        status: EmployeeStatus.ACTIVE,
        hiredAt: existing.hiredAt ?? new Date(),
      },
    });
    return;
  }

  await transaction.employee.create({
    data: {
      organizationId,
      userId,
      employeeCode: `EMP-${randomUUID().toUpperCase()}`,
      fullName: user.name,
      phone: user.phone,
      status: EmployeeStatus.ACTIVE,
      hiredAt: new Date(),
    },
  });
}

const organizationMemberSelect = {
  id: true,
  role: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      photoProfile: true,
    },
  },
} as const;

export function findOrganizationMembers(organizationId: string) {
  return prisma.organizationMembership.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: organizationMemberSelect,
  });
}

export function findOrganizationMember(
  organizationId: string,
  membershipId: string,
) {
  return prisma.organizationMembership.findFirst({
    where: { id: membershipId, organizationId },
    select: organizationMemberSelect,
  });
}

export async function requestMembership(
  userId: string,
  businessCodeHash: string,
) {
  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { businessCodeHash },
      select: { id: true },
    });
    if (!organization) {
      return { result: "invalid-code" as const };
    }

    const membership = await transaction.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId,
        },
      },
      select: { id: true },
    });
    if (membership) {
      return { result: "already-member" as const };
    }

    const previousRequest = await transaction.employeeJoinRequest.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId,
        },
      },
      select: { id: true, status: true },
    });

    if (previousRequest?.status === JoinRequestStatus.PENDING) {
      return { result: "already-pending" as const };
    }
    if (previousRequest?.status === JoinRequestStatus.APPROVED) {
      return { result: "already-member" as const };
    }

    if (previousRequest) {
      const updated = await transaction.employeeJoinRequest.updateMany({
        where: {
          id: previousRequest.id,
          status: JoinRequestStatus.REJECTED,
        },
        data: {
          status: JoinRequestStatus.PENDING,
          decidedAt: null,
          decidedById: null,
          createdAt: new Date(),
        },
      });
      return { result: updated.count === 1 ? "created" as const : "already-pending" as const };
    }

    await transaction.employeeJoinRequest.create({
      data: {
        userId,
        organizationId: organization.id,
        status: JoinRequestStatus.PENDING,
      },
    });
    return { result: "created" as const };
  });
}

export function findUserJoinRequests(userId: string) {
  return prisma.employeeJoinRequest.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      decidedAt: true,
      organization: {
        select: { id: true, name: true, timezone: true },
      },
    },
  });
}

export async function findOwnJoinActivity(userId: string, email: string) {
  const [requests, invitations] = await Promise.all([
    findUserJoinRequests(userId),
    findInvitationsForUser(email),
  ]);
  return { requests, invitations };
}

export function findPendingJoinRequests(organizationId: string) {
  return prisma.employeeJoinRequest.findMany({
    where: { organizationId, status: JoinRequestStatus.PENDING },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          photoProfile: true,
        },
      },
    },
  });
}

export async function decideJoinRequest(input: {
  requestId: string;
  organizationId: string;
  ownerUserId: string;
  approve: boolean;
}) {
  return prisma.$transaction(
    async (transaction) => {
      const ownerMembership =
        await transaction.organizationMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: input.organizationId,
              userId: input.ownerUserId,
            },
          },
          select: { role: true },
        });
      if (ownerMembership?.role !== OrganizationRole.OWNER) {
        return { result: "not-owner" as const };
      }

      const joinRequest = await transaction.employeeJoinRequest.findFirst({
        where: {
          id: input.requestId,
          organizationId: input.organizationId,
          status: JoinRequestStatus.PENDING,
        },
        select: { id: true, userId: true },
      });
      if (!joinRequest) {
        return { result: "not-pending" as const };
      }
      if (joinRequest.userId === input.ownerUserId) {
        return { result: "self-approval" as const };
      }

      const updated = await transaction.employeeJoinRequest.updateMany({
        where: {
          id: joinRequest.id,
          status: JoinRequestStatus.PENDING,
        },
        data: {
          status: input.approve
            ? JoinRequestStatus.APPROVED
            : JoinRequestStatus.REJECTED,
          decidedAt: new Date(),
          decidedById: input.ownerUserId,
        },
      });
      if (updated.count !== 1) {
        return { result: "not-pending" as const };
      }

      if (input.approve) {
        await transaction.organizationMembership.create({
          data: {
            organizationId: input.organizationId,
            userId: joinRequest.userId,
            role: OrganizationRole.EMPLOYEE,
          },
        });
        await syncEmployeeForMembership(
          transaction,
          input.organizationId,
          joinRequest.userId,
        );
      }
      return { result: "decided" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function rotateBusinessCode(
  organizationId: string,
  ownerUserId: string,
  businessCodeHash: string,
) {
  return prisma.$transaction(async (transaction) => {
    const ownerMembership =
      await transaction.organizationMembership.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: ownerUserId },
        },
        select: { role: true },
      });
    if (ownerMembership?.role !== OrganizationRole.OWNER) {
      return { result: "not-owner" as const };
    }

    const updated = await transaction.organization.updateMany({
      where: { id: organizationId },
      data: { businessCodeHash },
    });
    return { result: updated.count === 1 ? "rotated" as const : "missing" as const };
  });
}

export function createInvitation(input: {
  organizationId: string;
  createdByUserId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  return prisma.$transaction(async (transaction) => {
    const ownerMembership =
      await transaction.organizationMembership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: input.organizationId,
            userId: input.createdByUserId,
          },
        },
        select: { role: true },
      });
    if (ownerMembership?.role !== OrganizationRole.OWNER) {
      return { result: "not-owner" as const };
    }

    const user = await transaction.user.findUnique({
      where: { email: input.email },
      select: {
        email: true,
        memberships: {
          where: { organizationId: input.organizationId },
          select: { id: true },
        },
      },
    });
    if (!user) {
      return { result: "user-not-found" as const };
    }
    if (user.memberships.length > 0) {
      return { result: "already-member" as const };
    }

    const invitation = await transaction.organizationInvitation.create({
      data: { ...input, email: user.email },
      select: { id: true, email: true, expiresAt: true, createdAt: true },
    });
    return { result: "created" as const, invitation };
  });
}

export function findInvitationsForUser(email: string) {
  return prisma.organizationInvitation.findMany({
    where: {
      email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      email: true,
      expiresAt: true,
      createdAt: true,
      organization: { select: { id: true, name: true } },
    },
  });
}

export function revokeInvitation(
  organizationId: string,
  ownerUserId: string,
  invitationId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const ownerMembership =
      await transaction.organizationMembership.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: ownerUserId },
        },
        select: { role: true },
      });
    if (ownerMembership?.role !== OrganizationRole.OWNER) {
      return { result: "not-owner" as const };
    }

    const revoked = await transaction.organizationInvitation.updateMany({
      where: {
        id: invitationId,
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    return { result: revoked.count === 1 ? "revoked" as const : "missing" as const };
  });
}

export async function acceptInvitation(
  input: {
    lookup: { by: "tokenHash"; value: string } | { by: "id"; value: string };
    userId: string;
    userEmail: string;
  },
) {
  return prisma.$transaction(
    async (transaction) => {
      const invitation = await transaction.organizationInvitation.findUnique({
        where: input.lookup.by === "id"
          ? { id: input.lookup.value }
          : { tokenHash: input.lookup.value },
        select: {
          id: true,
          organizationId: true,
          createdByUserId: true,
          email: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
      });
      const now = new Date();
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= now ||
        invitation.email !== input.userEmail
      ) {
        return { result: "invalid-invitation" as const };
      }

      const inviterMembership =
        await transaction.organizationMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: invitation.organizationId,
              userId: invitation.createdByUserId,
            },
          },
          select: { role: true },
        });
      if (inviterMembership?.role !== OrganizationRole.OWNER) {
        return { result: "invalid-invitation" as const };
      }

      const claimed = await transaction.organizationInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      });
      if (claimed.count !== 1) {
        return { result: "invalid-invitation" as const };
      }

      await transaction.organizationMembership.create({
        data: {
          organizationId: invitation.organizationId,
          userId: input.userId,
          role: OrganizationRole.EMPLOYEE,
        },
      });
      await syncEmployeeForMembership(
        transaction,
        invitation.organizationId,
        input.userId,
      );
      return { result: "accepted" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002";
}
