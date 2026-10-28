import prisma from "../../lib/prisma.js";
import type { UpdateUserProfileInput } from "./user.validation.js";

const userProfileSelect = {
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
          businessType: true,
          description: true,
          logoUrl: true,
          email: true,
          phone: true,
          website: true,
          address: true,
          city: true,
          province: true,
          postalCode: true,
          currency: true,
          setupCompletedAt: true,
        },
      },
    },
  },
} as const;

export function findProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: userProfileSelect,
  });
}

export function updateProfile(userId: string, input: UpdateUserProfileInput) {
  return prisma.user.update({
    where: { id: userId },
    data: input,
    select: userProfileSelect,
  });
}
