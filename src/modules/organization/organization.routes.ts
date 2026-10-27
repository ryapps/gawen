import { Router } from "express";
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

export default router;
