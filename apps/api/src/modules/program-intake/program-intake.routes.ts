import { Prisma } from "@bountyops/db";
import { PROGRAM_INTAKE_STATUSES, programIntakePreviewRequestSchema, programIntakeStructuredResultSchema } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";
import { applyIntakeSync, approveNewIntake, calculateIntakeSyncDiff, createProgramIntakePreview } from "./program-intake.service.js";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const runParams = z.object({ runId: z.string().min(1) });
const programParams = z.object({ programId: z.string().min(1) });
const listQuery = z.object({ programId: z.string().optional(), platform: z.string().optional(), status: z.enum(PROGRAM_INTAKE_STATUSES).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });
const approveBody = z.object({ structuredData: programIntakeStructuredResultSchema.optional() }).default({});
const syncInput = z.union([z.object({ sourceType: z.literal("platform_url"), url: z.string().url().optional() }), z.object({ sourceType: z.literal("pasted_text"), text: z.string().trim().min(20).max(250000) })]);
const syncApply = z.object({ intakeRunId: z.string().min(1), structuredData: programIntakeStructuredResultSchema.optional(), approvedChanges: z.object({ confirmScopeRemovals: z.boolean().optional(), confirmWildcardAdditions: z.boolean().optional(), confirmPermissionWidening: z.boolean().optional(), confirmAggressiveEnablement: z.boolean().optional(), confirmHeaderRemovals: z.boolean().optional() }).default({}) });

export async function programIntakeRoutes(app: FastifyInstance) {
  app.post("/program-intake/preview", { preHandler: app.requireAuth }, async (request, reply) => reply.code(201).send(await createProgramIntakePreview(app.prisma, parseRequest(programIntakePreviewRequestSchema, request.body), request.user.sub)));
  app.get("/program-intake/runs", { preHandler: app.requireAuth }, async (request) => { const query = parseRequest(listQuery, request.query); return app.prisma.programIntakeRun.findMany({ where: { programId: query.programId, platform: query.platform, status: query.status }, include: { proposal: true }, orderBy: { createdAt: "desc" }, take: query.limit }); });
  app.get("/program-intake/runs/:runId", { preHandler: app.requireAuth }, async (request) => { const { runId } = parseRequest(runParams, request.params); const run = await app.prisma.programIntakeRun.findUnique({ where: { id: runId }, include: { proposal: true } }); if (!run) throw new ApiError(404, "NOT_FOUND", "Program intake run not found"); return run; });
  app.post("/program-intake/runs/:runId/reject", { preHandler: app.requireAuth }, async (request) => { const { runId } = parseRequest(runParams, request.params); const existing = await app.prisma.programIntakeRun.findUnique({ where: { id: runId } }); if (!existing) throw new ApiError(404, "NOT_FOUND", "Program intake run not found"); if (existing.status !== "needs_review") throw new ApiError(409, "CONFLICT", "Only intake runs awaiting review can be rejected"); const run = await app.prisma.programIntakeRun.update({ where: { id: runId }, data: { status: "rejected" } }); await createAuditLog(app.prisma, { userId: request.user.sub, programId: run.programId ?? undefined, action: "program_intake.rejected", entityType: "program_intake_run", entityId: runId, metadata: json({ intakeRunId: runId, platform: run.platform }) }); return run; });
  app.post("/program-intake/runs/:runId/approve", { preHandler: app.requireAuth }, async (request, reply) => { const { runId } = parseRequest(runParams, request.params); const body = parseRequest(approveBody, request.body ?? {}); const program = await approveNewIntake(app.prisma, runId, request.user.sub, body.structuredData); if (!program) throw new ApiError(409, "CONFLICT", "Intake run cannot be approved as a new program"); return reply.code(201).send(program); });

  app.post("/programs/:programId/intake/sync-preview", { preHandler: app.requireAuth }, async (request, reply) => {
    const { programId } = parseRequest(programParams, request.params); const body = parseRequest(syncInput, request.body);
    const program = await app.prisma.program.findUnique({ where: { id: programId }, include: { scopes: true, rules: true, headers: true } }); if (!program) throw new ApiError(404, "NOT_FOUND", "Program not found");
    const previewInput = body.sourceType === "platform_url" ? { sourceType: "platform_url" as const, url: body.url ?? program.programUrl ?? "" } : { sourceType: "pasted_text" as const, platform: ["hackerone", "bugcrowd", "yeswehack", "manual"].includes(program.platform) ? program.platform as "hackerone" | "bugcrowd" | "yeswehack" | "manual" : "manual" as const, text: body.text };
    if (previewInput.sourceType === "platform_url" && !previewInput.url) throw new ApiError(400, "BAD_REQUEST", "Program URL is missing; paste policy text instead");
    const preview = await createProgramIntakePreview(app.prisma, previewInput, request.user.sub, { programId });
    const structured = programIntakeStructuredResultSchema.parse(preview.proposal.structuredData); const current = { scopes: program.scopes, rules: program.rules ? { ...program.rules, forbiddenActions: program.rules.forbiddenActions } : null, headers: program.headers };
    return reply.code(201).send({ ...preview, diff: calculateIntakeSyncDiff(current, structured) });
  });
  app.post("/programs/:programId/intake/sync-apply", { preHandler: app.requireAuth }, async (request) => {
    const { programId } = parseRequest(programParams, request.params); const body = parseRequest(syncApply, request.body);
    try { const result = await applyIntakeSync(app.prisma, { programId, runId: body.intakeRunId, userId: request.user.sub, structuredData: body.structuredData, confirmations: { scopeRemovals: body.approvedChanges.confirmScopeRemovals, wildcardAdditions: body.approvedChanges.confirmWildcardAdditions, permissionWidening: body.approvedChanges.confirmPermissionWidening, aggressiveEnablement: body.approvedChanges.confirmAggressiveEnablement, headerRemovals: body.approvedChanges.confirmHeaderRemovals } }); if (!result) throw new ApiError(409, "CONFLICT", "Intake sync run cannot be applied"); return result; } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(409, "CONFLICT", error instanceof Error ? error.message : "Intake sync could not be applied"); }
  });
}
