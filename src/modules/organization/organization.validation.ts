import { z } from "zod";

function isSupportedTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine(isSupportedTimeZone)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export type UpdateOrganizationInput = z.infer<
  typeof updateOrganizationSchema
>;
