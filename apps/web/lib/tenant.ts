import { headers } from "next/headers";
import { prisma } from "./db";

export async function getCurrentTenant() {
  const headersList = headers();
  const slug = headersList.get("x-tenant-slug") || "default";

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
  });

  if (!tenant) {
    return prisma.tenant.upsert({
      where: { slug: "default" },
      update: {},
      create: {
        slug: "default",
        name: "The Red Lady Spa",
      },
    });
  }

  return tenant;
}
