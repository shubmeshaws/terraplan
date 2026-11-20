-- Environment names are free-form (no longer a fixed enum).
ALTER TABLE "Run" ALTER COLUMN "environment" TYPE TEXT USING "environment"::text;
ALTER TABLE "EnvironmentLock" ALTER COLUMN "environment" TYPE TEXT USING "environment"::text;
ALTER TABLE "RoleAssignment" ALTER COLUMN "environment" TYPE TEXT USING "environment"::text;
ALTER TABLE "AuditLog" ALTER COLUMN "environment" TYPE TEXT USING "environment"::text;
ALTER TABLE "EnvironmentConfig" ALTER COLUMN "name" TYPE TEXT USING "name"::text;
ALTER TABLE "BitbucketConnection" ALTER COLUMN "defaultPlanEnvironment" DROP DEFAULT;
ALTER TABLE "BitbucketConnection" ALTER COLUMN "defaultPlanEnvironment" TYPE TEXT USING "defaultPlanEnvironment"::text;
ALTER TABLE "BitbucketConnection" ALTER COLUMN "defaultPlanEnvironment" SET DEFAULT 'dev';
DROP TYPE "Environment";
