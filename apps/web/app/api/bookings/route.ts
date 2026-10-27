import { bookAppointment } from "@/lib/booking";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    serviceId?: string;
    technicianId?: string;
    locationSlug?: string;
    startIso?: string;
    name?: string;
    phone?: string;
    email?: string;
    notes?: string;
  } | null;
  const result = await bookAppointment({
    serviceId: String(body?.serviceId ?? ""),
    technicianId: String(body?.technicianId ?? ""),
    locationSlug: String(body?.locationSlug ?? ""),
    startIso: String(body?.startIso ?? ""),
    name: String(body?.name ?? ""),
    phone: String(body?.phone ?? ""),
    email: body?.email,
    notes: body?.notes,
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
