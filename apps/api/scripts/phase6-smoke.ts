import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { createReconWorker } from "../../worker/src/recon-worker.js";
import { parseSubfinder } from "../../worker/src/tools/parsers/subfinder.parser.js";
import { parseDnsx } from "../../worker/src/tools/parsers/dnsx.parser.js";
import { parseHttpx } from "../../worker/src/tools/parsers/httpx.parser.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const expectStatus = (actual: number, expected: number, label: string) => { if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`); };

async function main() {
  const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "bountyops-phase6-"));
  try {
    const subfinderPath = path.join(fixtureDirectory, "subfinder.jsonl"); const dnsxPath = path.join(fixtureDirectory, "dnsx.jsonl"); const httpxPath = path.join(fixtureDirectory, "httpx.jsonl");
    await writeFile(subfinderPath, '{"host":"api.phase6-smoke.invalid","source":"fixture"}\nnot a host\n');
    await writeFile(dnsxPath, '{"host":"api.phase6-smoke.invalid","a":["127.0.0.1"],"cname":["edge.phase6-smoke.invalid"]}\n');
    await writeFile(httpxPath, '{"url":"https://api.phase6-smoke.invalid/login","status_code":200,"title":"Login","tech":["Fixture"],"response_time":"10ms"}\n');
    const [subfinder, dnsx, httpx] = await Promise.all([parseSubfinder(subfinderPath), parseDnsx(dnsxPath), parseHttpx(httpxPath)]);
    if (subfinder.results.length !== 1 || dnsx.results[0]?.records.length !== 2 || httpx.results[0]?.statusCode !== 200) throw new Error("Phase 6 parser fixtures failed");
  } finally { await rm(fixtureDirectory, { recursive: true, force: true }); }
  const app = await buildApp();
  const runtime = await createReconWorker(process.env.REDIS_URL ?? "redis://localhost:6379");
  let programId = "";
  try {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
    expectStatus(login.statusCode, 200, "login");
    const cookie = login.headers["set-cookie"]?.split(";")[0]; if (!cookie) throw new Error("No session cookie");
    const headers = { cookie };
    const toolHealth = await app.inject({ method: "GET", url: "/tools/health", headers });
    expectStatus(toolHealth.statusCode, 200, "tool health");
    const tools = toolHealth.json() as Array<{ name: "subfinder" | "dnsx" | "httpx"; available: boolean }>;
    if (tools.length !== 3) throw new Error("Tool health did not return all Phase 6 tools");

    const configured = process.env.BOUNTYOPS_SMOKE_RECON_TARGET?.trim();
    let domain = "phase6-smoke.invalid";
    if (configured) {
      try { domain = new URL(configured.includes("://") ? configured : `https://${configured}`).hostname; } catch { throw new Error("BOUNTYOPS_SMOKE_RECON_TARGET is not a valid domain or URL"); }
    }
    const program = await app.inject({ method: "POST", url: "/programs", headers, payload: { platform: "custom", name: `Phase 6 smoke ${Date.now()}`, status: "active", huntingStatus: "ongoing" } });
    expectStatus(program.statusCode, 201, "create program"); programId = program.json().id as string;
    for (const scope of [{ asset: domain, assetType: "domain" }, { asset: `*.${domain}`, assetType: "wildcard_domain" }]) {
      const response = await app.inject({ method: "POST", url: `/programs/${programId}/scopes`, headers, payload: { ...scope, isInScope: true, bountyEligible: true } });
      expectStatus(response.statusCode, 201, "create scope");
    }
    const rules = await app.inject({ method: "PUT", url: `/programs/${programId}/rules`, headers, payload: { automationAllowed: "yes", aggressiveAllowed: true, rateLimitRps: 1, maxConcurrency: 1, forbiddenActions: ["dos", "bruteforce"], authTestingAllowed: false, dosTestingAllowed: false } });
    expectStatus(rules.statusCode, 200, "update rules");
    const emptyAssets = await app.inject({ method: "GET", url: `/assets?programId=${programId}`, headers });
    expectStatus(emptyAssets.statusCode, 200, "empty assets"); if ((emptyAssets.json() as unknown[]).length !== 0) throw new Error("Fresh smoke program has assets before recon");

    const blocked = await app.inject({ method: "POST", url: "/jobs", headers, payload: { programId, type: "tls_enrichment", target: "outside-scope.invalid" } });
    expectStatus(blocked.statusCode, 201, "blocked job"); const blockedJob = blocked.json() as { status: string; runs: Array<{ id: string }> };
    if (blockedJob.status !== "blocked" || await app.reconQueue.getJob(blockedJob.runs[0]!.id)) throw new Error("Blocked job was enqueued");

    const waitFor = async (jobId: string, expected: string, timeout = 30_000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) { const response = await app.inject({ method: "GET", url: `/jobs/${jobId}`, headers }); const job = response.json() as { status: string }; if (job.status === expected) return response.json(); if (["failed", "success"].includes(job.status) && job.status !== expected) throw new Error(`Job reached ${job.status}, expected ${expected}`); await pause(200); }
      throw new Error(`Timed out waiting for job ${jobId}`);
    };

    let missingToolTest: string | null = null;
    const missing = tools.find((tool) => !tool.available);
    if (missing) {
      const jobType = { subfinder: "subdomain_enum", dnsx: "dns_resolve", httpx: "http_probe" }[missing.name];
      const response = await app.inject({ method: "POST", url: "/jobs", headers, payload: { programId, type: jobType, target: domain } });
      expectStatus(response.statusCode, 201, "missing tool job"); const job = response.json() as { id: string };
      const failed = await waitFor(job.id, "failed") as { runs: Array<{ toolRuns: Array<{ error: string | null }> }> };
      const logs = await app.inject({ method: "GET", url: `/jobs/${job.id}/logs`, headers });
      if (!JSON.stringify(logs.json()).includes("not found in PATH")) throw new Error("Missing tool failure was not clear in job logs");
      if (!failed.runs[0]?.toolRuns.some((run) => run.error?.includes("not found in PATH"))) throw new Error("Missing tool ToolRun did not persist the error");
      missingToolTest = missing.name;
    }

    let realReconJob: string | null = null;
    if (configured) {
      const response = await app.inject({ method: "POST", url: "/jobs", headers, payload: { programId, type: "full_deep_recon", target: domain } });
      expectStatus(response.statusCode, 201, "authorized real recon job"); const job = response.json() as { id: string }; realReconJob = job.id;
      await waitFor(job.id, tools.every((tool) => tool.available) ? "success" : "failed", 30 * 60_000);
    }

    const archive = await app.inject({ method: "DELETE", url: `/programs/${programId}`, headers }); expectStatus(archive.statusCode, 200, "archive program");
    console.log(JSON.stringify({ success: true, tools, blockedJobPersisted: true, missingToolTest, realRecon: configured ? "executed_for_explicit_target" : "skipped_no_BOUNTYOPS_SMOKE_RECON_TARGET", realReconJob }, null, 2));
  } finally {
    if (programId) await app.prisma.program.updateMany({ where: { id: programId }, data: { status: "archived", huntingStatus: "not_hunting" } });
    await runtime.close(); await app.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
