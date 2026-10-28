-- Front desk tickets, shifts, tips, discounts, and refunds.
ALTER TYPE "AppointmentStatus" ADD VALUE 'READY';
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIAL';

CREATE TYPE "ServiceKind" AS ENUM ('SERVICE', 'ADDON');

ALTER TABLE "Service" ADD COLUMN "kind" "ServiceKind" NOT NULL DEFAULT 'SERVICE';
ALTER TABLE "SalonProfile" ALTER COLUMN "timezone" SET DEFAULT 'America/New_York';

CREATE TABLE "AppointmentLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ServiceKind" NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AppointmentLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order" ADD COLUMN "subtotalCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "tipCents" INTEGER NOT NULL DEFAULT 0;
UPDATE "Order" SET "subtotalCents" = "totalCents" WHERE "subtotalCents" = 0;

INSERT INTO "AppointmentLine" ("id", "tenantId", "appointmentId", "serviceId", "name", "kind", "priceCents", "durationMin", "sortOrder")
SELECT gen_random_uuid()::text, a."tenantId", a."id", a."serviceId", s."name", s."kind", s."priceCents", s."durationMin", 0
FROM "Appointment" a
JOIN "Service" s ON s."id" = a."serviceId"
WHERE NOT EXISTS (SELECT 1 FROM "AppointmentLine" l WHERE l."appointmentId" = a."id");

CREATE INDEX "AppointmentLine_tenantId_appointmentId_idx" ON "AppointmentLine"("tenantId", "appointmentId");
CREATE UNIQUE INDEX "Shift_technicianId_locationId_dayOfWeek_key" ON "Shift"("technicianId", "locationId", "dayOfWeek");
CREATE INDEX "Shift_tenantId_locationId_dayOfWeek_idx" ON "Shift"("tenantId", "locationId", "dayOfWeek");
CREATE INDEX "Refund_tenantId_createdAt_idx" ON "Refund"("tenantId", "createdAt");
CREATE INDEX "AuditEvent_tenantId_createdAt_idx" ON "AuditEvent"("tenantId", "createdAt");

ALTER TABLE "AppointmentLine" ADD CONSTRAINT "AppointmentLine_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentLine" ADD CONSTRAINT "AppointmentLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "SalonProfile"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "SalonProfile"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClientFavorite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientFavorite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientFavorite_clientId_technicianId_key" ON "ClientFavorite"("clientId", "technicianId");
CREATE INDEX "ClientFavorite_tenantId_clientId_idx" ON "ClientFavorite"("tenantId", "clientId");
ALTER TABLE "ClientFavorite" ADD CONSTRAINT "ClientFavorite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientFavorite" ADD CONSTRAINT "ClientFavorite_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;
