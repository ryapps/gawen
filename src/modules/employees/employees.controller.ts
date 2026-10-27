import type { RequestHandler } from "express";
import type { AuthContext } from "../../types/auth.js";
import { HttpError } from "../../lib/http-error.js";
import { validateBody } from "../../middlewares/validate.middleware.js";
import * as employeesService from "./employees.service.js";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  joinOrganizationSchema,
} from "./employees.validation.js";

type AuthenticatedRequest = Parameters<RequestHandler>[0] & {
  auth?: AuthContext;
};

function getAuth(req: AuthenticatedRequest) {
  if (!req.auth) {
    throw new HttpError(401, "Autentikasi diperlukan.");
  }
  return req.auth;
}

function getRouteParam(
  req: Parameters<RequestHandler>[0],
  name: string,
  message: string,
): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) {
    throw new HttpError(400, message);
  }
  return value;
}

export const requestMembership: RequestHandler = validateBody(
  joinOrganizationSchema,
  async (req, res, input) => {
    await employeesService.requestMembership(getAuth(req), input);
    res.status(202).json({
      status: "ok",
      message:
        "Jika kode bisnis valid dan belum ada permintaan, permintaan akan diproses.",
    });
  },
);

export const listOwnRequests: RequestHandler = async (req, res) => {
  const requests = await employeesService.listOwnRequests(getAuth(req));
  res.status(200).json({ status: "ok", data: { requests } });
};

export const listOrganizationMembers: RequestHandler = async (req, res) => {
  const organizationId = getRouteParam(req, "organizationId", "Organisasi tidak valid.");
  const members =
    await employeesService.listOrganizationMembers(organizationId);
  res.status(200).json({ status: "ok", data: { members } });
};

export const getOrganizationMember: RequestHandler = async (req, res) => {
  const organizationId = getRouteParam(req, "organizationId", "Organisasi tidak valid.");
  const membershipId = getRouteParam(req, "membershipId", "Anggota tidak valid.");
  const member = await employeesService.getOrganizationMember(
    organizationId,
    membershipId,
  );
  res.status(200).json({ status: "ok", data: { member } });
};

export const listPendingRequests: RequestHandler = async (req, res) => {
  const organizationId = getRouteParam(req, "organizationId", "Organisasi tidak valid.");
  const requests = await employeesService.listPendingRequests(organizationId);
  res.status(200).json({ status: "ok", data: { requests } });
};

function decide(approve: boolean): RequestHandler {
  return async (req, res) => {
    const organizationId = getRouteParam(req, "organizationId", "Permintaan tidak valid.");
    const requestId = getRouteParam(req, "requestId", "Permintaan tidak valid.");
    const result = await employeesService.decideRequest(
      getAuth(req),
      organizationId,
      requestId,
      approve,
    );
    res.status(200).json({ status: "ok", data: result });
  };
}

export const approveRequest = decide(true);
export const rejectRequest = decide(false);

export const rotateBusinessCode: RequestHandler = async (req, res) => {
  const organizationId = getRouteParam(req, "organizationId", "Organisasi tidak valid.");
  const result = await employeesService.rotateBusinessCode(
    getAuth(req),
    organizationId,
  );
  res.status(200).json({ status: "ok", data: result });
};

export const createInvitation: RequestHandler = validateBody(
  createInvitationSchema,
  async (req, res, input) => {
    const organizationId = getRouteParam(req, "organizationId", "Organisasi tidak valid.");
    const invitation = await employeesService.createInvitation(
      getAuth(req),
      organizationId,
      input,
    );
    res.status(201).json({ status: "ok", data: { invitation } });
  },
);

export const revokeInvitation: RequestHandler = async (req, res) => {
  const organizationId = getRouteParam(req, "organizationId", "Organisasi tidak valid.");
  const invitationId = getRouteParam(req, "invitationId", "Undangan tidak valid.");
  const result = await employeesService.revokeInvitation(
    getAuth(req),
    organizationId,
    invitationId,
  );
  res.status(200).json({ status: "ok", data: result });
};

export const acceptInvitation: RequestHandler = validateBody(
  acceptInvitationSchema,
  async (req, res, input) => {
    const result = await employeesService.acceptInvitation(
      getAuth(req),
      input,
    );
    res.status(200).json({ status: "ok", data: result });
  },
);
