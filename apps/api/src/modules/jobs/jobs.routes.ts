import { Prisma } from "@bountyops/db";
import { RECON_JOB_TYPES, type CreateJobRequest, type JobLogEntry } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";
import { createQueuedJob, jobDetailInclude, retryJob } from "./jobs.service.js";

const paramsSchema = z.object({ jobId: z.string().min(1) });
const listSchema = z.object({
  programId: z.string().optional(),
  status: z.enum(["queued", "running", "success", "failed", "cancelled", "blocked"]).optional(),
  type: z.enum(RECON_JOB_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const createSchema = z.object({
  programId: z.string().min(1),
  type: z.enum(RECON_JOB_TYPES),
  target: z.string().trim().min(1).max(2_048).optional(),
  config: z.unknown().optional(),
  manualApproved: z.boolean().default(false),
});
const retrySchema = z.object({ target: z.string().trim().min(1).max(2_048).optional(), manualApproved: z.boolean().optional() }).default({});

function logs(value: Prisma.JsonValue | null): JobLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item) && typeof (item as { message?: unknown }).message === "string") as unknown as JobLogEntry[];
}

function phase10Config(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function validatePhase10Input(app: FastifyInstance, input: CreateJobRequest): Promise<void> {
  const config = phase10Config(input.config);
  for (const key of ["targets", "tags", "severity", "tools"] as const) {
    if (config[key] !== undefined && (!Array.isArray(config[key]) || config[key].length === 0 || !(config[key] as unknown[]).every((value) => typeof value === "string" && Boolean(value.trim())))) {
      throw new ApiError(400, "BAD_REQUEST", `config.${key} must be a non-empty string array`);
    }
  }
  const targets = Array.isArray(config.targets)
    ? config.targets.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  if (input.type === "url_archive" && !input.target && typeof config.target !== "string" && typeof config.domain !== "string") {
    throw new ApiError(400, "BAD_REQUEST", "url_archive requires target, config.target, or config.domain");
  }
  if (input.type === "crawl" && !input.target && targets.length === 0) {
    throw new ApiError(400, "BAD_REQUEST", "crawl requires target or config.targets");
  }
  if (input.type === "nuclei_safe" && !input.target && targets.length === 0) {
    const [urls, services] = await Promise.all([
      app.prisma.url.count({ where: { programId: input.programId, scopeStatus: "in_scope" } }),
      app.prisma.httpService.count({ where: { programId: input.programId, failed: false } }),
    ]);
    if (urls + services === 0) throw new ApiError(400, "BAD_REQUEST", "nuclei_safe requires target/config.targets or an existing in-scope URL/HTTP service");
  }
}

export async function jobsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/jobs/queue/health", { preHandler: app.requireAuth }, async (request, reply) => {
    try {
      const [counts] = await Promise.all([
        app.reconQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
        app.queueRedis.ping(),
      ]);
      return { queueName: app.reconQueue.name, redis: "ok", counts: { waiting: counts.waiting ?? 0, active: counts.active ?? 0, completed: counts.completed ?? 0, failed: counts.failed ?? 0, delayed: counts.delayed ?? 0 }, timestamp: new Date().toISOString() };
    } catch (error) {
      request.log.error({ err: error }, "Queue health check failed");
      return reply.code(503).send({ queueName: app.reconQueue.name, redis: "error", counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }, timestamp: new Date().toISOString() });
    }
  });

  app.get("/jobs", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(listSchema, request.query);
    return app.prisma.job.findMany({
      where: { programId: query.programId, status: query.status, type: query.type },
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: { runs: { orderBy: { createdAt: "desc" }, take: 1, include: { toolRuns: true } } },
    });
  });

  app.post("/jobs", { preHandler: app.requireAuth }, async (request, reply) => {
    const input = parseRequest(createSchema, request.body) as CreateJobRequest;
    await validatePhase10Input(app, input);
    const job = await createQueuedJob(app.prisma, app.reconQueue, input, request.user.sub);
    return reply.code(201).send(job);
  });

  app.get("/jobs/:jobId", { preHandler: app.requireAuth }, async (request) => {
    const { jobId } = parseRequest(paramsSchema, request.params);
    const job = await app.prisma.job.findUnique({ where: { id: jobId }, include: jobDetailInclude });
    if (!job) throw new ApiError(404, "NOT_FOUND", "Job not found");
    return job;
  });

  app.get("/jobs/:jobId/logs", { preHandler: app.requireAuth }, async (request) => {
    const { jobId } = parseRequest(paramsSchema, request.params);
    const run = await app.prisma.jobRun.findFirst({ where: { jobId }, orderBy: { createdAt: "desc" } });
    const exists = run ?? await app.prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!exists) throw new ApiError(404, "NOT_FOUND", "Job not found");
    return { jobId, jobRunId: run?.id ?? null, logs: logs(run?.logs ?? null) };
  });

  app.post("/jobs/:jobId/cancel", { preHandler: app.requireAuth }, async (request) => {
    const { jobId } = parseRequest(paramsSchema, request.params);
    const job = await app.prisma.job.findUnique({ where: { id: jobId }, include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!job) throw new ApiError(404, "NOT_FOUND", "Job not found");
    if (!["queued", "running"].includes(job.status)) throw new ApiError(409, "CONFLICT", "Only queued or running jobs can be cancelled");
    const run = job.runs[0];
    const cancelledLogs = run
      ? [...logs(run.logs), { timestamp: new Date().toISOString(), level: "warn" as const, message: "Job cancelled by user" }]
      : [];
    await app.prisma.$transaction([
      app.prisma.job.update({ where: { id: jobId }, data: { status: "cancelled" } }),
      ...(run ? [app.prisma.jobRun.update({ where: { id: run.id }, data: { status: "cancelled", finishedAt: new Date(), logs: cancelledLogs as unknown as Prisma.InputJsonValue } })] : []),
    ]);
    if (run) {
      const queued = await app.reconQueue.getJob(run.id);
      if (queued) {
        const state = await queued.getState();
        if (state === "waiting" || state === "delayed") await queued.remove();
      }
    }
    await createAuditLog(app.prisma, { userId: request.user.sub, programId: job.programId ?? undefined, action: "job.cancelled", entityType: "job", entityId: jobId, metadata: { jobRunId: run?.id ?? null } as Prisma.InputJsonValue });
    return app.prisma.job.findUnique({ where: { id: jobId }, include: jobDetailInclude });
  });

  app.post("/jobs/:jobId/retry", { preHandler: app.requireAuth }, async (request) => {
    const { jobId } = parseRequest(paramsSchema, request.params);
    const changes = parseRequest(retrySchema, request.body ?? {});
    return retryJob(app.prisma, app.reconQueue, jobId, request.user.sub, changes);
  });
}
