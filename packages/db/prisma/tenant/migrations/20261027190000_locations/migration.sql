-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'MANAGER';

-- DropIndex
DROP INDEX "Appointment_tenantId_startAt_idx";

-- DropIndex
DROP INDEX "BusinessHour_tenantId_dayOfWeek_key";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BusinessHour" ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "lastLocationId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "locationId" TEXT NOT NULL,
ADD COLUMN     "registerId" TEXT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "lowStockAlert",
DROP COLUMN "stock";

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "timezone" TEXT NOT NULL,
    "brandColor" TEXT,
    "accentColor" TEXT,
    "tagline" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "subdomain" TEXT,
    "customDomain" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "priceCents" INTEGER,
    "durationMin" INTEGER,

    CONSTRAINT "ServiceLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "lowStockAlert" INTEGER NOT NULL,

    CONSTRAINT "LocationStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Register" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TechnicianLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_customDomain_idx" ON "Location"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Location_tenantId_slug_key" ON "Location"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Location_tenantId_subdomain_key" ON "Location"("tenantId", "subdomain");

-- CreateIndex
CREATE INDEX "StaffAssignment_tenantId_locationId_idx" ON "StaffAssignment"("tenantId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAssignment_userId_locationId_key" ON "StaffAssignment"("userId", "locationId");

-- CreateIndex
CREATE INDEX "ServiceLocation_tenantId_locationId_idx" ON "ServiceLocation"("tenantId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceLocation_serviceId_locationId_key" ON "ServiceLocation"("serviceId", "locationId");

-- CreateIndex
CREATE INDEX "LocationStock_tenantId_locationId_idx" ON "LocationStock"("tenantId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationStock_locationId_productId_key" ON "LocationStock"("locationId", "productId");

-- CreateIndex
CREATE INDEX "Register_tenantId_locationId_idx" ON "Register"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "TechnicianLocation_tenantId_locationId_idx" ON "TechnicianLocation"("tenantId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianLocation_technicianId_locationId_key" ON "TechnicianLocation"("technicianId", "locationId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_locationId_startAt_idx" ON "Appointment"("tenantId", "locationId", "startAt");

-- CreateIndex
CREATE INDEX "BusinessHour_tenantId_idx" ON "BusinessHour"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHour_locationId_dayOfWeek_key" ON "BusinessHour"("locationId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "SalonProfile"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "SalonProfile"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessHour" ADD CONSTRAINT "BusinessHour_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLocation" ADD CONSTRAINT "ServiceLocation_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLocation" ADD CONSTRAINT "ServiceLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationStock" ADD CONSTRAINT "LocationStock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationStock" ADD CONSTRAINT "LocationStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Register" ADD CONSTRAINT "Register_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianLocation" ADD CONSTRAINT "TechnicianLocation_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianLocation" ADD CONSTRAINT "TechnicianLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_lastLocationId_fkey" FOREIGN KEY ("lastLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "Register"("id") ON DELETE SET NULL ON UPDATE CASCADE;

