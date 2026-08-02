-- AlterTable
ALTER TABLE "HttpService" ADD COLUMN     "fingerprintHash" TEXT,
ADD COLUMN     "titleHash" TEXT;

-- CreateTable
CREATE TABLE "ScoreEvent" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ruleId" TEXT,
    "ruleName" TEXT,
    "reasonTag" TEXT NOT NULL,
    "scoreDelta" INTEGER NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT true,
    "evidence" JSONB,
    "source" TEXT NOT NULL DEFAULT 'scoring_engine',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityClassification" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityClassification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreEvent_programId_idx" ON "ScoreEvent"("programId");

-- CreateIndex
CREATE INDEX "ScoreEvent_entityType_entityId_idx" ON "ScoreEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ScoreEvent_reasonTag_idx" ON "ScoreEvent"("reasonTag");

-- CreateIndex
CREATE INDEX "ScoreEvent_createdAt_idx" ON "ScoreEvent"("createdAt");

-- CreateIndex
CREATE INDEX "EntityClassification_programId_idx" ON "EntityClassification"("programId");

-- CreateIndex
CREATE INDEX "EntityClassification_category_idx" ON "EntityClassification"("category");

-- CreateIndex
CREATE INDEX "EntityClassification_entityType_entityId_idx" ON "EntityClassification"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityClassification_entityType_entityId_category_key" ON "EntityClassification"("entityType", "entityId", "category");
