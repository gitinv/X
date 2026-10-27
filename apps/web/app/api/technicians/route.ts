import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";

// GET /api/technicians
export async function GET() {
  try {
    const tenant = await getCurrentTenant();

    const technicians = await prisma.technician.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(technicians);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch technicians" }, { status: 500 });
  }
}

// POST /api/technicians
export async function POST(request: NextRequest) {
  try {
    const tenant = await getCurrentTenant();
    const body = await request.json();

    const { name, role, avatar, specialties } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const technician = await prisma.technician.create({
      data: {
        name,
        role,
        avatar,
        specialties: specialties || [],
        tenantId: tenant.id,
      },
    });

    return NextResponse.json(technician, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create technician" }, { status: 500 });
  }
}
