-- CreateTable
CREATE TABLE "ResearchNote" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "tags" JSONB,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualChecklist" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "order" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "evidenceRef" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestingRequest" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "method" TEXT,
    "url" TEXT,
    "requestHeaders" JSONB,
    "requestBody" TEXT,
    "responseStatus" INTEGER,
    "responseHeaders" JSONB,
    "responseBodySnippet" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterestingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "content" TEXT,
    "filePath" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityStatusTransition" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityStatusTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchNote_programId_idx" ON "ResearchNote"("programId");

-- CreateIndex
CREATE INDEX "ResearchNote_entityType_entityId_idx" ON "ResearchNote"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ResearchNote_pinned_idx" ON "ResearchNote"("pinned");

-- CreateIndex
CREATE INDEX "ResearchNote_createdAt_idx" ON "ResearchNote"("createdAt");

-- CreateIndex
CREATE INDEX "ManualChecklist_programId_idx" ON "ManualChecklist"("programId");

-- CreateIndex
CREATE INDEX "ManualChecklist_entityType_entityId_idx" ON "ManualChecklist"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ManualChecklist_source_idx" ON "ManualChecklist"("source");

-- CreateIndex
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "ChecklistItem_status_idx" ON "ChecklistItem"("status");

-- CreateIndex
CREATE INDEX "ChecklistItem_priority_idx" ON "ChecklistItem"("priority");

-- CreateIndex
CREATE INDEX "ChecklistItem_source_idx" ON "ChecklistItem"("source");

-- CreateIndex
CREATE INDEX "InterestingRequest_programId_idx" ON "InterestingRequest"("programId");

-- CreateIndex
CREATE INDEX "InterestingRequest_entityType_entityId_idx" ON "InterestingRequest"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "InterestingRequest_method_idx" ON "InterestingRequest"("method");

-- CreateIndex
CREATE INDEX "InterestingRequest_responseStatus_idx" ON "InterestingRequest"("responseStatus");

-- CreateIndex
CREATE INDEX "InterestingRequest_createdAt_idx" ON "InterestingRequest"("createdAt");

-- CreateIndex
CREATE INDEX "EvidenceItem_programId_idx" ON "EvidenceItem"("programId");

-- CreateIndex
CREATE INDEX "EvidenceItem_entityType_entityId_idx" ON "EvidenceItem"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EvidenceItem_evidenceType_idx" ON "EvidenceItem"("evidenceType");

-- CreateIndex
CREATE INDEX "EvidenceItem_createdAt_idx" ON "EvidenceItem"("createdAt");

-- CreateIndex
CREATE INDEX "EntityStatusTransition_programId_idx" ON "EntityStatusTransition"("programId");

-- CreateIndex
CREATE INDEX "EntityStatusTransition_entityType_entityId_idx" ON "EntityStatusTransition"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EntityStatusTransition_newStatus_idx" ON "EntityStatusTransition"("newStatus");

-- CreateIndex
CREATE INDEX "EntityStatusTransition_createdAt_idx" ON "EntityStatusTransition"("createdAt");

-- AddForeignKey
ALTER TABLE "ResearchNote" ADD CONSTRAINT "ResearchNote_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualChecklist" ADD CONSTRAINT "ManualChecklist_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "ManualChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestingRequest" ADD CONSTRAINT "InterestingRequest_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
