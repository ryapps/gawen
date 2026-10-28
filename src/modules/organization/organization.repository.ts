import { OrganizationRole } from "../../generated/prisma/client.js";
import prisma from "../../lib/prisma.js";
import type { UpdateOrganizationInput } from "./organization.validation.js";

const organizationFields = {
  id: true,
  name: true,
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
  timezone: true,
  setupCompletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function findOrganization(organizationId: string) {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      ...organizationFields,
      _count: { select: { memberships: true } },
    },
  });
}

export function updateOrganization(input: {
  organizationId: string;
  userId: string;
  data: UpdateOrganizationInput;
}) {
  return prisma.$transaction(async (transaction) => {
    const membership = await transaction.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: input.userId,
        },
      },
      select: { role: true },
    });

    if (membership?.role !== OrganizationRole.OWNER) {
      return { result: "not-owner" as const };
    }

    const currentOrganization = await transaction.organization.findUnique({
      where: { id: input.organizationId },
      select: {
        name: true,
        businessType: true,
        setupCompletedAt: true,
      },
    });
    if (!currentOrganization) {
      return { result: "missing" as const };
    }

    const nextName = input.data.name ?? currentOrganization.name;
    const nextBusinessType =
      input.data.businessType === undefined
        ? currentOrganization.businessType
        : input.data.businessType;
    if (
      currentOrganization.setupCompletedAt &&
      (!nextBusinessType || !nextName.trim())
    ) {
      return { result: "invalid-profile" as const };
    }

    const setupCompletedAt =
      currentOrganization.setupCompletedAt ??
      (nextName.trim() && nextBusinessType?.trim()
        ? new Date()
        : null);
    const organization = await transaction.organization.update({
      where: { id: input.organizationId },
      data: {
        ...input.data,
        ...(setupCompletedAt ? { setupCompletedAt } : {}),
      },
      select: organizationFields,
    });

    return { result: "updated" as const, organization };
  });
}
