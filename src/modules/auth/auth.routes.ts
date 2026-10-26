import { Router } from "express";
import * as authController from "./auth.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { createAuthRateLimiter } from "../../middlewares/auth-rate-limit.middleware.js";

const router = Router();

router.post(
  "/register",
  createAuthRateLimiter("register-owner", 5, 60 * 60 * 1000),
  authController.registerOwner,
);
router.post(
  "/register/employee",
  createAuthRateLimiter("register-employee", 5, 60 * 60 * 1000),
  authController.registerEmployee,
);
router.post(
  "/login",
  createAuthRateLimiter("login", 10, 15 * 60 * 1000),
  authController.signIn,
);
router.get("/me", requireAuth, authController.profile);
router.post("/logout", requireAuth, authController.logout);

export default router;
