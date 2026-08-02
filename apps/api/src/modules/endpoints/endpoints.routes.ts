import type { Prisma } from "@bountyops/db";
import { AUTH_REQUIRED_VALUES, CATEGORIES, ENDPOINT_METHODS, ENDPOINT_PARAMETER_LOCATIONS, inferMethod, normalizeFullUrl, parseNormalizedUrl, priorityFromScore } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";
import { evaluateScopeGuard } from "../scope-guard/scope-guard.service.js";
import { aggregateAssetScore, getEntityScoreExplanation, scoreDetailEntity } from "../scoring/entity-scoring.service.js";

const paramsSchema = z.object({ endpointId: z.string().min(1) });
const statuses = ["new", "resolved", "live", "triaged", "promising", "manual_started", "manual_done", "potential_bug", "reported", "duplicate", "ignored", "monitor", "out_of_scope"] as const;
const listSchema = z.object({ programId: z.string().optional(), assetId: z.string().optional(), urlId: z.string().optional(), method: z.enum(ENDPOINT_METHODS).optional(), statusCode: z.coerce.number().int().optional(), category: z.enum(CATEGORIES).optional(), authRequired: z.enum(AUTH_REQUIRED_VALUES).optional(), hasParameters: z.enum(["true", "false"]).transform((value) => value === "true").optional(), minScore: z.coerce.number().int().min(0).optional(), search: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
const parameterSchema = z.object({ name: z.string().min(1), location: z.enum(ENDPOINT_PARAMETER_LOCATIONS), exampleValue: z.string().optional(), source: z.string().optional(), interesting: z.boolean().default(false), frequency: z.number().int().min(0).optional() });
const createSchema = z.object({ programId: z.string().min(1), assetId: z.string().optional(), urlId: z.string().optional(), method: z.enum(ENDPOINT_METHODS).default("UNKNOWN"), path: z.string().min(1), fullUrl: z.string().min(1), statusCode: z.number().int().optional(), contentType: z.string().optional(), authRequired: z.enum(AUTH_REQUIRED_VALUES).default("unknown"), source: z.string().default("manual"), parameters: z.array(parameterSchema).default([]) });
const statusSchema = z.object({ status: z.enum(statuses) });
const manualScoreSchema = z.object({ manualScore: z.number().int().min(0).max(100).nullable() });
const withPriority = <T extends { finalScore: number }>(item: T) => ({ ...item, priority: priorityFromScore(item.finalScore) });

async function findEndpoint(app: FastifyInstance, id: string) { const item = await app.prisma.apiEndpoint.findUnique({ where: { id } }); if (!item) throw new ApiError(404, "NOT_FOUND", "Endpoint not found"); return item; }

export async function endpointsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/endpoints", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(listSchema, request.query);
    const where: Prisma.ApiEndpointWhereInput = { programId: query.programId, assetId: query.assetId, urlId: query.urlId, method: query.method, statusCode: query.statusCode, authRequired: query.authRequired, finalScore: query.minScore === undefined ? undefined : { gte: query.minScore }, categories: query.category ? { array_contains: [query.category] } : undefined, parameters: query.hasParameters === undefined ? undefined : query.hasParameters ? { some: {} } : { none: {} }, ...(query.search ? { OR: [{ path: { contains: query.search, mode: "insensitive" } }, { fullUrl: { contains: query.search, mode: "insensitive" } }] } : {}) };
    const items = await app.prisma.apiEndpoint.findMany({ where, include: { _count: { select: { parameters: true, scannerFindings: true } } }, orderBy: [{ finalScore: "desc" }, { lastSeenAt: "desc" }], take: query.limit });
    return items.map((item) => ({ ...withPriority(item), parametersCount: item._count.parameters, scannerFindingsCount: item._count.scannerFindings }));
  });

  app.get("/endpoints/:endpointId", { preHandler: app.requireAuth }, async (request) => {
    const { endpointId } = parseRequest(paramsSchema, request.params);
    const item = await app.prisma.apiEndpoint.findUnique({ where: { id: endpointId }, include: { asset: true, url: true, parameters: { orderBy: [{ interesting: "desc" }, { name: "asc" }] }, scannerFindings: { orderBy: { createdAt: "desc" } } } });
    if (!item) throw new ApiError(404, "NOT_FOUND", "Endpoint not found");
    const [changes, scoreExplanation] = await Promise.all([app.prisma.entityChange.findMany({ where: { entityType: "endpoint", entityId: endpointId }, orderBy: { createdAt: "desc" } }), getEntityScoreExplanation(app.prisma, "endpoint", item)]);
    return { endpoint: { ...withPriority(item), parametersCount: item.parameters.length, scannerFindingsCount: item.scannerFindings.length }, asset: item.asset ? withPriority(item.asset) : null, url: item.url ? withPriority(item.url) : null, parameters: item.parameters, scannerFindings: item.scannerFindings, changes, scoreExplanation };
  });

  app.post("/endpoints", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseRequest(createSchema, request.body); const method = inferMethod(body.method); const parsed = parseNormalizedUrl(body.fullUrl);
    const decision = await evaluateScopeGuard(app.prisma, { programId: body.programId, target: body.fullUrl, jobType: "http_probe", stage: "active_light" }, { userId: request.user.sub });
    if (!decision.allowed || decision.matchedOutOfScope) throw new ApiError(409, "CONFLICT", "Scope Guard blocked this endpoint");
    if (body.assetId && !await app.prisma.asset.findFirst({ where: { id: body.assetId, programId: body.programId } })) throw new ApiError(400, "BAD_REQUEST", "Asset does not belong to this program");
    if (body.urlId && !await app.prisma.url.findFirst({ where: { id: body.urlId, programId: body.programId } })) throw new ApiError(400, "BAD_REQUEST", "URL does not belong to this program");
    const normalizedFullUrl = normalizeFullUrl(body.fullUrl);
    if (await app.prisma.apiEndpoint.findUnique({ where: { programId_method_normalizedFullUrl: { programId: body.programId, method, normalizedFullUrl } } })) throw new ApiError(409, "CONFLICT", "Endpoint already exists");
    let item = await app.prisma.apiEndpoint.create({ data: { programId: body.programId, assetId: body.assetId, urlId: body.urlId, method, path: body.path.startsWith("/") ? body.path : `/${body.path}`, fullUrl: body.fullUrl.trim(), normalizedFullUrl, statusCode: body.statusCode, contentType: body.contentType, authRequired: body.authRequired, source: body.source, parameters: { create: body.parameters } } });
    await scoreDetailEntity(app.prisma, { entityType: "endpoint", entityId: item.id, programId: item.programId, assetId: item.assetId, manualScore: item.manualScore, scoringInput: { entityType: "endpoint", host: parsed.host, url: item.normalizedFullUrl, path: item.path, statusCode: item.statusCode ?? undefined, port: parsed.port ?? undefined, contentType: item.contentType ?? undefined, isNew: true } });
    item = await app.prisma.apiEndpoint.findUniqueOrThrow({ where: { id: item.id } });
    await app.prisma.entityChange.create({ data: { programId: item.programId, entityType: "endpoint", entityId: item.id, type: "endpoint_created", summary: `Endpoint created: ${item.method} ${item.path}`, newValue: item.normalizedFullUrl, source: body.source, importance: item.finalScore >= 8 ? "medium" : "low" } });
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: item.programId, action: "endpoint.created", entityType: "endpoint", entityId: item.id, metadata: { method: item.method, normalizedFullUrl: item.normalizedFullUrl, parameterCount: body.parameters.length } });
    const parameters = await app.prisma.endpointParameter.findMany({ where: { endpointId: item.id } });
    return reply.code(201).send({ ...withPriority(item), parameters, parametersCount: parameters.length, scannerFindingsCount: 0 });
  });

  app.patch("/endpoints/:endpointId/status", { preHandler: app.requireAuth }, async (request) => {
    const { endpointId } = parseRequest(paramsSchema, request.params); const body = parseRequest(statusSchema, request.body); const existing = await findEndpoint(app, endpointId);
    const item = await app.prisma.apiEndpoint.update({ where: { id: endpointId }, data: { status: body.status } });
    await app.prisma.entityChange.create({ data: { programId: item.programId, entityType: "endpoint", entityId: item.id, type: "status_changed", summary: `Endpoint status changed to ${body.status}`, oldValue: existing.status, newValue: body.status, source: "manual" } });
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: item.programId, action: "endpoint.status.updated", entityType: "endpoint", entityId: item.id, metadata: { oldStatus: existing.status, status: body.status } });
    return withPriority(item);
  });

  app.patch("/endpoints/:endpointId/manual-score", { preHandler: app.requireAuth }, async (request) => {
    const { endpointId } = parseRequest(paramsSchema, request.params); const body = parseRequest(manualScoreSchema, request.body); const existing = await findEndpoint(app, endpointId); const finalScore = body.manualScore ?? existing.autoScore;
    const item = await app.prisma.apiEndpoint.update({ where: { id: endpointId }, data: { manualScore: body.manualScore, finalScore } });
    await app.prisma.entityChange.create({ data: { programId: item.programId, entityType: "endpoint", entityId: item.id, type: "score_changed", summary: body.manualScore === null ? "Endpoint manual score cleared" : "Endpoint manual score updated", oldValue: String(existing.finalScore), newValue: String(finalScore), source: "manual", importance: "medium" } });
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: item.programId, action: body.manualScore === null ? "endpoint.manual_score.cleared" : "endpoint.manual_score.updated", entityType: "endpoint", entityId: item.id, metadata: { finalScore } });
    if (item.assetId) await aggregateAssetScore(app.prisma, item.assetId);
    return withPriority(item);
  });

  app.get("/endpoints/:endpointId/score-explanation", { preHandler: app.requireAuth }, async (request) => { const { endpointId } = parseRequest(paramsSchema, request.params); return getEntityScoreExplanation(app.prisma, "endpoint", await findEndpoint(app, endpointId)); });
}
