import type { Prisma } from "@bountyops/db";
import { ASSET_TYPES, CATEGORIES, REASON_TAGS, priorityFromScore } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";

const assetParams = z.object({ assetId: z.string().min(1) });
const assetQuery = z.object({
  programId: z.string().optional(), type: z.enum(ASSET_TYPES).optional(), status: z.string().optional(),
  scopeStatus: z.enum(["in_scope", "out_of_scope", "unknown"]).optional(), search: z.string().trim().optional(),
  minScore: z.coerce.number().int().min(0).optional(), category: z.enum(CATEGORIES).optional(),
  reasonTag: z.enum(REASON_TAGS).optional(), priority: z.enum(["P1", "P2", "Monitor", "Low"]).optional(),
  hasManualScore: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
const serviceQuery = z.object({
  programId: z.string().optional(), host: z.string().trim().optional(), statusCode: z.coerce.number().int().optional(),
  search: z.string().trim().optional(), minScore: z.coerce.number().int().min(0).optional(), limit: z.coerce.number().int().min(1).max(500).default(100),
});
const manualScoreSchema = z.object({ manualScore: z.number().int().min(0).max(100).nullable() });
const reviewQuery = z.object({
  programId: z.string().optional(), minScore: z.coerce.number().int().min(0).default(8),
  status: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100),
});

function scoreRange(priority: "P1" | "P2" | "Monitor" | "Low" | undefined, minScore?: number): Prisma.IntFilter | undefined {
  const range: Prisma.IntFilter = {};
  if (minScore !== undefined) range.gte = minScore;
  if (priority === "P1") range.gte = Math.max(minScore ?? 0, 15);
  if (priority === "P2") { range.gte = Math.max(minScore ?? 0, 8); range.lte = 14; }
  if (priority === "Monitor") { range.gte = Math.max(minScore ?? 0, 3); range.lte = 7; }
  if (priority === "Low") range.lte = 2;
  return Object.keys(range).length ? range : undefined;
}

const withPriority = <T extends { finalScore: number }>(asset: T) => ({ ...asset, priority: priorityFromScore(asset.finalScore) });
const stringList = (value: Prisma.JsonValue | null): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

async function findAsset(app: FastifyInstance, assetId: string) {
  const asset = await app.prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new ApiError(404, "NOT_FOUND", "Asset not found");
  return asset;
}

export async function assetsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/assets", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(assetQuery, request.query);
    const where: Prisma.AssetWhereInput = {
      programId: query.programId, type: query.type, status: query.status, scopeStatus: query.scopeStatus,
      finalScore: scoreRange(query.priority, query.minScore),
      manualScore: query.hasManualScore === undefined ? undefined : query.hasManualScore ? { not: null } : null,
      categories: query.category ? { array_contains: [query.category] } : undefined,
      reasonTags: query.reasonTag ? { array_contains: [query.reasonTag] } : undefined,
      ...(query.search ? { OR: [{ value: { contains: query.search, mode: "insensitive" } }, { normalizedValue: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    const assets = await app.prisma.asset.findMany({ where, orderBy: [{ finalScore: "desc" }, { lastSeenAt: "desc" }], take: query.limit });
    return assets.map(withPriority);
  });

  app.get("/manual-review/queue", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(reviewQuery, request.query);
    const assets = await app.prisma.asset.findMany({
      where: {
        programId: query.programId, finalScore: { gte: query.minScore }, scopeStatus: "in_scope",
        status: query.status ?? { notIn: ["ignored", "duplicate", "reported", "out_of_scope"] },
      },
      orderBy: [{ finalScore: "desc" }, { lastSeenAt: "desc" }], take: query.limit,
    });
    return assets.map(withPriority);
  });

  app.get("/assets/:assetId", { preHandler: app.requireAuth }, async (request) => {
    const { assetId } = parseRequest(assetParams, request.params);
    const asset = await app.prisma.asset.findUnique({ where: { id: assetId }, include: { dnsRecords: { orderBy: { lastSeenAt: "desc" } }, httpServices: { orderBy: { lastSeenAt: "desc" } } } });
    if (!asset) throw new ApiError(404, "NOT_FOUND", "Asset not found");
    const serviceIds = asset.httpServices.map((service) => service.id);
    const [changes, scoreEvents, classifications] = await Promise.all([
      app.prisma.entityChange.findMany({ where: { OR: [{ entityType: "asset", entityId: assetId }, { entityType: "dns_record", entityId: { in: asset.dnsRecords.map((record) => record.id) } }, { entityType: "http_service", entityId: { in: serviceIds } }] }, orderBy: { createdAt: "desc" } }),
      app.prisma.scoreEvent.findMany({ where: { OR: [{ entityType: "asset", entityId: assetId }, { entityType: "http_service", entityId: { in: serviceIds } }] }, orderBy: { createdAt: "desc" } }),
      app.prisma.entityClassification.findMany({ where: { OR: [{ entityType: "asset", entityId: assetId }, { entityType: "http_service", entityId: { in: serviceIds } }] }, orderBy: { category: "asc" } }),
    ]);
    return { asset: withPriority(asset), dnsRecords: asset.dnsRecords, httpServices: asset.httpServices, changes, scoreEvents, classifications };
  });

  app.get("/assets/:assetId/score-explanation", { preHandler: app.requireAuth }, async (request) => {
    const { assetId } = parseRequest(assetParams, request.params);
    const asset = await findAsset(app, assetId);
    const services = await app.prisma.httpService.findMany({ where: { assetId }, select: { id: true } });
    const entityIds = [assetId, ...services.map((service) => service.id)];
    const [events, classifications] = await Promise.all([
      app.prisma.scoreEvent.findMany({ where: { entityId: { in: entityIds }, entityType: { in: ["asset", "http_service"] } }, orderBy: { createdAt: "asc" } }),
      app.prisma.entityClassification.findMany({ where: { entityId: { in: entityIds }, entityType: { in: ["asset", "http_service"] } } }),
    ]);
    const reasonTags = [...new Set([...stringList(asset.reasonTags), ...events.map((item) => item.reasonTag)])];
    const categories = [...new Set([...stringList(asset.categories), ...classifications.map((item) => item.category)])];
    const explanationEvents = events.length ? events : reasonTags.map((reasonTag) => ({ ruleId: null, ruleName: null, reasonTag, scoreDelta: 0, matched: true, evidence: null, source: "legacy_asset", createdAt: asset.updatedAt }));
    return { entityType: "asset", entityId: asset.id, autoScore: asset.autoScore, manualScore: asset.manualScore, finalScore: asset.finalScore, priority: priorityFromScore(asset.finalScore), confidence: asset.confidence, categories, reasonTags, events: explanationEvents };
  });

  app.patch("/assets/:assetId/manual-score", { preHandler: app.requireAuth }, async (request) => {
    const { assetId } = parseRequest(assetParams, request.params);
    const body = parseRequest(manualScoreSchema, request.body);
    const existing = await findAsset(app, assetId);
    const finalScore = body.manualScore ?? existing.autoScore;
    const asset = await app.prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({ where: { id: assetId }, data: { manualScore: body.manualScore, finalScore, lastChangedAt: new Date() } });
      await tx.entityChange.create({ data: { programId: existing.programId, entityType: "asset", entityId: assetId, type: "score_changed", summary: body.manualScore === null ? "Manual score override cleared" : "Manual score override updated", oldValue: String(existing.finalScore), newValue: String(finalScore), source: "manual", importance: "medium" } });
      return updated;
    });
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: existing.programId, action: body.manualScore === null ? "asset.manual_score.cleared" : "asset.manual_score.updated", entityType: "asset", entityId: assetId, metadata: { oldFinalScore: existing.finalScore, finalScore } });
    return withPriority(asset);
  });

  app.get("/assets/:assetId/dns-records", { preHandler: app.requireAuth }, async (request) => {
    const { assetId } = parseRequest(assetParams, request.params); await findAsset(app, assetId);
    return app.prisma.dnsRecord.findMany({ where: { assetId }, orderBy: { lastSeenAt: "desc" } });
  });
  app.get("/assets/:assetId/http-services", { preHandler: app.requireAuth }, async (request) => {
    const { assetId } = parseRequest(assetParams, request.params); await findAsset(app, assetId);
    return app.prisma.httpService.findMany({ where: { assetId }, orderBy: { lastSeenAt: "desc" } });
  });
  app.get("/assets/:assetId/changes", { preHandler: app.requireAuth }, async (request) => {
    const { assetId } = parseRequest(assetParams, request.params); await findAsset(app, assetId);
    return app.prisma.entityChange.findMany({ where: { entityType: "asset", entityId: assetId }, orderBy: { createdAt: "desc" } });
  });

  app.get("/http-services", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(serviceQuery, request.query);
    const where: Prisma.HttpServiceWhereInput = {
      programId: query.programId, host: query.host ? { contains: query.host, mode: "insensitive" } : undefined,
      statusCode: query.statusCode, asset: query.minScore === undefined ? undefined : { finalScore: { gte: query.minScore } },
      ...(query.search ? { OR: [{ url: { contains: query.search, mode: "insensitive" } }, { host: { contains: query.search, mode: "insensitive" } }, { title: { contains: query.search, mode: "insensitive" } }] } : {}),
    };
    return app.prisma.httpService.findMany({ where, include: { asset: true }, orderBy: { lastSeenAt: "desc" }, take: query.limit });
  });
}
