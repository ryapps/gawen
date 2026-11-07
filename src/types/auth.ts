import type {
  OrganizationBusinessType,
  OrganizationRole,
} from "../generated/prisma/enums.js";

export interface AuthMembership {
  id: string;
  role: OrganizationRole;
  organization: {
    id: string;
    name: string;
    timezone: string;
    businessType: OrganizationBusinessType | null;
    description: string | null;
    logoUrl: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    provinceCode: string | null;
    provinceName: string | null;
    regencyCode: string | null;
    regencyName: string | null;
    districtCode: string | null;
    districtName: string | null;
    villageCode: string | null;
    villageName: string | null;
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
