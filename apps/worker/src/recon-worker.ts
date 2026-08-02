import { Prisma, prisma } from "@bountyops/db";
import {
  FULL_DEEP_RECON_STAGES,
  RECON_QUEUE_NAME,
  type JobLogEntry,
  type ReconQueueJobData,
} from "@bountyops/shared";
import { Worker, type Job as QueueJob } from "bullmq";
import { Redis } from "ioredis";

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Simulated job failed";
}

function parseLogs(value: Prisma.JsonValue | null): JobLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as { message?: unknown }).message === "string") as unknown as JobLogEntry[];
}

function entry(message: string, level: JobLogEntry["level"] = "info", meta?: Record<string, unknown>): JobLogEntry {
  return { timestamp: new Date().toISOString(), level, message, ...(meta ? { meta } : {}) };
}

async function saveLogs(jobRunId: string, logs: JobLogEntry[]): Promise<void> {
  await prisma.jobRun.update({ where: { id: jobRunId }, data: { logs: logs as unknown as Prisma.InputJsonValue } });
}

async function audit(data: ReconQueueJobData, action: string, metadata?: Record<string, unknown>): Promise<void> {
  await prisma.auditLog.create({
    data: {
      programId: data.programId,
      action,
      entityType: "job",
      entityId: data.jobId,
      metadata: { jobRunId: data.jobRunId, type: data.type, ...(metadata ?? {}) } as Prisma.InputJsonValue,
    },
  });
}

async function processJob(queueJob: QueueJob<ReconQueueJobData>): Promise<void> {
  const data = queueJob.data;
  const record = await prisma.job.findUnique({ where: { id: data.jobId } });
  const run = await prisma.jobRun.findUnique({ where: { id: data.jobRunId } });
  if (!record || !run) throw new Error("Job or JobRun no longer exists");

  let logs = parseLogs(run.logs);
  if (record.status === "cancelled" || run.status === "cancelled") {
    logs.push(entry("Cancelled job skipped by worker", "warn"));
    await saveLogs(run.id, logs);
    return;
  }

  const startedAt = new Date();
  logs.push(entry("Job started", "info", { type: data.type, target: data.target ?? null }));
  const claimed = await prisma.$transaction(async (transaction) => {
    // Claim in the same Job -> JobRun lock order used by cancellation. A stale
    // worker read can therefore never overwrite a committed cancellation.
    const jobClaim = await transaction.job.updateMany({ where: { id: record.id, status: "queued" }, data: { status: "running", error: null } });
    if (jobClaim.count === 0) return false;
    const runClaim = await transaction.jobRun.updateMany({ where: { id: run.id, status: "queued" }, data: { status: "running", startedAt, logs: logs as unknown as Prisma.InputJsonValue, error: null } });
    if (runClaim.count === 0) throw new Error("JobRun could not be claimed");
    return true;
  });
  if (!claimed) {
    logs.push(entry("Job was cancelled before the worker could claim it", "warn"));
    await saveLogs(run.id, logs);
    return;
  }
  await audit(data, "job.running");

  try {
    if (data.type === "full_deep_recon") {
      for (const stage of FULL_DEEP_RECON_STAGES) {
        await delay(100);
        logs.push(entry(`Simulated stage completed: ${stage}`, "info", { simulated: true, stage }));
        await saveLogs(run.id, logs);
      }
    } else {
      await delay(500);
      logs.push(entry(`Simulated ${data.type} execution completed`, "info", { simulated: true }));
    }

    const latest = await prisma.job.findUnique({ where: { id: record.id }, select: { status: true } });
    if (latest?.status === "cancelled") {
      logs.push(entry("Job cancelled before simulated execution completed", "warn"));
      await prisma.jobRun.update({ where: { id: run.id }, data: { status: "cancelled", finishedAt: new Date(), durationMs: Date.now() - startedAt.getTime(), logs: logs as unknown as Prisma.InputJsonValue } });
      return;
    }

    const finishedAt = new Date();
    logs.push(entry("Job completed successfully", "info", { simulated: true }));
    const resultSummary = {
      simulated: true,
      type: data.type,
      target: data.target ?? null,
      ...(data.type === "full_deep_recon" ? { stages: FULL_DEEP_RECON_STAGES.length } : {}),
    };
    await prisma.$transaction([
      prisma.jobRun.update({ where: { id: run.id }, data: { status: "success", finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), logs: logs as unknown as Prisma.InputJsonValue, resultSummary: resultSummary as Prisma.InputJsonValue } }),
      prisma.job.update({ where: { id: record.id }, data: { status: "success", error: null } }),
    ]);
    await audit(data, "job.completed", { simulated: true });
  } catch (error) {
    const message = safeError(error);
    const finishedAt = new Date();
    logs.push(entry(message, "error"));
    await prisma.$transaction([
      prisma.jobRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), error: message, logs: logs as unknown as Prisma.InputJsonValue } }),
      prisma.job.update({ where: { id: record.id }, data: { status: "failed", error: message } }),
    ]);
    await audit(data, "job.failed", { error: message });
    throw error;
  }
}

export async function createReconWorker(redisUrl: string) {
  const connection = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 5_000,
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
  });
  connection.on("error", () => {
    // BullMQ emits operational errors on the worker below.
  });
  try {
    await connection.connect();
    const pong = await connection.ping();
    if (pong !== "PONG") throw new Error("Unexpected Redis ping response");
  } catch (error) {
    connection.disconnect();
    throw error;
  }

  const worker = new Worker<ReconQueueJobData>(RECON_QUEUE_NAME, processJob, {
    connection,
    concurrency: Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 1),
  });
  return {
    worker,
    async close() {
      await worker.close();
      connection.disconnect();
      await prisma.$disconnect();
    },
  };
}
