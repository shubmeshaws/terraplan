-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('dev', 'qa', 'uat', 'staging', 'prod');

-- CreateEnum
CREATE TYPE "RunAction" AS ENUM ('plan', 'apply', 'destroy');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('waiting_approval', 'queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "repository" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "action" "RunAction" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "triggeredBy" TEXT NOT NULL,
    "commitSha" TEXT,
    "approvedBy" TEXT,
    "planSummary" TEXT,
    "output" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentLock" (
    "environment" "Environment" NOT NULL,
    "runId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvironmentLock_pkey" PRIMARY KEY ("environment")
);

-- CreateIndex
CREATE INDEX "Run_environment_status_idx" ON "Run"("environment", "status");

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentLock_runId_key" ON "EnvironmentLock"("runId");

-- AddForeignKey
ALTER TABLE "EnvironmentLock" ADD CONSTRAINT "EnvironmentLock_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
