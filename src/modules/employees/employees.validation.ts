import { z } from "zod";

export const listEmployeesQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const updateEmployeeSchema = z
  .object({
    position: z
      .string()
      .trim()
      .max(120)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export const updateEmployeeStatusSchema = z
  .object({
    status: z.enum(["ACTIVE", "INACTIVE"]),
  })
  .strict();

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type UpdateEmployeeStatusInput = z.infer<
  typeof updateEmployeeStatusSchema
>;

export const joinOrganizationSchema = z
  .object({
    businessCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{8}$/),
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
