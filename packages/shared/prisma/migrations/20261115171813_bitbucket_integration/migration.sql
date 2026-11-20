-- CreateEnum
CREATE TYPE "BitbucketAuthMode" AS ENUM ('oauth_consumer', 'app_password');

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "prCommentId" TEXT,
ADD COLUMN     "prCommentPostedAt" TIMESTAMP(3),
ADD COLUMN     "pullRequestId" INTEGER,
ADD COLUMN     "pullRequestUrl" TEXT;

-- CreateTable
CREATE TABLE "BitbucketConnection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "workspace" TEXT NOT NULL,
    "authMode" "BitbucketAuthMode" NOT NULL,
    "credentialsCiphertext" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "postPlanComments" BOOLEAN NOT NULL DEFAULT true,
    "autoPlanOnPr" BOOLEAN NOT NULL DEFAULT false,
    "defaultPlanEnvironment" "Environment" NOT NULL DEFAULT 'dev',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastTestAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BitbucketConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BitbucketWebhookDelivery" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL DEFAULT 'default',
    "event" TEXT NOT NULL,
    "deliveryId" TEXT,
    "repository" TEXT,
    "pullRequestId" INTEGER,
    "payload" JSONB,
    "result" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BitbucketWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BitbucketWebhookDelivery_createdAt_idx" ON "BitbucketWebhookDelivery"("createdAt");

-- CreateIndex
CREATE INDEX "BitbucketWebhookDelivery_event_idx" ON "BitbucketWebhookDelivery"("event");

-- CreateIndex
CREATE INDEX "Run_repository_pullRequestId_idx" ON "Run"("repository", "pullRequestId");

-- AddForeignKey
ALTER TABLE "BitbucketConnection" ADD CONSTRAINT "BitbucketConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BitbucketWebhookDelivery" ADD CONSTRAINT "BitbucketWebhookDelivery_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BitbucketConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
