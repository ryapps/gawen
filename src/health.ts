import { Router } from "express";
import prisma from "./lib/prisma.js";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "gawen-api",
    timestamp: new Date().toISOString(),
  });
});

router.get("/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", database: "connected" });
  } catch (error) {
    const errorName =
      error instanceof Error ? error.name : "Unknown database error";
    console.error(`Database health check failed: ${errorName}`);
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

export default router;
