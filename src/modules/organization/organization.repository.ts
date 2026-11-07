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
  provinceCode: true,
  provinceName: true,
  regencyCode: true,
  regencyName: true,
  districtCode: true,
  districtName: true,
  villageCode: true,
  villageName: true,
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

export function updateOrganizationLogo(input: {
  organizationId: string;
  userId: string;
  logoUrl: string;
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

    const organization = await transaction.organization.findUnique({
      where: { id: input.organizationId },
      select: { logoUrl: true },
    });
    if (!organization) return { result: "missing" as const };

    const updatedOrganization = await transaction.organization.update({
      where: { id: input.organizationId },
      data: { logoUrl: input.logoUrl },
      select: organizationFields,
    });
    return {
      result: "updated" as const,
      organization: updatedOrganization,
      previousLogoUrl: organization.logoUrl,
    };
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
        provinceCode: true,
        provinceName: true,
        regencyCode: true,
        regencyName: true,
        districtCode: true,
        districtName: true,
        villageCode: true,
        villageName: true,
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

    const provinceChanged =
      input.data.provinceCode !== undefined &&
      input.data.provinceCode !== currentOrganization.provinceCode;
    const regencyChanged =
      input.data.regencyCode !== undefined &&
      input.data.regencyCode !== currentOrganization.regencyCode;
    const districtChanged =
      input.data.districtCode !== undefined &&
      input.data.districtCode !== currentOrganization.districtCode;
    const clearRegency = provinceChanged && input.data.regencyCode === undefined;
    const clearDistrict =
      (provinceChanged || regencyChanged) &&
      input.data.districtCode === undefined;
    const clearVillage =
      (provinceChanged || regencyChanged || districtChanged) &&
      input.data.villageCode === undefined;
    const nextRegion = {
      provinceCode:
        input.data.provinceCode === undefined
          ? currentOrganization.provinceCode
          : input.data.provinceCode,
      regencyCode: clearRegency
        ? null
        : input.data.regencyCode === undefined
          ? currentOrganization.regencyCode
          : input.data.regencyCode,
      districtCode: clearDistrict
        ? null
        : input.data.districtCode === undefined
          ? currentOrganization.districtCode
          : input.data.districtCode,
      villageCode: clearVillage
        ? null
        : input.data.villageCode === undefined
          ? currentOrganization.villageCode
          : input.data.villageCode,
    };
    if (
      (nextRegion.regencyCode &&
        (!nextRegion.provinceCode ||
          !nextRegion.regencyCode.startsWith(`${nextRegion.provinceCode}.`))) ||
      (nextRegion.districtCode &&
        (!nextRegion.regencyCode ||
          !nextRegion.districtCode.startsWith(`${nextRegion.regencyCode}.`))) ||
      (nextRegion.villageCode &&
        (!nextRegion.districtCode ||
          !nextRegion.villageCode.startsWith(`${nextRegion.districtCode}.`)))
    ) {
      return { result: "invalid-region" as const };
    }

    const organization = await transaction.organization.update({
      where: { id: input.organizationId },
      data: {
        ...input.data,
        ...(input.data.provinceName !== undefined
          ? { province: input.data.provinceName }
          : {}),
        ...(input.data.regencyName !== undefined
          ? { city: input.data.regencyName }
          : {}),
        ...(clearRegency ? { regencyCode: null, regencyName: null } : {}),
        ...(clearDistrict ? { districtCode: null, districtName: null } : {}),
        ...(clearVillage ? { villageCode: null, villageName: null } : {}),
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
