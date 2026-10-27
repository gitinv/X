-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "extraLocationPriceCents" INTEGER NOT NULL DEFAULT 4900,
ADD COLUMN     "includedLocations" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "TenantDomain" ADD COLUMN     "locationSlug" TEXT;

