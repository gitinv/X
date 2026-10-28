export interface PhotoViewer {
  role: string;
  tenantId: string | null;
  clientId: string | null;
}

export interface PhotoRecord {
  tenantId: string;
  clientId: string;
  deletedAt: Date | null;
}

export function canViewServicePhoto(viewer: PhotoViewer, photo: PhotoRecord): boolean {
  if (!viewer.tenantId || viewer.tenantId !== photo.tenantId) return false;
  if (photo.deletedAt && viewer.role !== "OWNER") return false;
  if (viewer.role === "CUSTOMER") return viewer.clientId === photo.clientId && !photo.deletedAt;
  return viewer.role === "TECHNICIAN" || viewer.role === "FRONT_DESK" || viewer.role === "MANAGER" || viewer.role === "OWNER";
}

export function canCaptureServicePhoto(input: {
  role: string;
  actorTenantId: string | null;
  customerTenantId: string;
  consentAt: Date | null;
  consentRequired: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const staff = input.role === "TECHNICIAN" || input.role === "FRONT_DESK" || input.role === "MANAGER" || input.role === "OWNER";
  if (!staff) return { ok: false, reason: "Only salon staff can take service photos." };
  if (!input.actorTenantId || input.actorTenantId !== input.customerTenantId) {
    return { ok: false, reason: "That customer belongs to another salon." };
  }
  if (input.consentRequired && !input.consentAt) {
    return { ok: false, reason: "This customer has not agreed to service photos yet." };
  }
  return { ok: true };
}

export function canSoftDeletePhoto(role: string): boolean {
  return role === "OWNER";
}
