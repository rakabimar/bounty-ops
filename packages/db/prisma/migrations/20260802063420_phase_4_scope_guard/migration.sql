-- CreateTable
CREATE TABLE "ScopeGuardCheck" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "userId" TEXT,
    "target" TEXT NOT NULL,
    "normalizedTarget" JSONB,
    "jobType" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reasons" JSONB NOT NULL,
    "matchedInScopeScopeId" TEXT,
    "matchedOutOfScopeScopeId" TEXT,
    "effectiveRateLimitRps" INTEGER,
    "effectiveMaxConcurrency" INTEGER,
    "requiredHeaders" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScopeGuardCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScopeGuardCheck_programId_idx" ON "ScopeGuardCheck"("programId");

-- CreateIndex
CREATE INDEX "ScopeGuardCheck_decision_idx" ON "ScopeGuardCheck"("decision");

-- CreateIndex
CREATE INDEX "ScopeGuardCheck_jobType_idx" ON "ScopeGuardCheck"("jobType");

-- CreateIndex
CREATE INDEX "ScopeGuardCheck_createdAt_idx" ON "ScopeGuardCheck"("createdAt");

-- AddForeignKey
ALTER TABLE "ScopeGuardCheck" ADD CONSTRAINT "ScopeGuardCheck_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
