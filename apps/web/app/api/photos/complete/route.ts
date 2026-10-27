import { getSession } from "@/lib/auth/session";
import { getPublicTenant } from "@/lib/tenant";
import { canAccessLocation, canCaptureServicePhoto } from "@redlady/core";
import { z } from "zod";

const bodySchema = z.object({
  appointmentId: z.string().min(1),
  label: z.enum(["BEFORE", "AFTER", "OTHER"]),
  note: z.string().max(400).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  originalKey: z.string().min(1),
  displayKey: z.string().min(1),
  thumbKey: z.string().min(1),
  contentType: z.string().default("image/jpeg"),
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
  const prefix = `tenants/${salon.id}/customers/${visit.clientId}/appointments/${visit.id}/`;
  if (![parsed.data.originalKey, parsed.data.displayKey, parsed.data.thumbKey].every((key) => key.startsWith(prefix))) {
    return Response.json({ error: "That photo does not belong to this visit." }, { status: 400 });
  }
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
  const photo = await salon.db.servicePhoto.create({
    data: {
      tenantId: salon.id,
      clientId: visit.clientId,
      appointmentId: visit.id,
      serviceId: visit.serviceId,
      label: parsed.data.label,
      note: parsed.data.note,
      uploadedById: user.id,
      originalKey: parsed.data.originalKey,
      displayKey: parsed.data.displayKey,
      thumbKey: parsed.data.thumbKey,
      sha256: parsed.data.sha256.toLowerCase(),
      contentType: parsed.data.contentType,
    },
  });
  return Response.json({ id: photo.id });
}
