export class TenantIsolationError extends Error {
  constructor(message = "That record belongs to another salon.") {
    super(message);
    this.name = "TenantIsolationError";
  }
}

export function requireTenantId(tenantId: string | null | undefined): string {
  if (!tenantId) {
    throw new TenantIsolationError("A salon is required for this request.");
  }
  return tenantId;
}

export function scopeWhere<T extends Record<string, unknown>>(tenantId: string | null | undefined, where?: T) {
  return { ...where, tenantId: requireTenantId(tenantId) };
}

export function assertSameTenant(actorTenantId: string | null | undefined, resourceTenantId: string) {
  const tenantId = requireTenantId(actorTenantId);
  if (tenantId !== resourceTenantId) {
    throw new TenantIsolationError();
  }
}
