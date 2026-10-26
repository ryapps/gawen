import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(12).max(128);

export const registerOwnerSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: emailSchema,
    password: passwordSchema,
    organizationName: z.string().trim().min(2).max(120),
  })
  .strict();

export const registerEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export type RegisterOwnerInput = z.infer<typeof registerOwnerSchema>;
export type RegisterEmployeeInput = z.infer<typeof registerEmployeeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
