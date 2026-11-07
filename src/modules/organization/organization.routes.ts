import { Router } from "express";
import multer from "multer";
import { requireAuth, requireOrganizationRole } from "../../middlewares/auth.middleware.js";
import * as organizationController from "./organization.controller.js";

const router = Router();

router.use(requireAuth);
router.get(
  "/:organizationId",
  requireOrganizationRole("OWNER", "EMPLOYEE"),
  organizationController.getOrganization,
);
router.patch(
  "/:organizationId",
  requireOrganizationRole("OWNER"),
  organizationController.updateOrganization,
);
router.post(
  "/:organizationId/logo",
  requireOrganizationRole("OWNER"),
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }).single("logo"),
  organizationController.uploadOrganizationLogo,
);
router.post(
  "/:organizationId/setup/complete",
  requireOrganizationRole("OWNER"),
  organizationController.completeOrganizationSetup,
);

export default router;
