import { Prisma, type PrismaClient } from "@bountyops/db";
import {
  OPTIONAL_TARGET_JOB_TYPES,
  RECON_JOB_DEFAULT_STAGES,
  type CreateJobRequest,
  type JobLogEntry,
  type ReconJobType,
  type ReconQueueJobData,
  type ScopeGuardPreflightResult,
} from "@bountyops/shared";
import type { Queue } from "bullmq";
import { ApiError } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";
import { evaluateScopeGuard } from "../scope-guard/scope-guard.service.js";

export const jobDetailInclude = {
  runs: { orderBy: { createdAt: "desc" as const }, include: { toolRuns: true } },
} satisfies Prisma.JobInclude;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function initialLog(message: string, level: JobLogEntry["level"] = "info"): Prisma.InputJsonValue {
  return asJson([{ timestamp: new Date().toISOString(), level, message } satisfies JobLogEntry]);
}

function representativeTarget(asset: string, assetType: string): string {
  const trimmed = asset.trim();
  if (assetType === "wildcard_domain" && trimmed.startsWith("*.")) {
    return `bountyops-preflight.${trimmed.slice(2)}`;
  }
  return trimmed;
}

export async function resolveJobTarget(
  prisma: PrismaClient,
  input: CreateJobRequest,
): Promise<{ storedTarget?: string; guardTarget: string }> {
  if (input.target?.trim()) return { storedTarget: input.target.trim(), guardTarget: input.target.trim() };
  if (!OPTIONAL_TARGET_JOB_TYPES.includes(input.type as never)) {
    throw new ApiError(400, "BAD_REQUEST", "target is required for this job type");
  }
  const scope = await prisma.programScope.findFirst({
    where: { programId: input.programId, isInScope: true },
    orderBy: { createdAt: "asc" },
  });
  if (!scope) {
    throw new ApiError(400, "BAD_REQUEST", "A target or an in-scope program scope is required");
  }
  return { guardTarget: representativeTarget(scope.asset, scope.assetType) };
}

export async function enqueueRun(
  queue: Queue<ReconQueueJobData>,
  data: ReconQueueJobData,
): Promise<void> {
  await queue.add(data.type, data, {
    jobId: data.jobRunId,
    removeOnComplete: false,
    removeOnFail: false,
  });
}

export async function createQueuedJob(
  prisma: PrismaClient,
  queue: Queue<ReconQueueJobData>,
  input: CreateJobRequest,
  userId: string,
) {
  const program = await prisma.program.findUnique({ where: { id: input.programId }, select: { id: true } });
  if (!program) throw new ApiError(404, "NOT_FOUND", "Program not found");
  const target = await resolveJobTarget(prisma, input);
  const stage = RECON_JOB_DEFAULT_STAGES[input.type];
  const decision = await evaluateScopeGuard(
    prisma,
    {
      programId: input.programId,
      target: target.guardTarget,
      jobType: input.type,
      stage,
      manualApproved: input.manualApproved ?? false,
    },
    { userId },
  );
  const status = decision.allowed ? "queued" : "blocked";
  const job = await prisma.job.create({
    data: {
      programId: input.programId,
      type: input.type,
      status,
      stage,
      target: target.storedTarget,
      config: input.config === undefined ? undefined : asJson(input.config),
      requestedByUserId: userId,
      manualApproved: input.manualApproved ?? false,
      scopeGuardDecision: asJson(decision),
      runs: {
        create: {
          programId: input.programId,
          type: input.type,
          status,
          logs: initialLog(
            decision.allowed ? "Job queued after Scope Guard validation" : "Job blocked by Scope Guard",
            decision.allowed ? "info" : "warn",
          ),
        },
      },
    },
    include: jobDetailInclude,
  });
  const run = job.runs[0]!;

  await createAuditLog(prisma, {
    userId,
    programId: input.programId,
    action: decision.allowed ? "job.queued" : "job.blocked",
    entityType: "job",
    entityId: job.id,
    metadata: asJson({
      type: input.type,
      target: target.storedTarget ?? null,
      scopeGuardTarget: target.guardTarget,
      stage,
      decision: decision.decision,
      reasons: decision.reasons,
      jobRunId: run.id,
    }),
  });

  if (!decision.allowed) return job;
  try {
    await enqueueRun(queue, {
      jobId: job.id,
      jobRunId: run.id,
      programId: input.programId,
      type: input.type,
      stage,
      target: target.storedTarget,
      config: input.config,
      manualApproved: input.manualApproved,
    });
  } catch (error) {
    await prisma.$transaction([
      prisma.job.update({ where: { id: job.id }, data: { status: "failed", error: "Unable to enqueue job" } }),
      prisma.jobRun.update({ where: { id: run.id }, data: { status: "failed", error: "Unable to enqueue job", finishedAt: new Date() } }),
    ]);
    await createAuditLog(prisma, { userId, programId: input.programId, action: "job.failed", entityType: "job", entityId: job.id, metadata: asJson({ reason: "queue_enqueue_failed" }) });
    throw new ApiError(500, "INTERNAL_ERROR", "Unable to enqueue job");
  }
  return job;
}

export async function retryJob(
  prisma: PrismaClient,
  queue: Queue<ReconQueueJobData>,
  jobId: string,
  userId: string,
  changes: { target?: string; manualApproved?: boolean },
) {
  const existing = await prisma.job.findUnique({ where: { id: jobId } });
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Job not found");
  if (!new Set(["failed", "cancelled", "blocked"]).has(existing.status)) {
    throw new ApiError(409, "CONFLICT", "Only failed, cancelled, or blocked jobs can be retried");
  }
  if (!existing.programId) throw new ApiError(400, "BAD_REQUEST", "Job has no program");
  const type = existing.type as ReconJobType;
  const target = await resolveJobTarget(prisma, {
    programId: existing.programId,
    type,
    target: changes.target ?? existing.target ?? undefined,
  });
  const stage = RECON_JOB_DEFAULT_STAGES[type];
  const manualApproved = changes.manualApproved ?? existing.manualApproved;
  const decision = await evaluateScopeGuard(prisma, { programId: existing.programId, target: target.guardTarget, jobType: type, stage, manualApproved }, { userId });
  const status = decision.allowed ? "queued" : "blocked";
  const run = await prisma.jobRun.create({ data: { jobId, programId: existing.programId, type, status, logs: initialLog(decision.allowed ? "Retry queued after Scope Guard validation" : "Retry blocked by Scope Guard", decision.allowed ? "info" : "warn") } });
  await prisma.job.update({ where: { id: jobId }, data: { status, stage, target: target.storedTarget, manualApproved, scopeGuardDecision: asJson(decision), error: null } });
  await createAuditLog(prisma, { userId, programId: existing.programId, action: "job.retried", entityType: "job", entityId: jobId, metadata: asJson({ jobRunId: run.id, decision: decision.decision, reasons: decision.reasons }) });
  if (decision.allowed) {
    try {
      await enqueueRun(queue, { jobId, jobRunId: run.id, programId: existing.programId, type, stage, target: target.storedTarget, config: existing.config, manualApproved });
    } catch {
      await prisma.$transaction([
        prisma.job.update({ where: { id: jobId }, data: { status: "failed", error: "Unable to enqueue retry" } }),
        prisma.jobRun.update({ where: { id: run.id }, data: { status: "failed", error: "Unable to enqueue retry", finishedAt: new Date() } }),
      ]);
      await createAuditLog(prisma, { userId, programId: existing.programId, action: "job.failed", entityType: "job", entityId: jobId, metadata: asJson({ jobRunId: run.id, reason: "queue_enqueue_failed" }) });
      throw new ApiError(500, "INTERNAL_ERROR", "Unable to enqueue retry");
    }
  } else {
    await createAuditLog(prisma, { userId, programId: existing.programId, action: "job.blocked", entityType: "job", entityId: jobId, metadata: asJson({ jobRunId: run.id, reasons: decision.reasons }) });
  }
  return prisma.job.findUnique({ where: { id: jobId }, include: jobDetailInclude });
}
