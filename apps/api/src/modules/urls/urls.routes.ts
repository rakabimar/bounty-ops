import type { Prisma } from "@bountyops/db";
import { CATEGORIES, REASON_TAGS, normalizeUrl, parseNormalizedUrl, priorityFromScore } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";
import { evaluateScopeGuard } from "../scope-guard/scope-guard.service.js";
import { aggregateAssetScore, getEntityScoreExplanation, scoreDetailEntity } from "../scoring/entity-scoring.service.js";

const paramsSchema = z.object({ urlId: z.string().min(1) });
const statuses = ["new", "resolved", "live", "triaged", "promising", "manual_started", "manual_done", "potential_bug", "reported", "duplicate", "ignored", "monitor", "out_of_scope"] as const;
const listSchema = z.object({ programId: z.string().optional(), assetId: z.string().optional(), host: z.string().optional(), statusCode: z.coerce.number().int().optional(), category: z.enum(CATEGORIES).optional(), reasonTag: z.enum(REASON_TAGS).optional(), minScore: z.coerce.number().int().min(0).optional(), search: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
const createSchema = z.object({
  programId: z.string().min(1), assetId: z.string().optional(), httpServiceId: z.string().optional(), url: z.string().min(1),
  sourceTools: z.array(z.string()).default(["manual"]), title: z.string().optional(), statusCode: z.number().int().optional(),
  contentType: z.string().optional(), contentLength: z.number().int().optional(), responseTimeMs: z.number().int().optional(),
  redirectLocation: z.string().optional(), technologies: z.array(z.string()).optional(), server: z.string().optional(),
});
const statusSchema = z.object({ status: z.enum(statuses) });
const manualScoreSchema = z.object({ manualScore: z.number().int().min(0).max(100).nullable() });
const withPriority = <T extends { finalScore: number }>(item: T) => ({ ...item, priority: priorityFromScore(item.finalScore) });

async function findUrl(app: FastifyInstance, id: string) {
  const item = await app.prisma.url.findUnique({ where: { id } });
  if (!item) throw new ApiError(404, "NOT_FOUND", "URL not found");
  return item;
}

export async function urlsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/urls", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(listSchema, request.query);
    const where: Prisma.UrlWhereInput = { programId: query.programId, assetId: query.assetId, host: query.host ? { contains: query.host, mode: "insensitive" } : undefined, statusCode: query.statusCode, finalScore: query.minScore === undefined ? undefined : { gte: query.minScore }, categories: query.category ? { array_contains: [query.category] } : undefined, reasonTags: query.reasonTag ? { array_contains: [query.reasonTag] } : undefined, ...(query.search ? { OR: [{ url: { contains: query.search, mode: "insensitive" } }, { title: { contains: query.search, mode: "insensitive" } }, { path: { contains: query.search, mode: "insensitive" } }] } : {}) };
    return (await app.prisma.url.findMany({ where, orderBy: [{ finalScore: "desc" }, { lastSeenAt: "desc" }], take: query.limit })).map(withPriority);
  });

  app.get("/urls/:urlId", { preHandler: app.requireAuth }, async (request) => {
    const { urlId } = parseRequest(paramsSchema, request.params);
    const item = await app.prisma.url.findUnique({ where: { id: urlId }, include: { asset: true, httpService: true, endpoints: { include: { parameters: true, _count: { select: { scannerFindings: true } } }, orderBy: { finalScore: "desc" } }, scannerFindings: { orderBy: { createdAt: "desc" } } } });
    if (!item) throw new ApiError(404, "NOT_FOUND", "URL not found");
    const [changes, scoreExplanation, parameters] = await Promise.all([
      app.prisma.entityChange.findMany({ where: { entityType: "url", entityId: urlId }, orderBy: { createdAt: "desc" } }),
      getEntityScoreExplanation(app.prisma, "url", item),
      app.prisma.endpointParameter.findMany({ where: { endpoint: { urlId } }, orderBy: [{ interesting: "desc" }, { name: "asc" }] }),
    ]);
    return { url: withPriority(item), asset: item.asset ? withPriority(item.asset) : null, httpService: item.httpService, endpoints: item.endpoints.map((endpoint) => ({ ...withPriority(endpoint), parametersCount: endpoint.parameters.length, scannerFindingsCount: endpoint._count.scannerFindings })), scannerFindings: item.scannerFindings, parameters, changes, scoreExplanation };
  });

  app.post("/urls", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseRequest(createSchema, request.body); const parsed = parseNormalizedUrl(body.url);
    const decision = await evaluateScopeGuard(app.prisma, { programId: body.programId, target: body.url, jobType: "http_probe", stage: "active_light" }, { userId: request.user.sub });
    if (!decision.allowed || decision.matchedOutOfScope) throw new ApiError(409, "CONFLICT", "Scope Guard blocked this URL");
    if (body.assetId) { const asset = await app.prisma.asset.findFirst({ where: { id: body.assetId, programId: body.programId } }); if (!asset) throw new ApiError(400, "BAD_REQUEST", "Asset does not belong to this program"); }
    if (body.httpServiceId) { const service = await app.prisma.httpService.findFirst({ where: { id: body.httpServiceId, programId: body.programId } }); if (!service) throw new ApiError(400, "BAD_REQUEST", "HTTP service does not belong to this program"); }
    const existing = await app.prisma.url.findUnique({ where: { programId_normalizedUrl: { programId: body.programId, normalizedUrl: normalizeUrl(body.url) } } });
    if (existing) throw new ApiError(409, "CONFLICT", "URL already exists");
    let item = await app.prisma.url.create({ data: { programId: body.programId, assetId: body.assetId, httpServiceId: body.httpServiceId, url: body.url.trim(), normalizedUrl: parsed.normalizedUrl, scheme: parsed.scheme, host: parsed.host, port: parsed.port, path: parsed.path, queryParamKeys: parsed.queryParamKeys, title: body.title, statusCode: body.statusCode, contentType: body.contentType, contentLength: body.contentLength, responseTimeMs: body.responseTimeMs, redirectLocation: body.redirectLocation, technologies: body.technologies, server: body.server, sourceTools: body.sourceTools, scopeStatus: "in_scope" } });
    await scoreDetailEntity(app.prisma, { entityType: "url", entityId: item.id, programId: item.programId, assetId: item.assetId, manualScore: item.manualScore, scoringInput: { entityType: "url", host: item.host, url: item.normalizedUrl, path: item.path ?? undefined, title: item.title ?? undefined, statusCode: item.statusCode ?? undefined, port: item.port ?? undefined, technologies: body.technologies, contentType: item.contentType ?? undefined, isNew: true } });
    item = await app.prisma.url.findUniqueOrThrow({ where: { id: item.id } });
    await app.prisma.entityChange.create({ data: { programId: item.programId, entityType: "url", entityId: item.id, type: "url_created", summary: `URL created: ${item.normalizedUrl}`, newValue: item.normalizedUrl, source: "manual", importance: item.finalScore >= 8 ? "medium" : "low" } });
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: item.programId, action: "url.created", entityType: "url", entityId: item.id, metadata: { normalizedUrl: item.normalizedUrl } });
    return reply.code(201).send(withPriority(item));
  });

  app.patch("/urls/:urlId/status", { preHandler: app.requireAuth }, async (request) => {
    const { urlId } = parseRequest(paramsSchema, request.params); const body = parseRequest(statusSchema, request.body); const existing = await findUrl(app, urlId);
    const item = await app.prisma.url.update({ where: { id: urlId }, data: { status: body.status, lastReviewedAt: new Date() } });
    await app.prisma.entityChange.create({ data: { programId: item.programId, entityType: "url", entityId: item.id, type: "status_changed", summary: `URL status changed to ${body.status}`, oldValue: existing.status, newValue: body.status, source: "manual" } });
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: item.programId, action: "url.status.updated", entityType: "url", entityId: item.id, metadata: { oldStatus: existing.status, status: body.status } });
    return withPriority(item);
  });

  app.patch("/urls/:urlId/manual-score", { preHandler: app.requireAuth }, async (request) => {
    const { urlId } = parseRequest(paramsSchema, request.params); const body = parseRequest(manualScoreSchema, request.body); const existing = await findUrl(app, urlId); const finalScore = body.manualScore ?? existing.autoScore;
    const item = await app.prisma.url.update({ where: { id: urlId }, data: { manualScore: body.manualScore, finalScore } });
    await app.prisma.entityChange.create({ data: { programId: item.programId, entityType: "url", entityId: item.id, type: "score_changed", summary: body.manualScore === null ? "URL manual score cleared" : "URL manual score updated", oldValue: String(existing.finalScore), newValue: String(finalScore), source: "manual", importance: "medium" } });
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: item.programId, action: body.manualScore === null ? "url.manual_score.cleared" : "url.manual_score.updated", entityType: "url", entityId: item.id, metadata: { finalScore } });
    if (item.assetId) await aggregateAssetScore(app.prisma, item.assetId);
    return withPriority(item);
  });

  app.get("/urls/:urlId/score-explanation", { preHandler: app.requireAuth }, async (request) => { const { urlId } = parseRequest(paramsSchema, request.params); return getEntityScoreExplanation(app.prisma, "url", await findUrl(app, urlId)); });
}
