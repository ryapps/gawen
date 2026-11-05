import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../config/env.js";
import { HttpError } from "./http-error.js";

type ImageType = "image/jpeg" | "image/png" | "image/webp";

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
    throw new HttpError(503, "Penyimpanan foto profil belum dikonfigurasi.");
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
  const config = getStorageConfig();
  const ownerPrefix = `profile-avatars/${createHash("sha256").update(userId).digest("hex")}/`;
  if (!key.startsWith(ownerPrefix)) {
    throw new HttpError(400, "Kunci foto profil tidak valid.");
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
  const config = getStorageConfig();
  const ownerHash = createHash("sha256").update(userId).digest("hex");
  const prefix = `${config.publicBaseUrl}/profile-avatars/${ownerHash}/`;
  if (!url.startsWith(prefix)) return;
  const key = url.slice(config.publicBaseUrl.length + 1);
  if (
    !/^profile-avatars\/[0-9a-f]{64}\/[0-9a-f-]+\.(?:jpg|png|webp)$/.test(key)
  )
    return;
  await config.client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}
