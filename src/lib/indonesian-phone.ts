import { z } from "zod";

const indonesianNationalNumberPattern =
  /^(?:[2-7]\d{7,11}|8[1-9]\d{6,10}|9\d{7,11})$/;

export function normalizeIndonesianPhone(value: string): string | null {
  const phone = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(phone)) {
    return null;
  }

  let nationalNumber: string;
  if (phone.startsWith("+")) {
    if (!phone.startsWith("+62")) {
      return null;
    }
    nationalNumber = phone.slice(3);
    if (nationalNumber.startsWith("0") || nationalNumber.startsWith("62")) {
      return null;
    }
  } else if (phone.startsWith("62")) {
    nationalNumber = phone.slice(2);
    if (nationalNumber.startsWith("0") || nationalNumber.startsWith("62")) {
      return null;
    }
  } else if (phone.startsWith("0")) {
    nationalNumber = phone.slice(1);
    if (nationalNumber.startsWith("0") || nationalNumber.startsWith("62")) {
      return null;
    }
  } else {
    nationalNumber = phone;
  }

  if (!indonesianNationalNumberPattern.test(nationalNumber)) {
    return null;
  }

  return `+62${nationalNumber}`;
}

export const indonesianPhoneSchema = z.union([
  z.string().transform((value, context) => {
    if (value.trim() === "") {
      return null;
    }

    const normalized = normalizeIndonesianPhone(value);
    if (!normalized) {
      context.addIssue({
        code: "custom",
        message: "Nomor telepon Indonesia tidak valid.",
      });
      return z.NEVER;
    }
    return normalized;
  }),
  z.null(),
]);
