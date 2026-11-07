import { createHash, randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { HttpError } from "../../lib/http-error.js";
import {
  deleteOrganizationLogo,
  uploadOrganizationLogo,
  type ImageType,
} from "../../lib/object-storage.js";
import type { AuthContext } from "../../types/auth.js";
import * as organizationRepository from "./organization.repository.js";
import type { UpdateOrganizationInput } from "./organization.validation.js";

const organizationLogoExtensions: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadOrganizationLogoImage(
  auth: AuthContext,
  organizationId: string,
  buffer: Buffer,
) {
  const fileType = await fileTypeFromBuffer(buffer);
  if (
    !fileType ||
    !(fileType.mime in organizationLogoExtensions)
  ) {
    throw new HttpError(400, "Format logo harus JPEG, PNG, atau WebP.");
  }

  const contentType = fileType.mime as ImageType;
  const organizationHash = createHash("sha256")
    .update(organizationId)
    .digest("hex");
  const key =
    `organization-logos/${organizationHash}/` +
    `${randomUUID()}.${organizationLogoExtensions[contentType]}`;
  const logoUrl = await uploadOrganizationLogo(
    organizationId,
    key,
    buffer,
    contentType,
  );

  try {
    const result = await organizationRepository.updateOrganizationLogo({
      organizationId,
      userId: auth.user.id,
      logoUrl,
    });
    if (result.result === "not-owner") {
      throw new HttpError(403, "Anda tidak memiliki akses.");
    }
    if (result.result === "missing") {
      throw new HttpError(404, "Organisasi tidak tersedia.");
    }
    if (result.previousLogoUrl) {
      try {
        await deleteOrganizationLogo(
          result.previousLogoUrl,
          organizationId,
        );
      } catch (error) {
        console.error(
          "Organization logo cleanup failed:",
          error instanceof Error ? error.name : "Unknown error",
        );
      }
    }
    return result.organization;
  } catch (error) {
    try {
      await deleteOrganizationLogo(logoUrl, organizationId);
    } catch (cleanupError) {
      console.error(
        "New organization logo cleanup failed:",
        cleanupError instanceof Error ? cleanupError.name : "Unknown error",
      );
    }
    throw error;
  }
}

export async function getOrganization(organizationId: string) {
  const organization =
    await organizationRepository.findOrganization(organizationId);

  if (!organization) {
    throw new HttpError(404, "Organisasi tidak tersedia.");
  }

  const { _count, ...details } = organization;
  return { ...details, memberCount: _count.memberships };
}

export async function updateOrganization(
  auth: AuthContext,
  organizationId: string,
  input: UpdateOrganizationInput,
) {
  const result = await organizationRepository.updateOrganization({
    organizationId,
    userId: auth.user.id,
    data: input,
  });

  if (result.result === "not-owner") {
    throw new HttpError(403, "Anda tidak memiliki akses.");
  }
  if (result.result === "missing") {
    throw new HttpError(404, "Organisasi tidak tersedia.");
  }
  if (result.result === "invalid-profile") {
    throw new HttpError(
      400,
      "Jenis usaha wajib diisi setelah pengaturan usaha selesai.",
    );
  }
  if (result.result === "invalid-step") {
    throw new HttpError(400, "Langkah onboarding harus disimpan secara berurutan.");
  }
  if (result.result === "invalid-region") {
    throw new HttpError(400, "Hierarki kode wilayah tidak valid.");
  }

  return result.organization;
}

export async function completeOrganizationSetup(
  auth: AuthContext,
  organizationId: string,
) {
  const result = await organizationRepository.completeOrganizationSetup({
    organizationId,
    userId: auth.user.id,
  });
  if (result.result === "not-owner") {
    throw new HttpError(403, "Anda tidak memiliki akses.");
  }
  if (result.result === "missing") {
    throw new HttpError(404, "Organisasi tidak tersedia.");
  }
  if (result.result === "invalid-profile") {
    throw new HttpError(400, "Nama dan jenis usaha wajib diisi.");
  }
  return result.organization;
}
