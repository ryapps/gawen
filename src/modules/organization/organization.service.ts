import { HttpError } from "../../lib/http-error.js";
import type { AuthContext } from "../../types/auth.js";
import * as organizationRepository from "./organization.repository.js";
import type { UpdateOrganizationInput } from "./organization.validation.js";

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
