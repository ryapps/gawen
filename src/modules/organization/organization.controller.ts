import type { RequestHandler } from "express";
import type { AuthContext } from "../../types/auth.js";
import { HttpError } from "../../lib/http-error.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as organizationService from "./organization.service.js";
import { updateOrganizationSchema } from "./organization.validation.js";

type AuthenticatedRequest = Parameters<RequestHandler>[0] & {
  auth?: AuthContext;
};

function getAuth(req: AuthenticatedRequest) {
  if (!req.auth) {
    throw new HttpError(401, "Autentikasi diperlukan.");
  }
  return req.auth;
}

function getOrganizationId(req: Parameters<RequestHandler>[0]): string {
  const organizationId = req.params.organizationId;
  if (typeof organizationId !== "string" || !organizationId) {
    throw new HttpError(400, "Organisasi tidak valid.");
  }
  return organizationId;
}

export const getOrganization: RequestHandler = async (req, res) => {
  const organization = await organizationService.getOrganization(
    getOrganizationId(req),
  );
  res.status(200).json({ status: "ok", data: { organization } });
};

export const updateOrganization: RequestHandler = validateBody(
  updateOrganizationSchema,
  async (req, res, input) => {
    const organization = await organizationService.updateOrganization(
      getAuth(req),
      getOrganizationId(req),
      input,
    );
    res.status(200).json({ status: "ok", data: { organization } });
  },
);
