import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import multer from "multer";
import * as userController from "./user.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/me", userController.getMe);
router.patch("/me", userController.updateMe);
router.post(
  "/profile/avatar",
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }).single("avatar"),
  userController.uploadAvatar,
);

export default router;
