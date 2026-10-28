import { z } from "zod";

function nullableText(maximumLength: number) {
  return z
    .string()
    .trim()
    .max(maximumLength)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

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
    businessType: nullableText(80),
    description: nullableText(2000),
    logoUrl: z
      .string()
      .trim()
      .max(2048)
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().url().refine(isHttpUrl).nullable())
      .nullable()
      .optional(),
    email: z
      .string()
      .trim()
      .max(254)
      .transform((value) => (value === "" ? null : value.toLowerCase()))
      .pipe(z.string().email().nullable())
      .nullable()
      .optional(),
    phone: nullableText(32),
    website: z
      .string()
      .trim()
      .max(2048)
      .transform((value) => (value === "" ? null : value))
      .pipe(z.string().url().refine(isHttpUrl).nullable())
      .nullable()
      .optional(),
    address: nullableText(255),
    city: nullableText(120),
    province: nullableText(120),
    postalCode: nullableText(20),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
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
