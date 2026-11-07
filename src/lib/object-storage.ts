import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../config/env.js";
import { HttpError } from "./http-error.js";

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

let client: S3Client | undefined;

function getStorageConfig() {
  const {
    R2_ENDPOINT,
    R2_BUCKET,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_PUBLIC_BASE_URL,
  } = env;
  if (
    !R2_ENDPOINT ||
    !R2_BUCKET ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_PUBLIC_BASE_URL
  ) {
    throw new HttpError(503, "Penyimpanan gambar belum dikonfigurasi.");
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return {
    client,
    bucket: R2_BUCKET,
    publicBaseUrl: R2_PUBLIC_BASE_URL.replace(/\/+$/, ""),
  };
}

export async function uploadProfileImage(
  userId: string,
  key: string,
  body: Buffer,
  contentType: ImageType,
) {
  const ownerPrefix = `profile-avatars/${createHash("sha256").update(userId).digest("hex")}/`;
  return uploadImage(key, body, contentType, ownerPrefix, "Kunci foto profil tidak valid.");
}

export async function uploadOrganizationLogo(
  organizationId: string,
  key: string,
  body: Buffer,
  contentType: ImageType,
) {
  const ownerPrefix = `organization-logos/${createHash("sha256").update(organizationId).digest("hex")}/`;
  return uploadImage(
    key,
    body,
    contentType,
    ownerPrefix,
    "Kunci logo organisasi tidak valid.",
  );
}

async function uploadImage(
  key: string,
  body: Buffer,
  contentType: ImageType,
  ownerPrefix: string,
  invalidKeyMessage: string,
) {
  const config = getStorageConfig();
  if (!key.startsWith(ownerPrefix)) {
    throw new HttpError(400, invalidKeyMessage);
  }
  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${config.publicBaseUrl}/${key}`;
}

export async function deleteProfileImage(url: string, userId: string) {
  const ownerHash = createHash("sha256").update(userId).digest("hex");
  await deleteImage(
    url,
    `profile-avatars/${ownerHash}/`,
    /^profile-avatars\/[0-9a-f]{64}\/[0-9a-f-]+\.(?:jpg|png|webp)$/,
  );
}

export async function deleteOrganizationLogo(
  url: string,
  organizationId: string,
) {
  const ownerHash = createHash("sha256").update(organizationId).digest("hex");
  await deleteImage(
    url,
    `organization-logos/${ownerHash}/`,
    /^organization-logos\/[0-9a-f]{64}\/[0-9a-f-]+\.(?:jpg|png|webp)$/,
  );
}

async function deleteImage(
  url: string,
  keyPrefix: string,
  keyPattern: RegExp,
) {
  const config = getStorageConfig();
  const prefix = `${config.publicBaseUrl}/${keyPrefix}`;
  if (!url.startsWith(prefix)) return;
  const key = url.slice(config.publicBaseUrl.length + 1);
  if (!keyPattern.test(key)) return;
  await config.client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}
