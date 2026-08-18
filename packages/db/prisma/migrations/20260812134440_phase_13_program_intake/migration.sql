-- CreateTable
CREATE TABLE "ProgramIntakeRun" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "platform" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "parserConfidence" INTEGER NOT NULL DEFAULT 0,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "sourceContentHash" TEXT,
    "error" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProgramIntakeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramIntakeProposal" (
    "id" TEXT NOT NULL,
    "intakeRunId" TEXT NOT NULL,
    "structuredData" JSONB NOT NULL,
    "deterministicData" JSONB,
    "aiData" JSONB,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramIntakeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "requestId" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorCategory" TEXT,
    "estimatedCostUsd" DECIMAL(12,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramIntakeRun_programId_idx" ON "ProgramIntakeRun"("programId");

-- CreateIndex
CREATE INDEX "ProgramIntakeRun_platform_idx" ON "ProgramIntakeRun"("platform");

-- CreateIndex
CREATE INDEX "ProgramIntakeRun_status_idx" ON "ProgramIntakeRun"("status");

-- CreateIndex
CREATE INDEX "ProgramIntakeRun_createdAt_idx" ON "ProgramIntakeRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramIntakeProposal_intakeRunId_key" ON "ProgramIntakeProposal"("intakeRunId");

-- CreateIndex
CREATE INDEX "AiUsageLog_provider_idx" ON "AiUsageLog"("provider");

-- CreateIndex
CREATE INDEX "AiUsageLog_purpose_idx" ON "AiUsageLog"("purpose");

-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ProgramIntakeRun" ADD CONSTRAINT "ProgramIntakeRun_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramIntakeProposal" ADD CONSTRAINT "ProgramIntakeProposal_intakeRunId_fkey" FOREIGN KEY ("intakeRunId") REFERENCES "ProgramIntakeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
