import { Router } from "express";
import * as employeesController from "./employees.controller.js";
import { requireAuth, requireOrganizationRole } from "../../middlewares/auth.middleware.js";
import { createAuthRateLimiter } from "../../middlewares/auth-rate-limit.middleware.js";

const router = Router();

router.use(requireAuth);
router.post(
  "/join-requests",
  createAuthRateLimiter("join-request", 5, 60 * 60 * 1000),
  employeesController.requestMembership,
);
router.get("/join-requests/me", employeesController.listOwnRequests);
router.get(
  "/organizations/:organizationId/join-requests",
  requireOrganizationRole("OWNER"),
  employeesController.listPendingRequests,
);
router.post(
  "/organizations/:organizationId/join-requests/:requestId/approve",
  requireOrganizationRole("OWNER"),
  employeesController.approveRequest,
);
router.post(
  "/organizations/:organizationId/join-requests/:requestId/reject",
  requireOrganizationRole("OWNER"),
  employeesController.rejectRequest,
);
router.post(
  "/organizations/:organizationId/business-code/rotate",
  requireOrganizationRole("OWNER"),
  createAuthRateLimiter("business-code-rotate", 5, 60 * 60 * 1000),
  employeesController.rotateBusinessCode,
);
router.post(
  "/organizations/:organizationId/invitations",
  requireOrganizationRole("OWNER"),
  createAuthRateLimiter("employee-invitation", 20, 60 * 60 * 1000),
  employeesController.createInvitation,
);
router.post(
  "/organizations/:organizationId/invitations/:invitationId/revoke",
  requireOrganizationRole("OWNER"),
  employeesController.revokeInvitation,
);
router.post(
  "/invitations/accept",
  createAuthRateLimiter("invitation-accept", 10, 15 * 60 * 1000),
  employeesController.acceptInvitation,
);

export default router;
