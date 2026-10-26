import type { OrganizationRole } from "../generated/prisma/enums.js";

export interface AuthMembership {
  id: string;
  role: OrganizationRole;
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  memberships: AuthMembership[];
}

export interface AuthContext {
  sessionId: string;
  user: AuthUser;
}
