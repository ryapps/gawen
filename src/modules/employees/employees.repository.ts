import {
  JoinRequestStatus,
  OrganizationRole,
  Prisma,
} from "../../generated/prisma/client.js";
import prisma from "../../lib/prisma.js";

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

export function findPendingJoinRequests(organizationId: string) {
  return prisma.employeeJoinRequest.findMany({
    where: { organizationId, status: JoinRequestStatus.PENDING },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
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
      }
      return { result: "decided" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function rotateBusinessCode(
  organizationId: string,
  businessCodeHash: string,
) {
  return prisma.organization.update({
    where: { id: organizationId },
    data: { businessCodeHash },
    select: { id: true },
  });
}

export function createInvitation(input: {
  organizationId: string;
  createdByUserId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  return prisma.organizationInvitation.create({
    data: input,
    select: { id: true, email: true, expiresAt: true, createdAt: true },
  });
}

export function revokeInvitation(
  organizationId: string,
  invitationId: string,
) {
  return prisma.organizationInvitation.updateMany({
    where: {
      id: invitationId,
      organizationId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { revokedAt: new Date() },
  });
}

export async function acceptInvitation(input: {
  tokenHash: string;
  userId: string;
  userEmail: string;
}) {
  return prisma.$transaction(
    async (transaction) => {
      const invitation = await transaction.organizationInvitation.findUnique({
        where: { tokenHash: input.tokenHash },
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
      return { result: "accepted" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002";
}
