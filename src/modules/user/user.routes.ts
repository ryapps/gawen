import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import * as userController from "./user.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/me", userController.getMe);
router.patch("/me", userController.updateMe);

export default router;
