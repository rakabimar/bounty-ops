import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { createReconWorker } from "../../worker/src/recon-worker.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const expectStatus = (actual: number, expected: number, label: string) => {
  if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`);
};

async function main() {
const app = await buildApp();
const runtime = await createReconWorker(process.env.REDIS_URL ?? "redis://localhost:6379");
let programId = "";

try {
  const unauthorized = await app.inject({ method: "GET", url: "/jobs" });
  expectStatus(unauthorized.statusCode, 401, "protected jobs list");
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  expectStatus(login.statusCode, 200, "login");
  const cookie = login.headers["set-cookie"]?.split(";")[0];
  if (!cookie) throw new Error("login did not return a session cookie");
  const auth = { cookie };

  const program = await app.inject({ method: "POST", url: "/programs", headers: auth, payload: { platform: "custom", name: `Phase 5 smoke ${Date.now()}`, status: "active", huntingStatus: "ongoing" } });
  expectStatus(program.statusCode, 201, "create program");
  programId = program.json().id as string;

  const scope = await app.inject({ method: "POST", url: `/programs/${programId}/scopes`, headers: auth, payload: { asset: "*.phase5.invalid", assetType: "wildcard_domain", isInScope: true, bountyEligible: true } });
  expectStatus(scope.statusCode, 201, "create scope");
  const rules = await app.inject({ method: "PUT", url: `/programs/${programId}/rules`, headers: auth, payload: { automationAllowed: "yes", aggressiveAllowed: true, rateLimitRps: 3, maxConcurrency: 2, forbiddenActions: ["dos"], authTestingAllowed: false, dosTestingAllowed: false } });
  expectStatus(rules.statusCode, 200, "update rules");

  const create = async (type: string, target?: string, manualApproved = false) => {
    const response = await app.inject({ method: "POST", url: "/jobs", headers: auth, payload: { programId, type, ...(target ? { target } : {}), config: {}, manualApproved } });
    expectStatus(response.statusCode, 201, `create ${type}`);
    return response.json() as { id: string; status: string; runs: Array<{ id: string }> };
  };
  const waitFor = async (id: string, status: string, timeout = 8_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const response = await app.inject({ method: "GET", url: `/jobs/${id}`, headers: auth });
      expectStatus(response.statusCode, 200, "get job");
      const job = response.json() as { status: string };
      if (job.status === status) return;
      if (job.status === "failed") throw new Error(`job ${id} failed`);
      await pause(100);
    }
    throw new Error(`job ${id} did not reach ${status}`);
  };

  const allowed = await create("tls_enrichment", "api.phase5.invalid");
  if (allowed.status !== "queued") throw new Error("in-scope HTTP probe was not queued");
  await waitFor(allowed.id, "success");
  const list = await app.inject({ method: "GET", url: `/jobs?programId=${programId}`, headers: auth });
  expectStatus(list.statusCode, 200, "jobs list");
  if (!(list.json() as Array<{ id: string }>).some((job) => job.id === allowed.id)) throw new Error("jobs list omitted created job");
  const jobLogs = await app.inject({ method: "GET", url: `/jobs/${allowed.id}/logs`, headers: auth });
  expectStatus(jobLogs.statusCode, 200, "job logs");
  if (!(jobLogs.json().logs as unknown[]).length) throw new Error("successful job has no logs");

  const blocked = await create("tls_enrichment", "out.phase5.invalid.example");
  if (blocked.status !== "blocked") throw new Error("out-of-scope job was not blocked");
  if (await app.reconQueue.getJob(blocked.runs[0]!.id)) throw new Error("blocked job entered the queue");

  const manualBlocked = await create("nmap_verification", "api.phase5.invalid");
  if (manualBlocked.status !== "blocked") throw new Error("manual job without approval was not blocked");
  const manualAllowed = await create("nmap_verification", "api.phase5.invalid", true);
  await waitFor(manualAllowed.id, "success");

  await runtime.worker.pause(true);
  const cancellable = await create("tls_enrichment", "api.phase5.invalid");
  const cancelled = await app.inject({ method: "POST", url: `/jobs/${cancellable.id}/cancel`, headers: auth });
  expectStatus(cancelled.statusCode, 200, "cancel job");
  if (cancelled.json().status !== "cancelled") throw new Error("job was not cancelled");
  await runtime.worker.resume();
  const retried = await app.inject({ method: "POST", url: `/jobs/${cancellable.id}/retry`, headers: auth, payload: {} });
  expectStatus(retried.statusCode, 200, "retry job");
  await waitFor(cancellable.id, "success");

  const health = await app.inject({ method: "GET", url: "/jobs/queue/health", headers: auth });
  expectStatus(health.statusCode, 200, "queue health");
  if (health.json().redis !== "ok") throw new Error("queue health did not report Redis ok");
  const audits = await app.inject({ method: "GET", url: `/audit-logs?programId=${programId}&limit=100`, headers: auth });
  expectStatus(audits.statusCode, 200, "audit logs");
  const actions = new Set((audits.json() as Array<{ action: string }>).map((item) => item.action));
  for (const action of ["job.queued", "job.blocked", "job.running", "job.completed", "job.cancelled", "job.retried"]) {
    if (!actions.has(action)) throw new Error(`missing audit action ${action}`);
  }

  const archive = await app.inject({ method: "DELETE", url: `/programs/${programId}`, headers: auth });
  expectStatus(archive.statusCode, 200, "archive smoke program");
  console.log(JSON.stringify({ success: true, queue: "recon-jobs", allowedJob: allowed.id, blockedJob: blocked.id, manualApprovedJob: manualAllowed.id, retriedJob: cancellable.id }, null, 2));
} finally {
  if (programId) {
    await app.prisma.program.updateMany({ where: { id: programId, status: { not: "archived" } }, data: { status: "archived", huntingStatus: "not_hunting" } });
  }
  await runtime.close();
  await app.close();
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
