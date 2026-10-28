import { z } from "zod";
import { indonesianPhoneSchema } from "../../lib/indonesian-phone.js";

export const updateUserProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: indonesianPhoneSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
