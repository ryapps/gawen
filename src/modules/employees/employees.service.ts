import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import type { AuthContext } from "../../types/auth.js";
import { HttpError } from "../../lib/http-error.js";
import * as employeesRepository from "./employees.repository.js";
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
  JoinOrganizationInput,
} from "./employees.validation.js";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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
  return employeesRepository.findUserJoinRequests(auth.user.id);
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

export async function rotateBusinessCode(organizationId: string) {
  const businessCode = randomBytes(12).toString("base64url");
  await employeesRepository.rotateBusinessCode(
    organizationId,
    hashToken(businessCode),
  );
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
  return { ...invitation, token };
}

export async function acceptInvitation(
  auth: AuthContext,
  input: AcceptInvitationInput,
) {
  try {
    const result = await employeesRepository.acceptInvitation({
      tokenHash: hashToken(input.token),
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

export async function revokeInvitation(
  organizationId: string,
  invitationId: string,
) {
  const revoked = await employeesRepository.revokeInvitation(
    organizationId,
    invitationId,
  );
  if (revoked.count !== 1) {
    throw new HttpError(404, "Undangan tidak tersedia.");
  }
  return { status: "REVOKED" as const };
}
