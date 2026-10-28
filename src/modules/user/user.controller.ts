import type { RequestHandler } from "express";
import type { AuthContext } from "../../types/auth.js";
import { HttpError } from "../../lib/http-error.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as userService from "./user.service.js";
import { updateUserProfileSchema } from "./user.validation.js";

type AuthenticatedRequest = Parameters<RequestHandler>[0] & {
  auth?: AuthContext;
};

function getAuth(req: AuthenticatedRequest) {
  if (!req.auth) {
    throw new HttpError(401, "Autentikasi diperlukan.");
  }
  return req.auth;
}

export const getMe: RequestHandler = async (req, res) => {
  const user = await userService.getMe(getAuth(req));
  res.status(200).json({ status: "ok", data: { user } });
};

export const updateMe: RequestHandler = validateBody(
  updateUserProfileSchema,
  async (req, res, input) => {
    const user = await userService.updateMe(getAuth(req), input);
    res.status(200).json({ status: "ok", data: { user } });
  },
);
