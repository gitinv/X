import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";

// GET /api/products - list products for the current tenant
export async function GET() {
  try {
    const tenant = await getCurrentTenant();

    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

// POST /api/products - create a product
export async function POST(request: NextRequest) {
  try {
    const tenant = await getCurrentTenant();
    const body = await request.json();

    const { name, category, price, stock, lowStockAlert, description, image } = body;

    if (!name || price === undefined) {
      return NextResponse.json({ error: "Name and price are required" }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        name,
        category: category || "General",
        price: Number(price),
        stock: stock ? Number(stock) : 0,
        lowStockAlert: lowStockAlert ? Number(lowStockAlert) : 5,
        description,
        image,
        tenantId: tenant.id,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
