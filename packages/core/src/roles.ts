export const ROLES = ["CUSTOMER", "TECHNICIAN", "FRONT_DESK", "MANAGER", "OWNER", "PLATFORM_ADMIN"] as const;

export type Role = (typeof ROLES)[number];

export type StaffArea = "pos" | "tech" | "admin" | "catalog" | "platform";

const AREA_ROLES: Record<StaffArea, readonly Role[]> = {
  pos: ["FRONT_DESK", "MANAGER", "OWNER"],
  tech: ["TECHNICIAN", "FRONT_DESK", "MANAGER", "OWNER"],
  admin: ["MANAGER", "OWNER"],
  catalog: ["FRONT_DESK", "MANAGER", "OWNER"],
  platform: ["PLATFORM_ADMIN"],
};

export function homeForRole(role: Role): string {
  switch (role) {
    case "CUSTOMER":
      return "/";
    case "TECHNICIAN":
      return "/tech";
    case "FRONT_DESK":
      return "/pos";
    case "MANAGER":
      return "/pos";
    case "OWNER":
      return "/admin";
    case "PLATFORM_ADMIN":
      return "/platform";
  }
}

export function roleCan(role: Role, area: StaffArea): boolean {
  return AREA_ROLES[area].includes(role);
}

export function areaForPath(pathname: string): StaffArea | "account" | null {
  if (pathname === "/pos" || pathname.startsWith("/pos/") || pathname.startsWith("/api/pos")) return "pos";
  if (pathname === "/tech" || pathname.startsWith("/tech/") || pathname.startsWith("/api/tech")) return "tech";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/catalog" || pathname.startsWith("/catalog/") || pathname.startsWith("/api/catalog")) return "catalog";
  if (pathname === "/platform" || pathname.startsWith("/platform/")) return "platform";
  if (pathname === "/account" || pathname.startsWith("/account/")) return "account";
  return null;
}
