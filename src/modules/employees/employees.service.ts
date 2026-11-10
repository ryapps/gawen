import { createHash, randomBytes, randomInt } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import type { AuthContext } from "../../types/auth.js";
import { HttpError } from "../../lib/http-error.js";
import * as employeesRepository from "./employees.repository.js";
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
  ListEmployeesQuery,
  JoinOrganizationInput,
  UpdateEmployeeInput,
  UpdateEmployeeStatusInput,
} from "./employees.validation.js";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const BUSINESS_CODE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const BUSINESS_CODE_LENGTH = 8;

type EmployeeRecord = NonNullable<
  Awaited<ReturnType<typeof employeesRepository.findEmployee>>
>;

function getOwnedOrganizationIds(auth: AuthContext) {
  const organizationIds = [
    ...new Set(
      auth.user.memberships
        .filter((membership) => membership.role === "OWNER")
        .map((membership) => membership.organization.id),
    ),
  ];
  if (organizationIds.length === 0) {
    throw new HttpError(403, "Anda tidak memiliki akses.");
  }
  return organizationIds;
}

function toEmployeeResponse(employee: EmployeeRecord) {
  return {
    id: employee.id,
    userId: employee.userId,
    name: employee.user?.name ?? employee.fullName,
    photoProfile: employee.user?.photoProfile ?? null,
    email: employee.user?.email ?? null,
    phone: employee.user ? employee.user.phone : employee.phone,
    position: employee.position,
    status: employee.status,
    joinedAt: employee.hiredAt,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createBusinessCode(): string {
  return Array.from(
    { length: BUSINESS_CODE_LENGTH },
    () => BUSINESS_CODE_CHARACTERS[randomInt(BUSINESS_CODE_CHARACTERS.length)],
  ).join("");
}

export async function listManagedEmployees(
  auth: AuthContext,
  input: ListEmployeesQuery,
) {
  const result = await employeesRepository.findEmployees(
    getOwnedOrganizationIds(auth),
    input,
  );
  return {
    employees: result.employees.map(toEmployeeResponse),
    pagination: {
      page: input.page,
      limit: input.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / input.limit),
    },
  };
}

export async function getManagedEmployee(
  auth: AuthContext,
  employeeId: string,
) {
  const employee = await employeesRepository.findEmployee(
    employeeId,
    getOwnedOrganizationIds(auth),
  );
  if (!employee) {
    throw new HttpError(404, "Karyawan tidak tersedia.");
  }
  return toEmployeeResponse(employee);
}

export async function updateManagedEmployee(
  auth: AuthContext,
  employeeId: string,
  input: UpdateEmployeeInput,
) {
  const employee = await employeesRepository.updateEmployeePosition(
    employeeId,
    getOwnedOrganizationIds(auth),
    input.position ?? null,
  );
  if (!employee) {
    throw new HttpError(404, "Karyawan tidak tersedia.");
  }
  return toEmployeeResponse(employee);
}

export async function updateManagedEmployeeStatus(
  auth: AuthContext,
  employeeId: string,
  input: UpdateEmployeeStatusInput,
) {
  const employee = await employeesRepository.updateEmployeeStatus(
    employeeId,
    getOwnedOrganizationIds(auth),
    input.status,
  );
  if (!employee) {
    throw new HttpError(404, "Karyawan tidak tersedia.");
  }
  return toEmployeeResponse(employee);
}

export async function requestMembership(
  auth: AuthContext,
  input: JoinOrganizationInput,
) {
  try {
    await employeesRepository.requestMembership(
      auth.user.id,
      hashToken(input.businessCode),
    );
  } catch (error) {
    if (employeesRepository.isUniqueConstraintError(error)) {
      return;
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new HttpError(409, "Permintaan sedang diproses; coba lagi.");
    }
    throw error;
  }
}

export function listOwnRequests(auth: AuthContext) {
  return employeesRepository.findOwnJoinActivity(
    auth.user.id,
    auth.user.email,
  );
}

export function listOrganizationMembers(organizationId: string) {
  return employeesRepository.findOrganizationMembers(organizationId);
}

export async function getOrganizationMember(
  organizationId: string,
  membershipId: string,
) {
  const member = await employeesRepository.findOrganizationMember(
    organizationId,
    membershipId,
  );
  if (!member) {
    throw new HttpError(404, "Anggota tidak tersedia.");
  }
  return member;
}

export function listPendingRequests(organizationId: string) {
  return employeesRepository.findPendingJoinRequests(organizationId);
}

export async function decideRequest(
  auth: AuthContext,
  organizationId: string,
  requestId: string,
  approve: boolean,
) {
  try {
    const result = await employeesRepository.decideJoinRequest({
      requestId,
      organizationId,
      ownerUserId: auth.user.id,
      approve,
    });
    if (result.result === "not-owner") {
      throw new HttpError(403, "Anda tidak memiliki akses.");
    }
    if (result.result === "self-approval") {
      throw new HttpError(403, "Permintaan ini tidak dapat disetujui sendiri.");
    }
    if (result.result === "not-pending") {
      throw new HttpError(409, "Permintaan tidak tersedia atau sudah diproses.");
    }
    return { status: approve ? "APPROVED" as const : "REJECTED" as const };
  } catch (error) {
    if (employeesRepository.isUniqueConstraintError(error)) {
      throw new HttpError(409, "Keanggotaan organisasi sudah ada.");
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new HttpError(409, "Permintaan sedang diproses; coba lagi.");
    }
    throw error;
  }
}

export async function rotateBusinessCode(
  auth: AuthContext,
  organizationId: string,
) {
  const businessCode = createBusinessCode();
  const result = await employeesRepository.rotateBusinessCode(
    organizationId,
    auth.user.id,
    hashToken(businessCode),
  );
  if (result.result === "not-owner") {
    throw new HttpError(403, "Anda tidak memiliki akses.");
  }
  if (result.result === "missing") {
    throw new HttpError(404, "Organisasi tidak tersedia.");
  }
  return { businessCode };
}

export async function createInvitation(
  auth: AuthContext,
  organizationId: string,
  input: CreateInvitationInput,
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
  const invitation = await employeesRepository.createInvitation({
    organizationId,
    createdByUserId: auth.user.id,
    email: input.email,
    tokenHash: hashToken(token),
    expiresAt,
  });
  if (invitation.result === "not-owner") {
    throw new HttpError(403, "Anda tidak memiliki akses.");
  }
  if (invitation.result === "user-not-found") {
    throw new HttpError(404, "Email belum terdaftar pada akun Gawen.");
  }
  if (invitation.result === "already-member") {
    throw new HttpError(409, "Pengguna tersebut sudah menjadi anggota organisasi.");
  }
  return invitation.invitation;
}

export async function listOwnInvitations(auth: AuthContext) {
  return employeesRepository.findInvitationsForUser(auth.user.email);
}

async function completeInvitationAcceptance(
  auth: AuthContext,
  invitationLookup: { tokenHash: string } | { invitationId: string },
) {
  try {
    const result = await employeesRepository.acceptInvitation({
      lookup: "tokenHash" in invitationLookup
        ? { by: "tokenHash", value: invitationLookup.tokenHash }
        : { by: "id", value: invitationLookup.invitationId },
      userId: auth.user.id,
      userEmail: auth.user.email,
    });
    if (result.result === "invalid-invitation") {
      throw new HttpError(400, "Undangan tidak valid atau tidak dapat digunakan.");
    }
    return { status: "ACCEPTED" as const };
  } catch (error) {
    if (employeesRepository.isUniqueConstraintError(error)) {
      throw new HttpError(409, "Akun sudah menjadi anggota organisasi.");
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      throw new HttpError(409, "Undangan sedang diproses; coba lagi.");
    }
    throw error;
  }
}

export function acceptInvitation(
  auth: AuthContext,
  input: AcceptInvitationInput,
) {
  return completeInvitationAcceptance(auth, {
    tokenHash: hashToken(input.token),
  });
}

export function acceptInvitationById(
  auth: AuthContext,
  invitationId: string,
) {
  return completeInvitationAcceptance(auth, { invitationId });
}

export async function revokeInvitation(
  auth: AuthContext,
  organizationId: string,
  invitationId: string,
) {
  const revoked = await employeesRepository.revokeInvitation(
    organizationId,
    auth.user.id,
    invitationId,
  );
  if (revoked.result === "not-owner") {
    throw new HttpError(403, "Anda tidak memiliki akses.");
  }
  if (revoked.result === "missing") {
    throw new HttpError(404, "Undangan tidak tersedia.");
  }
  return { status: "REVOKED" as const };
}
