import type { RequestHandler } from "express";
import { HttpError } from "../../lib/http-error.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as authService from "./auth.service.js";
import {
  loginSchema,
  registerEmployeeSchema,
  registerOwnerSchema,
} from "./auth.validation.js";

const registrationResponse = {
  status: "ok",
  message: "Jika registrasi dapat diproses, akun telah dibuat. Silakan masuk.",
};

export const registerOwner: RequestHandler = validateBody(
  registerOwnerSchema,
  async (_req, res, input) => {
    await authService.registerOwner(input);
    res.status(202).json(registrationResponse);
  },
);

export const registerEmployee: RequestHandler = validateBody(
  registerEmployeeSchema,
  async (_req, res, input) => {
    await authService.registerEmployee(input);
    res.status(202).json(registrationResponse);
  },
);

export const signIn: RequestHandler = validateBody(
  loginSchema,
  async (_req, res, input) => {
    const result = await authService.login(input);
    res.status(200).json({ status: "ok", data: result });
  },
);

export const profile: RequestHandler = (req, res, next) => {
  if (!req.auth) {
    return next(new HttpError(401, "Autentikasi diperlukan."));
  }
  res.status(200).json({ status: "ok", data: { user: req.auth.user } });
};

export const logout: RequestHandler = async (req, res, next) => {
  if (!req.auth) {
    return next(new HttpError(401, "Autentikasi diperlukan."));
  }
  await authService.revokeSession(req.auth.sessionId);
  res.status(200).json({ status: "ok", data: { loggedOut: true } });
};
