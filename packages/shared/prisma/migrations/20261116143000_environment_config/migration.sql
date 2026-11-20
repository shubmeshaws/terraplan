-- CreateTable
CREATE TABLE "EnvironmentConfig" (
    "id" TEXT NOT NULL,
    "name" "Environment" NOT NULL,
    "displayName" TEXT,
    "repository" TEXT NOT NULL,
    "terraformDir" TEXT NOT NULL DEFAULT '.',
    "backendConfig" JSONB NOT NULL,
    "awsAccountId" TEXT NOT NULL,
    "roleArn" TEXT NOT NULL,
    "externalId" TEXT,
    "sessionDurationSeconds" INTEGER NOT NULL DEFAULT 3600,
    "variableFiles" JSONB NOT NULL DEFAULT '[]',
    "approvalPolicy" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastAssumedAt" TIMESTAMP(3),
    "lastAssumeError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentConfig_name_key" ON "EnvironmentConfig"("name");

-- CreateIndex
CREATE INDEX "EnvironmentConfig_awsAccountId_idx" ON "EnvironmentConfig"("awsAccountId");

-- CreateIndex
CREATE INDEX "EnvironmentConfig_enabled_idx" ON "EnvironmentConfig"("enabled");
