ALTER TABLE "SalonProfile" ALTER COLUMN "cancellationWindowHours" SET DEFAULT 24;
ALTER TABLE "SalonProfile" ADD COLUMN "cancellationLatePolicy" TEXT NOT NULL DEFAULT 'Please call the studio.';
UPDATE "SalonProfile" SET "cancellationWindowHours" = 24 WHERE "cancellationWindowHours" = 2;

ALTER TABLE "Appointment" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Appointment_tenantId_idempotencyKey_key" ON "Appointment"("tenantId", "idempotencyKey");
