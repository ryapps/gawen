import { HttpError } from "../../lib/http-error.js";
import type { AuthContext } from "../../types/auth.js";
import * as userRepository from "./user.repository.js";
import type { UpdateUserProfileInput } from "./user.validation.js";

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
