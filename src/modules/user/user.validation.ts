import { z } from "zod";
import { indonesianPhoneSchema } from "../../lib/indonesian-phone.js";

const photoProfileSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => (value === "" ? null : value))
  .pipe(
    z
      .string()
      .url()
      .refine((value) => {
        try {
          const protocol = new URL(value).protocol;
          return protocol === "http:" || protocol === "https:";
        } catch {
          return false;
        }
      })
      .nullable(),
  )
  .nullable();

export const updateUserProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: indonesianPhoneSchema.optional(),
    photoProfile: photoProfileSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
