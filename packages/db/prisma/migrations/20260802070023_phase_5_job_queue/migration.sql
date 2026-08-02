-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "manualApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requestedByUserId" TEXT,
ADD COLUMN     "scopeGuardDecision" JSONB,
ADD COLUMN     "stage" TEXT,
ADD COLUMN     "target" TEXT,
ALTER COLUMN "status" SET DEFAULT 'queued';

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "programId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "error" TEXT,
    "logs" JSONB,
    "resultSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolRun" (
    "id" TEXT NOT NULL,
    "jobRunId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "command" TEXT,
    "args" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "stdoutPath" TEXT,
    "stderrPath" TEXT,
    "parsedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_jobId_idx" ON "JobRun"("jobId");

-- CreateIndex
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");

-- CreateIndex
CREATE INDEX "JobRun_createdAt_idx" ON "JobRun"("createdAt");

-- CreateIndex
CREATE INDEX "ToolRun_jobRunId_idx" ON "ToolRun"("jobRunId");

-- CreateIndex
CREATE INDEX "ToolRun_status_idx" ON "ToolRun"("status");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_type_idx" ON "Job"("type");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolRun" ADD CONSTRAINT "ToolRun_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
