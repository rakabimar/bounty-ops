-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "intakeSource" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "policyHash" TEXT,
ADD COLUMN     "rawPolicyText" TEXT,
ALTER COLUMN "status" SET DEFAULT 'active',
ALTER COLUMN "huntingStatus" SET DEFAULT 'ongoing';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'admin';

-- CreateTable
CREATE TABLE "ProgramScope" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "normalizedAsset" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "isInScope" BOOLEAN NOT NULL,
    "bountyEligible" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRules" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "automationAllowed" TEXT NOT NULL DEFAULT 'unknown',
    "aggressiveAllowed" BOOLEAN NOT NULL DEFAULT false,
    "rateLimitRps" INTEGER,
    "maxConcurrency" INTEGER,
    "forbiddenActions" JSONB,
    "authTestingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "dosTestingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramHeader" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "programId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramScope_programId_idx" ON "ProgramScope"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramRules_programId_key" ON "ProgramRules"("programId");

-- CreateIndex
CREATE INDEX "ProgramHeader_programId_idx" ON "ProgramHeader"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "AuditLog_programId_idx" ON "AuditLog"("programId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ProgramScope" ADD CONSTRAINT "ProgramScope_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRules" ADD CONSTRAINT "ProgramRules_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramHeader" ADD CONSTRAINT "ProgramHeader_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
