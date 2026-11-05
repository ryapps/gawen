import { createHash, randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { HttpError } from "../../lib/http-error.js";
import {
  deleteProfileImage,
  uploadProfileImage,
} from "../../lib/object-storage.js";
import type { AuthContext } from "../../types/auth.js";
import * as userRepository from "./user.repository.js";
import type { UpdateUserProfileInput } from "./user.validation.js";

type ProfileImageMime = "image/jpeg" | "image/png" | "image/webp";
const profileImageExtensions: Record<ProfileImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function isProfileImageMime(value: string): value is ProfileImageMime {
  return value in profileImageExtensions;
}

export async function getMe(auth: AuthContext) {
  const user = await userRepository.findProfile(auth.user.id);
  if (!user) {
    throw new HttpError(401, "Autentikasi diperlukan.");
  }
  return user;
}

export async function updateMe(
  auth: AuthContext,
  input: UpdateUserProfileInput,
) {
  return userRepository.updateProfile(auth.user.id, input);
}

export async function uploadAvatar(auth: AuthContext, buffer: Buffer) {
  const type = await fileTypeFromBuffer(buffer);
  if (!type || !isProfileImageMime(type.mime)) {
    throw new HttpError(400, "Format foto harus JPEG, PNG, atau WebP.");
  }

  const contentType = type.mime;
  const ownerHash = createHash("sha256").update(auth.user.id).digest("hex");
  const key = `profile-avatars/${ownerHash}/${randomUUID()}.${profileImageExtensions[contentType]}`;
  const previous = await getMe(auth);
  const photoProfile = await uploadProfileImage(
    auth.user.id,
    key,
    buffer,
    contentType,
  );
  try {
    const user = await updateMe(auth, { photoProfile });
    if (previous.photoProfile) {
      try {
        await deleteProfileImage(previous.photoProfile, auth.user.id);
      } catch (error) {
        console.error(
          "Profile avatar cleanup failed:",
          error instanceof Error ? error.name : "Unknown error",
        );
      }
    }
    return user;
  } catch (error) {
    try {
      await deleteProfileImage(photoProfile, auth.user.id);
    } catch (cleanupError) {
      console.error(
        "New profile avatar cleanup failed:",
        cleanupError instanceof Error ? cleanupError.name : "Unknown error",
      );
    }
    throw error;
  }
}
