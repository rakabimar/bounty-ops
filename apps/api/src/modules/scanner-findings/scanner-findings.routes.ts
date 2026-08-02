import type { Prisma } from "@bountyops/db";
import { SCANNER_FINDING_SEVERITIES, SCANNER_FINDING_STATUSES, SCANNER_TOOLS, priorityFromScore } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";
import { evaluateScopeGuard } from "../scope-guard/scope-guard.service.js";

const paramsSchema = z.object({ findingId: z.string().min(1) });
const listSchema = z.object({ programId: z.string().optional(), assetId: z.string().optional(), urlId: z.string().optional(), endpointId: z.string().optional(), severity: z.enum(SCANNER_FINDING_SEVERITIES).optional(), status: z.enum(SCANNER_FINDING_STATUSES).optional(), tool: z.enum(SCANNER_TOOLS).optional(), search: z.string().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
const createSchema = z.object({ programId: z.string().min(1), assetId: z.string().optional(), urlId: z.string().optional(), endpointId: z.string().optional(), tool: z.enum(SCANNER_TOOLS).default("manual"), severity: z.enum(SCANNER_FINDING_SEVERITIES).default("info"), templateId: z.string().optional(), name: z.string().min(1), description: z.string().optional(), matcher: z.string().optional(), matchedUrl: z.string().optional(), evidenceSnippet: z.string().optional(), extractedResults: z.array(z.unknown()).optional() });
const statusSchema = z.object({ status: z.enum(SCANNER_FINDING_STATUSES) });
const withPriority = <T extends { finalScore: number }>(item: T) => ({ ...item, priority: priorityFromScore(item.finalScore) });

async function findFinding(app: FastifyInstance, id: string) { const item = await app.prisma.scannerFinding.findUnique({ where: { id } }); if (!item) throw new ApiError(404, "NOT_FOUND", "Scanner finding not found"); return item; }

export async function scannerFindingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/scanner-findings", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(listSchema, request.query);
    const where: Prisma.ScannerFindingWhereInput = { programId: query.programId, assetId: query.assetId, urlId: query.urlId, endpointId: query.endpointId, severity: query.severity, status: query.status, tool: query.tool, ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }, { matchedUrl: { contains: query.search, mode: "insensitive" } }, { templateId: { contains: query.search, mode: "insensitive" } }] } : {}) };
    return app.prisma.scannerFinding.findMany({ where, orderBy: { createdAt: "desc" }, take: query.limit });
  });

  app.get("/scanner-findings/:findingId", { preHandler: app.requireAuth }, async (request) => {
    const { findingId } = parseRequest(paramsSchema, request.params);
    const item = await app.prisma.scannerFinding.findUnique({ where: { id: findingId }, include: { asset: true, url: true, endpoint: true } });
    if (!item) throw new ApiError(404, "NOT_FOUND", "Scanner finding not found");
    const [changes, relatedScoreEvents] = await Promise.all([app.prisma.entityChange.findMany({ where: { entityType: "scanner_finding", entityId: findingId }, orderBy: { createdAt: "desc" } }), app.prisma.scoreEvent.findMany({ where: { entityType: "scanner_finding", entityId: findingId }, orderBy: { createdAt: "desc" } })]);
    return { finding: item, asset: item.asset ? withPriority(item.asset) : null, url: item.url ? withPriority(item.url) : null, endpoint: item.endpoint ? withPriority(item.endpoint) : null, changes, relatedScoreEvents };
  });

  app.post("/scanner-findings", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseRequest(createSchema, request.body);
    if (body.matchedUrl) { const decision = await evaluateScopeGuard(app.prisma, { programId: body.programId, target: body.matchedUrl, jobType: "http_probe", stage: "active_light" }, { userId: request.user.sub }); if (!decision.allowed || decision.matchedOutOfScope) throw new ApiError(409, "CONFLICT", "Scope Guard blocked this finding target"); }
    if (body.assetId && !await app.prisma.asset.findFirst({ where: { id: body.assetId, programId: body.programId } })) throw new ApiError(400, "BAD_REQUEST", "Asset does not belong to this program");
    if (body.urlId && !await app.prisma.url.findFirst({ where: { id: body.urlId, programId: body.programId } })) throw new ApiError(400, "BAD_REQUEST", "URL does not belong to this program");
    if (body.endpointId && !await app.prisma.apiEndpoint.findFirst({ where: { id: body.endpointId, programId: body.programId } })) throw new ApiError(400, "BAD_REQUEST", "Endpoint does not belong to this program");
    const item = await app.prisma.scannerFinding.create({ data: { ...body, extractedResults: body.extractedResults ? JSON.parse(JSON.stringify(body.extractedResults)) as Prisma.InputJsonValue : undefined } });
    await app.prisma.entityChange.create({ data: { programId: item.programId, entityType: "scanner_finding", entityId: item.id, type: "scanner_finding_created", summary: `Scanner finding created: ${item.name}`, newValue: item.name, source: item.tool, importance: ["high", "critical"].includes(item.severity) ? "high" : "medium" } });
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: item.programId, action: "scanner_finding.created", entityType: "scanner_finding", entityId: item.id, metadata: { tool: item.tool, severity: item.severity, status: item.status } });
    return reply.code(201).send(item);
  });

  app.patch("/scanner-findings/:findingId/status", { preHandler: app.requireAuth }, async (request) => {
    const { findingId } = parseRequest(paramsSchema, request.params); const body = parseRequest(statusSchema, request.body); const existing = await findFinding(app, findingId);
    const item = await app.prisma.scannerFinding.update({ where: { id: findingId }, data: { status: body.status } });
    const changes: Prisma.EntityChangeCreateManyInput[] = [{ programId: item.programId, entityType: "scanner_finding", entityId: item.id, type: "status_changed", summary: `Scanner finding status changed to ${body.status}`, oldValue: existing.status, newValue: body.status, source: "manual", importance: body.status === "potential_bug" ? "high" : "medium" }];
    if (body.status === "potential_bug") changes.push({ programId: item.programId, entityType: "scanner_finding", entityId: item.id, type: "potential_bug_marked", summary: "Scanner finding marked as a potential bug", oldValue: existing.status, newValue: body.status, source: "manual", importance: "high" });
    await app.prisma.entityChange.createMany({ data: changes });
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: item.programId, action: "scanner_finding.status.updated", entityType: "scanner_finding", entityId: item.id, metadata: { oldStatus: existing.status, status: body.status } });
    return item;
  });
}
