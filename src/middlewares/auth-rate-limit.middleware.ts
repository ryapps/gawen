import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import prisma from "../lib/prisma.js";

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

function scheduleExpiredDataCleanup(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupAt = now;
  const retentionCutoff = new Date(now - RETENTION_MS);

  void prisma
    .$transaction([
      prisma.authRateLimitBucket.deleteMany({
        where: { windowStartedAt: { lt: retentionCutoff } },
      }),
      prisma.authSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: retentionCutoff } },
            { revokedAt: { lt: retentionCutoff } },
          ],
        },
      }),
    ])
    .catch(() => {
      console.error("Expired authentication data cleanup failed.");
    });
}

export function createAuthRateLimiter(
  routeKey: string,
  maximumRequests: number,
  windowMs: number,
): RequestHandler {
  return async (req, res, next) => {
    const now = Date.now();
    scheduleExpiredDataCleanup(now);

    const clientAddress = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const bucketKey = createHash("sha256")
      .update(`${routeKey}:${clientAddress}`)
      .digest("hex");
    const currentTime = new Date(now);
    const expiredWindowCutoff = new Date(now - windowMs);
    const [bucket] = await prisma.$queryRaw<
      { count: number; windowStartedAt: Date }[]
    >`
      INSERT INTO "AuthRateLimitBucket"
        ("bucketKey", "count", "windowStartedAt", "updatedAt")
      VALUES
        (${bucketKey}, 1, ${currentTime}, ${currentTime})
      ON CONFLICT ("bucketKey") DO UPDATE SET
        "count" = CASE
          WHEN "AuthRateLimitBucket"."windowStartedAt" <= ${expiredWindowCutoff}
          THEN 1
          ELSE "AuthRateLimitBucket"."count" + 1
        END,
        "windowStartedAt" = CASE
          WHEN "AuthRateLimitBucket"."windowStartedAt" <= ${expiredWindowCutoff}
          THEN ${currentTime}
          ELSE "AuthRateLimitBucket"."windowStartedAt"
        END,
        "updatedAt" = ${currentTime}
      RETURNING "count", "windowStartedAt"
    `;

    if (bucket.count > maximumRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          (bucket.windowStartedAt.getTime() + windowMs - now) / 1000,
        ),
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        status: "error",
        message: "Terlalu banyak permintaan. Coba lagi nanti.",
      });
    }

    return next();
  };
}
