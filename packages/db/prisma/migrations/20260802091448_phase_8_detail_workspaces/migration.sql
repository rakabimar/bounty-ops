-- CreateTable
CREATE TABLE "Url" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assetId" TEXT,
    "httpServiceId" TEXT,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "scheme" TEXT,
    "host" TEXT NOT NULL,
    "port" INTEGER,
    "path" TEXT,
    "queryParamKeys" JSONB,
    "title" TEXT,
    "statusCode" INTEGER,
    "contentType" TEXT,
    "contentLength" INTEGER,
    "responseTimeMs" INTEGER,
    "redirectLocation" TEXT,
    "technologies" JSONB,
    "server" TEXT,
    "categories" JSONB,
    "reasonTags" JSONB,
    "sourceTools" JSONB,
    "scopeStatus" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'new',
    "autoScore" INTEGER NOT NULL DEFAULT 0,
    "manualScore" INTEGER,
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Url_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiEndpoint" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assetId" TEXT,
    "urlId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "path" TEXT NOT NULL,
    "fullUrl" TEXT NOT NULL,
    "normalizedFullUrl" TEXT NOT NULL,
    "statusCode" INTEGER,
    "contentType" TEXT,
    "authRequired" TEXT NOT NULL DEFAULT 'unknown',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'new',
    "categories" JSONB,
    "reasonTags" JSONB,
    "autoScore" INTEGER NOT NULL DEFAULT 0,
    "manualScore" INTEGER,
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "notesCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndpointParameter" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "exampleValue" TEXT,
    "source" TEXT,
    "interesting" BOOLEAN NOT NULL DEFAULT false,
    "frequency" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EndpointParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerFinding" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assetId" TEXT,
    "urlId" TEXT,
    "endpointId" TEXT,
    "tool" TEXT NOT NULL DEFAULT 'manual',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "matcher" TEXT,
    "matchedUrl" TEXT,
    "evidenceSnippet" TEXT,
    "extractedResults" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannerFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Url_programId_idx" ON "Url"("programId");

-- CreateIndex
CREATE INDEX "Url_assetId_idx" ON "Url"("assetId");

-- CreateIndex
CREATE INDEX "Url_httpServiceId_idx" ON "Url"("httpServiceId");

-- CreateIndex
CREATE INDEX "Url_host_idx" ON "Url"("host");

-- CreateIndex
CREATE INDEX "Url_status_idx" ON "Url"("status");

-- CreateIndex
CREATE INDEX "Url_finalScore_idx" ON "Url"("finalScore");

-- CreateIndex
CREATE UNIQUE INDEX "Url_programId_normalizedUrl_key" ON "Url"("programId", "normalizedUrl");

-- CreateIndex
CREATE INDEX "ApiEndpoint_programId_idx" ON "ApiEndpoint"("programId");

-- CreateIndex
CREATE INDEX "ApiEndpoint_assetId_idx" ON "ApiEndpoint"("assetId");

-- CreateIndex
CREATE INDEX "ApiEndpoint_urlId_idx" ON "ApiEndpoint"("urlId");

-- CreateIndex
CREATE INDEX "ApiEndpoint_method_idx" ON "ApiEndpoint"("method");

-- CreateIndex
CREATE INDEX "ApiEndpoint_statusCode_idx" ON "ApiEndpoint"("statusCode");

-- CreateIndex
CREATE INDEX "ApiEndpoint_finalScore_idx" ON "ApiEndpoint"("finalScore");

-- CreateIndex
CREATE UNIQUE INDEX "ApiEndpoint_programId_method_normalizedFullUrl_key" ON "ApiEndpoint"("programId", "method", "normalizedFullUrl");

-- CreateIndex
CREATE INDEX "EndpointParameter_endpointId_idx" ON "EndpointParameter"("endpointId");

-- CreateIndex
CREATE INDEX "EndpointParameter_name_idx" ON "EndpointParameter"("name");

-- CreateIndex
CREATE INDEX "EndpointParameter_location_idx" ON "EndpointParameter"("location");

-- CreateIndex
CREATE INDEX "EndpointParameter_interesting_idx" ON "EndpointParameter"("interesting");

-- CreateIndex
CREATE UNIQUE INDEX "EndpointParameter_endpointId_name_location_key" ON "EndpointParameter"("endpointId", "name", "location");

-- CreateIndex
CREATE INDEX "ScannerFinding_programId_idx" ON "ScannerFinding"("programId");

-- CreateIndex
CREATE INDEX "ScannerFinding_assetId_idx" ON "ScannerFinding"("assetId");

-- CreateIndex
CREATE INDEX "ScannerFinding_urlId_idx" ON "ScannerFinding"("urlId");

-- CreateIndex
CREATE INDEX "ScannerFinding_endpointId_idx" ON "ScannerFinding"("endpointId");

-- CreateIndex
CREATE INDEX "ScannerFinding_tool_idx" ON "ScannerFinding"("tool");

-- CreateIndex
CREATE INDEX "ScannerFinding_severity_idx" ON "ScannerFinding"("severity");

-- CreateIndex
CREATE INDEX "ScannerFinding_status_idx" ON "ScannerFinding"("status");

-- CreateIndex
CREATE INDEX "ScannerFinding_createdAt_idx" ON "ScannerFinding"("createdAt");

-- AddForeignKey
ALTER TABLE "Url" ADD CONSTRAINT "Url_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Url" ADD CONSTRAINT "Url_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Url" ADD CONSTRAINT "Url_httpServiceId_fkey" FOREIGN KEY ("httpServiceId") REFERENCES "HttpService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiEndpoint" ADD CONSTRAINT "ApiEndpoint_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiEndpoint" ADD CONSTRAINT "ApiEndpoint_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiEndpoint" ADD CONSTRAINT "ApiEndpoint_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "Url"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EndpointParameter" ADD CONSTRAINT "EndpointParameter_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ApiEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannerFinding" ADD CONSTRAINT "ScannerFinding_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannerFinding" ADD CONSTRAINT "ScannerFinding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannerFinding" ADD CONSTRAINT "ScannerFinding_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "Url"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannerFinding" ADD CONSTRAINT "ScannerFinding_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "ApiEndpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
