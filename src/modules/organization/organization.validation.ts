import { z } from "zod";
import { OrganizationBusinessType } from "../../generated/prisma/enums.js";
import { indonesianPhoneSchema } from "../../lib/indonesian-phone.js";

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

function regionCode(pattern: RegExp) {
  return z.string().regex(pattern).nullable().optional();
}

function regionName(maximumLength: number) {
  return nullableText(maximumLength);
}

const regionCodePatterns = {
  province: /^\d{2}$/,
  regency: /^\d{2}\.\d{2}$/,
  district: /^\d{2}\.\d{2}\.\d{2}$/,
  village: /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/,
};

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    businessType: z.enum(OrganizationBusinessType).nullable().optional(),
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
    phone: indonesianPhoneSchema.optional(),
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
    provinceCode: regionCode(regionCodePatterns.province),
    provinceName: regionName(120),
    regencyCode: regionCode(regionCodePatterns.regency),
    regencyName: regionName(120),
    districtCode: regionCode(regionCodePatterns.district),
    districtName: regionName(120),
    villageCode: regionCode(regionCodePatterns.village),
    villageName: regionName(120),
    postalCode: nullableText(20),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine(isSupportedTimeZone)
      .optional(),
    setupStep: z.number().int().min(0).max(5).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const levels = [
      ["provinceCode", "provinceName"],
      ["regencyCode", "regencyName"],
      ["districtCode", "districtName"],
      ["villageCode", "villageName"],
    ] as const;

    for (const [codeKey, nameKey] of levels) {
      const code = value[codeKey];
      const name = value[nameKey];
      const codeProvided = code !== undefined;
      const nameProvided = name !== undefined;
      if (codeProvided !== nameProvided || (code === null) !== (name === null)) {
        context.addIssue({
          code: "custom",
          message: "Kode dan nama setiap wilayah harus diisi berpasangan.",
          path: [codeKey],
        });
      }
    }

    const hierarchy = [
      ["regencyCode", "provinceCode"],
      ["districtCode", "regencyCode"],
      ["villageCode", "districtCode"],
    ] as const;
    for (const [childKey, parentKey] of hierarchy) {
      const childCode = value[childKey];
      const parentCode = value[parentKey];
      if (childCode && !parentCode) {
        context.addIssue({
          code: "custom",
          message: "Pilih wilayah induk sebelum mengisi wilayah turunannya.",
          path: [parentKey],
        });
      } else if (
        childCode &&
        parentCode &&
        !childCode.startsWith(`${parentCode}.`)
      ) {
        context.addIssue({
          code: "custom",
          message: "Kode wilayah tidak sesuai dengan wilayah induknya.",
          path: [childKey],
        });
      }
    }
  })
  .refine((value) => Object.keys(value).length > 0);

export type UpdateOrganizationInput = z.infer<
  typeof updateOrganizationSchema
>;
