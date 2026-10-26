import { z } from "zod";

export const joinOrganizationSchema = z
  .object({
    businessCode: z.string().trim().min(12).max(64).regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export const createInvitationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(43).max(64).regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export type JoinOrganizationInput = z.infer<typeof joinOrganizationSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
