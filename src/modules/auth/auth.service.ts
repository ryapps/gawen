import argon2 from "argon2";
import { HttpError } from "../../lib/http-error.js";
import type { AuthUser } from "../../types/auth.js";
import * as authRepository from "./auth.repository.js";
import type {
  LoginInput,
  RegisterEmployeeInput,
  RegisterOwnerInput,
} from "./auth.validation.js";

const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;
const DUMMY_PASSWORD_HASH = argon2.hash(
  randomBytes(32).toString("hex"),
  PASSWORD_HASH_OPTIONS,
);

export async function registerOwner(input: RegisterOwnerInput) {
  const passwordHash = await argon2.hash(input.password, PASSWORD_HASH_OPTIONS);

  try {
    await authRepository.createOwnerAccount(
      {
        name: input.name,
        email: input.email,
        organizationName: input.organizationName,
      },
      passwordHash,
    );
  } catch (error) {
    if (authRepository.isUniqueConstraintError(error)) {
      return;
    }
    throw error;
  }
}

export async function registerEmployee(input: RegisterEmployeeInput) {
  const passwordHash = await argon2.hash(input.password, PASSWORD_HASH_OPTIONS);

  try {
    await authRepository.createEmployeeAccount(
      { name: input.name, email: input.email },
      passwordHash,
    );
  } catch (error) {
    if (authRepository.isUniqueConstraintError(error)) {
      return;
    }
    throw error;
  }
}

export async function login(input: LoginInput) {
  const user = await authRepository.findLoginUser(input);
  const passwordMatches = await argon2.verify(
    user?.passwordHash ?? (await DUMMY_PASSWORD_HASH),
    input.password,
  );

  if (!user || !passwordMatches) {
    throw new HttpError(401, "Email atau password tidak valid.");
  }

  const { token, tokenHash } = createToken();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await authRepository.createSession(user.id, tokenHash, expiresAt);

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return {
    accessToken: token,
    tokenType: "Bearer" as const,
    expiresAt,
    user: publicUser,
  } satisfies {
    accessToken: string;
    tokenType: "Bearer";
    expiresAt: Date;
    user: AuthUser;
  };
}

export function revokeSession(sessionId: string) {
  return authRepository.revokeSession(sessionId);
}
