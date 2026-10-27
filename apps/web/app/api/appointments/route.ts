import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";

// GET /api/appointments - list appointments for the current tenant
export async function GET() {
  try {
    const tenant = await getCurrentTenant();

    const appointments = await prisma.appointment.findMany({
      where: { tenantId: tenant.id },
      include: { technician: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(appointments);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch appointments" }, { status: 500 });
  }
}

// POST /api/appointments - create a new appointment
export async function POST(request: NextRequest) {
  try {
    const tenant = await getCurrentTenant();
    const body = await request.json();

    const {
      clientName,
      clientPhone,
      serviceName,
      technicianId,
      date,
      time,
      price,
    } = body;

    if (!clientName || !serviceName || !date || !time) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const appointment = await prisma.appointment.create({
      data: {
        clientName,
        clientPhone,
        serviceName,
        technicianId: technicianId || null,
        date,
        time,
        price: price || 0,
        status: "Confirmed",
        paymentStatus: "Unpaid",
        tenantId: tenant.id,
      },
    });

    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create appointment" }, { status: 500 });
  }
}
