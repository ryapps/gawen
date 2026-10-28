import type { OrganizationRole } from "../generated/prisma/enums.js";

export interface AuthMembership {
  id: string;
  role: OrganizationRole;
  organization: {
    id: string;
    name: string;
    timezone: string;
    businessType: string | null;
    description: string | null;
    logoUrl: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    currency: string;
    setupCompletedAt: Date | null;
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  photoProfile: string | null;
  memberships: AuthMembership[];
}

export interface AuthContext {
  sessionId: string;
  user: AuthUser;
}
