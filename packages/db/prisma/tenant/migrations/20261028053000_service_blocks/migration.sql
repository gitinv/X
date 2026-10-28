-- Every service keeps a positive duration. A zero or missing value is logged and set to 30 minutes.
DO $$
DECLARE
  row record;
BEGIN
  FOR row IN SELECT id, name, "durationMin" FROM "Service" WHERE "durationMin" IS NULL OR "durationMin" <= 0 LOOP
    RAISE NOTICE 'Backfill service duration: % (%) was %, set to 30', row.name, row.id, row."durationMin";
  END LOOP;
  UPDATE "Service" SET "durationMin" = 30 WHERE "durationMin" IS NULL OR "durationMin" <= 0;

  FOR row IN SELECT id, "serviceId", "durationMin" FROM "ServiceLocation" WHERE "durationMin" IS NOT NULL AND "durationMin" <= 0 LOOP
    RAISE NOTICE 'Backfill location duration override: service % row % was %, set to 30', row."serviceId", row.id, row."durationMin";
  END LOOP;
  UPDATE "ServiceLocation" SET "durationMin" = 30 WHERE "durationMin" IS NOT NULL AND "durationMin" <= 0;

  FOR row IN SELECT id, name, "durationMin" FROM "AppointmentLine" WHERE "durationMin" IS NULL OR "durationMin" <= 0 LOOP
    RAISE NOTICE 'Backfill visit line duration: % (%) was %, set to 30', row.name, row.id, row."durationMin";
  END LOOP;
  UPDATE "AppointmentLine" SET "durationMin" = 30 WHERE "durationMin" IS NULL OR "durationMin" <= 0;
END $$;

ALTER TABLE "Service" ADD COLUMN "bufferMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ServiceLocation" ADD COLUMN "bufferMin" INTEGER;
ALTER TABLE "AppointmentLine" ADD COLUMN "bufferMin" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Service" ADD CONSTRAINT "Service_durationMin_check" CHECK ("durationMin" > 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_bufferMin_check" CHECK ("bufferMin" >= 0);
ALTER TABLE "ServiceLocation" ADD CONSTRAINT "ServiceLocation_durationMin_check" CHECK ("durationMin" IS NULL OR "durationMin" > 0);
ALTER TABLE "ServiceLocation" ADD CONSTRAINT "ServiceLocation_bufferMin_check" CHECK ("bufferMin" IS NULL OR "bufferMin" >= 0);
ALTER TABLE "AppointmentLine" ADD CONSTRAINT "AppointmentLine_durationMin_check" CHECK ("durationMin" > 0);
ALTER TABLE "AppointmentLine" ADD CONSTRAINT "AppointmentLine_bufferMin_check" CHECK ("bufferMin" >= 0);

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_technician_time_excl"
  EXCLUDE USING gist ("technicianId" WITH =, tsrange("startAt", "endAt", '[)') WITH &&)
  WHERE ("status" NOT IN ('CANCELLED'::"AppointmentStatus", 'NO_SHOW'::"AppointmentStatus"));
