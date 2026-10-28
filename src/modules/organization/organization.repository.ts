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
  setupStep: true,
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
        setupStep: true,
      },
    });
    if (!currentOrganization) {
      return { result: "missing" as const };
    }
    if (
      input.data.setupStep !== undefined &&
      input.data.setupStep > currentOrganization.setupStep + 1
    ) {
      return { result: "invalid-step" as const };
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

    const organization = await transaction.organization.update({
      where: { id: input.organizationId },
      data: {
        ...input.data,
        ...(input.data.setupStep !== undefined
          ? { setupStep: input.data.setupStep }
          : {}),
      },
      select: organizationFields,
    });

    return { result: "updated" as const, organization };
  });
}

export async function completeOrganizationSetup(input: {
  organizationId: string;
  userId: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const membership = await transaction.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.organizationId,
          userId: input.userId,
        },
      },
      select: { role: true, user: { select: { phone: true } } },
    });
    if (membership?.role !== OrganizationRole.OWNER) {
      return { result: "not-owner" as const };
    }

    const organization = await transaction.organization.findUnique({
      where: { id: input.organizationId },
      select: {
        name: true,
        businessType: true,
        setupStep: true,
      },
    });
    if (!organization) return { result: "missing" as const };
    if (
      !organization.name.trim() ||
      !organization.businessType?.trim() ||
      organization.setupStep < 4 ||
      !membership.user.phone
    ) {
      return { result: "invalid-profile" as const };
    }

    const updatedOrganization = await transaction.organization.update({
      where: { id: input.organizationId },
      data: { setupCompletedAt: new Date(), setupStep: 5 },
      select: organizationFields,
    });
    return { result: "completed" as const, organization: updatedOrganization };
  });
}
