-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "categories" JSONB,
ADD COLUMN     "confidence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastChangedAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "normalizedValue" TEXT NOT NULL,
ADD COLUMN     "parentAssetId" TEXT,
ADD COLUMN     "reasonTags" JSONB,
ADD COLUMN     "sourceTools" JSONB,
ALTER COLUMN "status" SET DEFAULT 'new',
ALTER COLUMN "scopeStatus" SET DEFAULT 'unknown';

-- CreateTable
CREATE TABLE "DnsRecord" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assetId" TEXT,
    "host" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "ttl" INTEGER,
    "resolver" TEXT,
    "sourceTool" TEXT NOT NULL DEFAULT 'dnsx',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DnsRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HttpService" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assetId" TEXT,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "scheme" TEXT,
    "host" TEXT NOT NULL,
    "port" INTEGER,
    "statusCode" INTEGER,
    "title" TEXT,
    "webserver" TEXT,
    "technologies" JSONB,
    "contentLength" INTEGER,
    "responseTimeMs" INTEGER,
    "contentType" TEXT,
    "location" TEXT,
    "cdnName" TEXT,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "sourceTool" TEXT NOT NULL DEFAULT 'httpx',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HttpService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntityChange" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "source" TEXT NOT NULL,
    "importance" TEXT NOT NULL DEFAULT 'low',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DnsRecord_programId_idx" ON "DnsRecord"("programId");
CREATE INDEX "DnsRecord_host_idx" ON "DnsRecord"("host");
CREATE INDEX "DnsRecord_recordType_idx" ON "DnsRecord"("recordType");
CREATE INDEX "DnsRecord_value_idx" ON "DnsRecord"("value");
CREATE UNIQUE INDEX "DnsRecord_programId_host_recordType_value_key" ON "DnsRecord"("programId", "host", "recordType", "value");
CREATE INDEX "HttpService_programId_idx" ON "HttpService"("programId");
CREATE INDEX "HttpService_host_idx" ON "HttpService"("host");
CREATE UNIQUE INDEX "HttpService_programId_normalizedUrl_key" ON "HttpService"("programId", "normalizedUrl");
CREATE INDEX "EntityChange_programId_idx" ON "EntityChange"("programId");
CREATE INDEX "EntityChange_entityType_entityId_idx" ON "EntityChange"("entityType", "entityId");
CREATE INDEX "EntityChange_type_idx" ON "EntityChange"("type");
CREATE INDEX "EntityChange_createdAt_idx" ON "EntityChange"("createdAt");
CREATE UNIQUE INDEX "Asset_programId_type_normalizedValue_key" ON "Asset"("programId", "type", "normalizedValue");

ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HttpService" ADD CONSTRAINT "HttpService_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HttpService" ADD CONSTRAINT "HttpService_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
