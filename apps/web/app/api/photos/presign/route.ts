import { getSession } from "@/lib/auth/session";
import { createUploadTarget } from "@/lib/photos/storage";
import { getPublicTenant } from "@/lib/tenant";
import { canAccessLocation, canCaptureServicePhoto } from "@redlady/core";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const bodySchema = z.object({
  appointmentId: z.string().min(1),
  label: z.enum(["BEFORE", "AFTER", "OTHER"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  contentType: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getSession();
  const salon = await getPublicTenant();
  if (!session?.tenantId || !salon || salon.id !== session.tenantId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const user = await salon.db.user.findUnique({ where: { id: session.userId }, include: { assignments: true } });
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the photo details." }, { status: 400 });
  const visit = await salon.db.appointment.findFirst({
    where: { id: parsed.data.appointmentId, tenantId: salon.id },
    include: { client: true },
  });
  if (!visit) return Response.json({ error: "That visit is not on this salon's book." }, { status: 404 });
  if (!canAccessLocation({ role: user.role, memberships: user.assignments, locationId: visit.locationId })) {
    return Response.json({ error: "That location is outside your access." }, { status: 403 });
  }
  const profile = await salon.db.salonProfile.findUnique({ where: { tenantId: salon.id } });
  const decision = canCaptureServicePhoto({
    role: user.role,
    actorTenantId: user.tenantId,
    customerTenantId: visit.tenantId,
    consentAt: visit.client.photoConsentAt,
    consentRequired: profile?.photoConsentRequired ?? true,
  });
  if (!decision.ok) return Response.json({ error: decision.reason }, { status: 403 });
  const id = randomUUID();
  const base = `tenants/${salon.id}/customers/${visit.clientId}/appointments/${visit.id}/${id}`;
  const contentType = parsed.data.contentType.startsWith("image/") ? "image/jpeg" : "image/jpeg";
  const [original, display, thumb] = await Promise.all([
    createUploadTarget(`${base}.jpg`, contentType, parsed.data.sha256),
    createUploadTarget(`${base}-display.jpg`, "image/jpeg"),
    createUploadTarget(`${base}-thumb.jpg`, "image/jpeg"),
  ]);
  return Response.json({ original, display, thumb, label: parsed.data.label });
}
