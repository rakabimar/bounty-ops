-- CreateTable
CREATE TABLE "ReconSnapshot" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "jobId" TEXT,
    "jobRunId" TEXT,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "observedCount" INTEGER NOT NULL DEFAULT 0,
    "comparable" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconObservation" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "stableKey" TEXT NOT NULL,
    "fingerprint" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconDiffBatch" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "previousSnapshotId" TEXT,
    "currentSnapshotId" TEXT NOT NULL,
    "addedCount" INTEGER NOT NULL DEFAULT 0,
    "changedCount" INTEGER NOT NULL DEFAULT 0,
    "removedCount" INTEGER NOT NULL DEFAULT 0,
    "importance" TEXT NOT NULL DEFAULT 'low',
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconDiffBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "importance" TEXT NOT NULL DEFAULT 'low',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconSchedule" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobType" TEXT NOT NULL DEFAULT 'full_deep_recon',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL,
    "timeOfDay" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "config" JSONB,
    "lastTriggeredAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconSnapshot_programId_idx" ON "ReconSnapshot"("programId");

-- CreateIndex
CREATE INDEX "ReconSnapshot_stage_idx" ON "ReconSnapshot"("stage");

-- CreateIndex
CREATE INDEX "ReconSnapshot_status_idx" ON "ReconSnapshot"("status");

-- CreateIndex
CREATE INDEX "ReconSnapshot_completedAt_idx" ON "ReconSnapshot"("completedAt");

-- CreateIndex
CREATE INDEX "ReconSnapshot_jobRunId_idx" ON "ReconSnapshot"("jobRunId");

-- CreateIndex
CREATE INDEX "ReconObservation_programId_idx" ON "ReconObservation"("programId");

-- CreateIndex
CREATE INDEX "ReconObservation_entityType_idx" ON "ReconObservation"("entityType");

-- CreateIndex
CREATE INDEX "ReconObservation_stableKey_idx" ON "ReconObservation"("stableKey");

-- CreateIndex
CREATE INDEX "ReconObservation_snapshotId_idx" ON "ReconObservation"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconObservation_snapshotId_entityType_stableKey_key" ON "ReconObservation"("snapshotId", "entityType", "stableKey");

-- CreateIndex
CREATE INDEX "ReconDiffBatch_programId_idx" ON "ReconDiffBatch"("programId");

-- CreateIndex
CREATE INDEX "ReconDiffBatch_stage_idx" ON "ReconDiffBatch"("stage");

-- CreateIndex
CREATE INDEX "ReconDiffBatch_createdAt_idx" ON "ReconDiffBatch"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_programId_idx" ON "NotificationEvent"("programId");

-- CreateIndex
CREATE INDEX "NotificationEvent_eventType_idx" ON "NotificationEvent"("eventType");

-- CreateIndex
CREATE INDEX "NotificationEvent_importance_idx" ON "NotificationEvent"("importance");

-- CreateIndex
CREATE INDEX "NotificationEvent_status_idx" ON "NotificationEvent"("status");

-- CreateIndex
CREATE INDEX "NotificationEvent_createdAt_idx" ON "NotificationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ReconSchedule_programId_idx" ON "ReconSchedule"("programId");

-- CreateIndex
CREATE INDEX "ReconSchedule_enabled_idx" ON "ReconSchedule"("enabled");

-- CreateIndex
CREATE INDEX "ReconSchedule_nextRunAt_idx" ON "ReconSchedule"("nextRunAt");

-- AddForeignKey
ALTER TABLE "ReconSnapshot" ADD CONSTRAINT "ReconSnapshot_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconObservation" ADD CONSTRAINT "ReconObservation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReconSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconSchedule" ADD CONSTRAINT "ReconSchedule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
