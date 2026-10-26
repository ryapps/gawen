import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import type { OrganizationRole } from "../generated/prisma/enums.js";
import { HttpError } from "../lib/http-error.js";
import prisma from "../lib/prisma.js";

const bearerTokenPattern = /^Bearer ([A-Za-z0-9_-]{43})$/i;

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const authorization = req.get("authorization");
  const match = authorization ? bearerTokenPattern.exec(authorization) : null;

  if (!match) {
    return next(new HttpError(401, "Autentikasi diperlukan."));
  }

  const tokenHash = createHash("sha256").update(match[1]).digest("hex");
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          memberships: {
            select: {
              id: true,
              role: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  timezone: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return next(new HttpError(401, "Autentikasi diperlukan."));
  }

  req.auth = {
    sessionId: session.id,
    user: session.user,
  };
  return next();
};

export function requireOrganizationRole(
  ...allowedRoles: OrganizationRole[]
): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      return next(new HttpError(401, "Autentikasi diperlukan."));
    }

    const organizationId = req.params.organizationId;
    if (typeof organizationId !== "string" || !organizationId) {
      return next(new HttpError(400, "Organisasi tidak valid."));
    }

    const membership = req.auth.user.memberships.find(
      (item) =>
        item.organization.id === organizationId &&
        allowedRoles.includes(item.role),
    );

    if (!membership) {
      return next(new HttpError(403, "Anda tidak memiliki akses."));
    }

    return next();
  };
}