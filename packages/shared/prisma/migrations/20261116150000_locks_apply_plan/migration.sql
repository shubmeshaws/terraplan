-- AlterTable Run: link apply runs to the exact saved plan
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "sourcePlanRunId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Run"
    ADD CONSTRAINT "Run_sourcePlanRunId_fkey"
    FOREIGN KEY ("sourcePlanRunId") REFERENCES "Run"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Run_sourcePlanRunId_idx" ON "Run"("sourcePlanRunId");
