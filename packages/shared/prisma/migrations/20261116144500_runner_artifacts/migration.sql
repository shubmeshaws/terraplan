-- AlterTable Run: durable artifact keys + terraform version used
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "planFileKey" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "planJsonKey" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "logFileKey" TEXT;
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "terraformVersion" TEXT;

-- AlterTable EnvironmentConfig: pin terraform per environment
ALTER TABLE "EnvironmentConfig" ADD COLUMN IF NOT EXISTS "terraformVersion" TEXT NOT NULL DEFAULT '1.9.8';
