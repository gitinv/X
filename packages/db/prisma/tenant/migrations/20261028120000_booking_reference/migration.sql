ALTER TABLE "Appointment" ADD COLUMN "reference" TEXT;
CREATE UNIQUE INDEX "Appointment_reference_key" ON "Appointment"("reference");
