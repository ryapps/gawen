import { OrganizationRole, Prisma } from "../../generated/prisma/client.js";
import prisma from "../../lib/prisma.js";
import type {
  LoginInput,
  RegisterEmployeeInput,
  RegisterOwnerInput,
} from "./auth.validation.js";

export async function createOwnerAccount(
  input: Pick<
    RegisterOwnerInput,
    "name" | "email" | "organizationName" | "phone"
  >,
  passwordHash: string,
) {
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        phone: input.phone ?? null,
      },
      select: { id: true, name: true, email: true, phone: true },
    });
    const organization = await transaction.organization.create({
      data: { name: input.organizationName },
      select: {
        id: true,
        name: true,
        timezone: true,
        businessType: true,
        description: true,
        logoUrl: true,
        email: true,
        phone: true,
        website: true,
        address: true,
        city: true,
        province: true,
        postalCode: true,
        currency: true,
        setupCompletedAt: true,
      },
    });
    const membership = await transaction.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: OrganizationRole.OWNER,
      },
      select: { id: true, role: true },
    });
    return {
      ...user,
      memberships: [{ ...membership, organization }],
    };
  });
}

export async function createEmployeeAccount(
  input: Pick<RegisterEmployeeInput, "name" | "email" | "phone">,
  passwordHash: string,
) {
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      phone: input.phone ?? null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      memberships: {
        select: {
          id: true,
          role: true,
          organization: {
            select: {
              id: true,
              name: true,
              timezone: true,
              businessType: true,
              description: true,
              logoUrl: true,
              email: true,
              phone: true,
              website: true,
              address: true,
              city: true,
              province: true,
              postalCode: true,
              currency: true,
              setupCompletedAt: true,
            },
          },
        },
      },
    },
  });
}

export function findLoginUser(input: LoginInput) {
  return prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      passwordHash: true,
      memberships: {
        select: {
          id: true,
          role: true,
          organization: {
            select: {
              id: true,
              name: true,
              timezone: true,
              businessType: true,
              description: true,
              logoUrl: true,
              email: true,
              phone: true,
              website: true,
              address: true,
              city: true,
              province: true,
              postalCode: true,
              currency: true,
              setupCompletedAt: true,
            },
          },
        },
      },
    },
  });
}

export function createSession(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
) {
  return prisma.authSession.create({
    data: { userId, tokenHash, expiresAt },
  });
}

export function revokeSession(sessionId: string) {
  return prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002";
}
