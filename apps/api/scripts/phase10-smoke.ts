import dotenv from "dotenv";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeUrl } from "@bountyops/shared";
import { buildApp } from "../src/app.js";
import { parseGau } from "../../worker/src/tools/parsers/gau.parser.js";
import { parseWaybackurls } from "../../worker/src/tools/parsers/waybackurls.parser.js";
import { parseKatana } from "../../worker/src/tools/parsers/katana.parser.js";
import { parseNuclei } from "../../worker/src/tools/parsers/nuclei.parser.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const expectStatus = (actual: number, expected: number, label: string) => { if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`); };

async function parserFixtures() {
  const directory = await mkdtemp(path.join(tmpdir(), "bountyops-phase10-"));
  try {
    const gauPath = path.join(directory, "gau.txt"); const waybackPath = path.join(directory, "wayback.txt"); const katanaPath = path.join(directory, "katana.jsonl"); const nucleiPath = path.join(directory, "nuclei.jsonl");
    await writeFile(gauPath, "https://api.example.com/graphql?b=2&a=1#fragment\ninvalid url\n");
    await writeFile(waybackPath, "https://api.example.com/graphql?a=x&b=y\nhttps://api.example.com/archive\n");
    await writeFile(katanaPath, '{"request":{"endpoint":"https://api.example.com/api/v1/users?id=1","method":"GET"},"response":{"status_code":200,"content_type":"application/json"}}\nhttps://api.example.com/graphql?query=x\nnot-a-url\n');
    await writeFile(nucleiPath, '{"template-id":"exposure-test","info":{"name":"Safe exposure candidate","severity":"medium"},"matcher-name":"fixture","matched-at":"https://api.example.com/graphql","extracted-results":["token=super-secret-value"]}\nnot-json\n');
    const [gau, wayback, katana, nuclei] = await Promise.all([parseGau(gauPath), parseWaybackurls(waybackPath), parseKatana(katanaPath), parseNuclei(nucleiPath)]);
    if (gau.parsedCount !== 1 || wayback.parsedCount !== 2 || katana.urls.length !== 2 || katana.endpoints.length !== 2 || nuclei.parsedCount !== 1) throw new Error("Phase 10 parser fixtures failed");
    if (nuclei.results[0]?.evidenceSnippet.includes("super-secret-value")) throw new Error("Nuclei evidence redaction failed");
    if (normalizeUrl("HTTPS://API.EXAMPLE.COM:443/graphql?b=2&a=1#x") !== normalizeUrl("https://api.example.com/graphql?a=other&b=other")) throw new Error("URL normalization/dedupe fixture failed");
    return { gau: gau.parsedCount, waybackurls: wayback.parsedCount, katanaUrls: katana.urls.length, katanaEndpoints: katana.endpoints.length, nuclei: nuclei.parsedCount };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function main() {
  const parserResults = await parserFixtures();
  const app = await buildApp(); let programId = ""; let worker: { close(): Promise<void> } | null = null;
  try {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } }); expectStatus(login.statusCode, 200, "login");
    const cookie = login.headers["set-cookie"]?.split(";")[0]; if (!cookie) throw new Error("No session cookie"); const headers = { cookie };
    const toolHealth = await app.inject({ method: "GET", url: "/tools/health", headers }); expectStatus(toolHealth.statusCode, 200, "tool health");
    const tools = toolHealth.json() as Array<{ name: string; available: boolean }>;
    for (const name of ["subfinder", "dnsx", "httpx", "gau", "waybackurls", "katana", "nuclei"]) if (!tools.some((tool) => tool.name === name)) throw new Error(`Tool health omitted ${name}`);

    const configuredTarget = process.env.BOUNTYOPS_SMOKE_RECON_TARGET?.trim();
    const allowNetwork = process.env.BOUNTYOPS_SMOKE_RECON_ALLOW_NETWORK === "1";
    const allowActive = process.env.BOUNTYOPS_SMOKE_RECON_ALLOW_ACTIVE === "1";
    if ((allowNetwork || allowActive) && !configuredTarget) throw new Error("Network smoke flags require BOUNTYOPS_SMOKE_RECON_TARGET");
    if (allowActive && !allowNetwork) throw new Error("Active smoke requires BOUNTYOPS_SMOKE_RECON_ALLOW_NETWORK=1");
    const domain = configuredTarget ? new URL(configuredTarget.includes("://") ? configuredTarget : `https://${configuredTarget}`).hostname : "example.com";

    const programResponse = await app.inject({ method: "POST", url: "/programs", headers, payload: { platform: "custom", name: `Phase 10 smoke ${Date.now()}`, status: "active", huntingStatus: "ongoing" } }); expectStatus(programResponse.statusCode, 201, "program create"); programId = programResponse.json().id as string;
    for (const scope of [{ asset: domain, assetType: "domain" }, { asset: `*.${domain}`, assetType: "wildcard_domain" }]) expectStatus((await app.inject({ method: "POST", url: `/programs/${programId}/scopes`, headers, payload: { ...scope, isInScope: true, bountyEligible: true } })).statusCode, 201, "scope create");
    expectStatus((await app.inject({ method: "PUT", url: `/programs/${programId}/rules`, headers, payload: { automationAllowed: "yes", aggressiveAllowed: true, rateLimitRps: 1, maxConcurrency: 1, forbiddenActions: ["dos", "bruteforce"], authTestingAllowed: false, dosTestingAllowed: false } })).statusCode, 200, "rules update");

    const host = configuredTarget ? `smoke.${domain}` : "api.example.com";
    const asset = await app.prisma.asset.create({ data: { programId, type: "subdomain", value: host, normalizedValue: host, scopeStatus: "in_scope", status: "live", sourceTools: ["phase10_fixture"] } });
    const urlResponse = await app.inject({ method: "POST", url: "/urls", headers, payload: { programId, assetId: asset.id, url: `https://${host}/graphql?a=1&b=2`, sourceTools: ["gau", "katana"], title: "GraphQL API", statusCode: 200, contentType: "application/json" } }); expectStatus(urlResponse.statusCode, 201, "URL fixture"); const url = urlResponse.json() as { id: string; finalScore: number };
    const duplicate = await app.inject({ method: "POST", url: "/urls", headers, payload: { programId, assetId: asset.id, url: `https://${host}/graphql?b=other&a=other#fragment`, sourceTools: ["waybackurls"] } }); expectStatus(duplicate.statusCode, 409, "URL dedupe");
    const endpointResponse = await app.inject({ method: "POST", url: "/endpoints", headers, payload: { programId, assetId: asset.id, urlId: url.id, method: "POST", path: "/graphql", fullUrl: `https://${host}/graphql`, statusCode: 200, contentType: "application/json", source: "katana", parameters: [{ name: "query", location: "body", interesting: true }] } }); expectStatus(endpointResponse.statusCode, 201, "endpoint fixture"); const endpoint = endpointResponse.json() as { id: string; finalScore: number };
    const findingResponse = await app.inject({ method: "POST", url: "/scanner-findings", headers, payload: { programId, assetId: asset.id, urlId: url.id, endpointId: endpoint.id, tool: "nuclei", severity: "medium", templateId: "exposure-fixture", name: "Safe exposure candidate", matchedUrl: `https://${host}/graphql`, evidenceSnippet: "Controlled fixture" } }); expectStatus(findingResponse.statusCode, 201, "finding fixture"); const finding = findingResponse.json() as { id: string; status: string }; if (finding.status !== "new") throw new Error("Scanner Finding was promoted without manual review");
    const outside = await app.inject({ method: "POST", url: "/urls", headers, payload: { programId, url: "https://outside.invalid/path", sourceTools: ["gau"] } }); expectStatus(outside.statusCode, 409, "out-of-scope URL rejection");
    const blockedJobResponse = await app.inject({ method: "POST", url: "/jobs", headers, payload: { programId, type: "crawl", config: { targets: [`https://${host}`, "https://outside.invalid"] } } }); expectStatus(blockedJobResponse.statusCode, 201, "bulk-target blocked job"); const blockedJob = blockedJobResponse.json() as { status: string; runs: Array<{ id: string }> }; if (blockedJob.status !== "blocked" || await app.reconQueue.getJob(blockedJob.runs[0]!.id)) throw new Error("Mixed-scope active targets were partially enqueued");
    for (const [route, id] of [["urls", url.id], ["endpoints", endpoint.id], ["scanner-findings", finding.id]]) { const list = await app.inject({ method: "GET", url: `/${route}?programId=${programId}`, headers }); expectStatus(list.statusCode, 200, `${route} list`); if (!(list.json() as Array<{ id: string }>).some((item) => item.id === id)) throw new Error(`${route} fixture missing`); expectStatus((await app.inject({ method: "GET", url: `/${route}/${id}`, headers })).statusCode, 200, `${route} detail`); }
    if (url.finalScore <= 0 || endpoint.finalScore <= 0) throw new Error("URL/endpoint scoring was not applied");

    const networkJobs: Array<{ type: string; status: string }> = [];
    if (configuredTarget && allowNetwork) {
      const runtime = await import("../../worker/src/recon-worker.js"); worker = await runtime.createReconWorker(process.env.REDIS_URL ?? "redis://localhost:6379");
      const jobTypes = allowActive ? ["url_archive", "crawl", "nuclei_safe"] : ["url_archive"];
      for (const type of jobTypes) {
        const response = await app.inject({ method: "POST", url: "/jobs", headers, payload: { programId, type, target: configuredTarget } }); expectStatus(response.statusCode, 201, `${type} optional job`); const created = response.json() as { id: string };
        const deadline = Date.now() + 30 * 60_000; let status = "queued";
        while (Date.now() < deadline) { const detail = await app.inject({ method: "GET", url: `/jobs/${created.id}`, headers }); status = (detail.json() as { status: string }).status; if (["success", "failed", "blocked"].includes(status)) break; await pause(300); }
        networkJobs.push({ type, status });
      }
    }
    expectStatus((await app.inject({ method: "DELETE", url: `/programs/${programId}`, headers })).statusCode, 200, "archive program");
    console.log(JSON.stringify({ success: true, parserResults, tools, fixtures: { url: url.id, endpoint: endpoint.id, scannerFinding: finding.id }, mixedScopeJobBlocked: true, publicRecon: configuredTarget && allowNetwork ? "explicitly_authorized" : "not_run", activeRecon: configuredTarget && allowNetwork && allowActive ? "explicitly_authorized" : "not_run", networkJobs }, null, 2));
  } finally {
    if (worker) await worker.close();
    if (programId) await app.prisma.program.updateMany({ where: { id: programId }, data: { status: "archived", huntingStatus: "not_hunting" } });
    await app.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
