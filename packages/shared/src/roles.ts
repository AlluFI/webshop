export const CUSTOMER_ROLE = "customer";
export const STAFF_ROLES = ["admin", "support", "sales"] as const;
export const ALL_ROLES = ["customer", "admin", "support", "sales"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type AppRole = (typeof ALL_ROLES)[number];

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export const ADMIN_PERMISSIONS = {
  catalog: ["admin", "sales"],
  orders: ["admin", "support", "sales"],
  refunds: ["admin", "support"],
  users: ["admin"],
  reviews: ["admin", "support"],
  shipping: ["admin", "sales"],
  audit: ["admin", "support", "sales"],
} as const;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

export function can(role: string, permission: AdminPermission) {
  return (ADMIN_PERMISSIONS[permission] as readonly string[]).includes(role);
}

/** Seeded staff TOTP secret (Google Authenticator compatible). Documented in README. */
export const DEMO_ADMIN_TOTP_SECRET = "DEMOADMIN2FASECRETKEYAA";
