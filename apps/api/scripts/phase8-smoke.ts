import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const expectStatus = (actual: number, expected: number, label: string) => { if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`); };

async function main() {
  const app = await buildApp(); let programId = "";
  try {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } }); expectStatus(login.statusCode, 200, "login");
    const cookie = login.headers["set-cookie"]?.split(";")[0]; if (!cookie) throw new Error("No session cookie"); const headers = { cookie };
    const programResponse = await app.inject({ method: "POST", url: "/programs", headers, payload: { platform: "custom", name: `Phase 8 smoke ${Date.now()}`, status: "active", huntingStatus: "ongoing" } }); expectStatus(programResponse.statusCode, 201, "program create"); programId = programResponse.json().id as string;
    const scope = await app.inject({ method: "POST", url: `/programs/${programId}/scopes`, headers, payload: { asset: "*.example.com", assetType: "wildcard_domain", isInScope: true, bountyEligible: true } }); expectStatus(scope.statusCode, 201, "scope create");
    const rules = await app.inject({ method: "PUT", url: `/programs/${programId}/rules`, headers, payload: { automationAllowed: "yes", aggressiveAllowed: true, rateLimitRps: 1, maxConcurrency: 1, forbiddenActions: ["dos", "bruteforce"], authTestingAllowed: false, dosTestingAllowed: false } }); expectStatus(rules.statusCode, 200, "rules update");
    const asset = await app.prisma.asset.create({ data: { programId, type: "subdomain", value: "api.example.com", normalizedValue: "api.example.com", scopeStatus: "in_scope", status: "live", sourceTools: ["phase8_fixture"] } });

    const urlResponse = await app.inject({ method: "POST", url: "/urls", headers, payload: { programId, assetId: asset.id, url: "https://api.example.com/graphql?operation=Introspection", sourceTools: ["manual"], title: "GraphQL Playground", statusCode: 200, contentType: "text/html", technologies: ["GraphQL"] } }); expectStatus(urlResponse.statusCode, 201, "URL create"); const url = urlResponse.json() as { id: string; autoScore: number };
    const endpointResponse = await app.inject({ method: "POST", url: "/endpoints", headers, payload: { programId, assetId: asset.id, urlId: url.id, method: "POST", path: "/graphql", fullUrl: "https://api.example.com/graphql", statusCode: 200, contentType: "application/json", authRequired: "unknown", source: "manual", parameters: [{ name: "query", location: "body", exampleValue: "query { __schema { types { name } } }", interesting: true }] } }); expectStatus(endpointResponse.statusCode, 201, "endpoint create"); const endpoint = endpointResponse.json() as { id: string; autoScore: number };
    const findingResponse = await app.inject({ method: "POST", url: "/scanner-findings", headers, payload: { programId, assetId: asset.id, urlId: url.id, endpointId: endpoint.id, tool: "manual", severity: "high", templateId: "manual-graphql-introspection", name: "GraphQL Introspection Candidate", description: "Manual fixture, not a confirmed vulnerability", matcher: "manual", matchedUrl: "https://api.example.com/graphql", evidenceSnippet: "Introspection response candidate", extractedResults: ["__schema"] } }); expectStatus(findingResponse.statusCode, 201, "finding create"); const finding = findingResponse.json() as { id: string };

    const assetDetail = await app.inject({ method: "GET", url: `/assets/${asset.id}`, headers }); expectStatus(assetDetail.statusCode, 200, "asset detail"); const assetBody = assetDetail.json() as { urlsCount: number; endpointsCount: number; scannerFindingsCount: number; asset: { autoScore: number } };
    if (assetBody.urlsCount !== 1 || assetBody.endpointsCount !== 1 || assetBody.scannerFindingsCount !== 1) throw new Error("Asset detail related counts are incorrect");
    if (assetBody.asset.autoScore < Math.max(url.autoScore, endpoint.autoScore)) throw new Error("Asset score did not aggregate URL/endpoint score");
    for (const [path, label] of [[`/assets/${asset.id}/urls`, "asset URLs"], [`/assets/${asset.id}/endpoints`, "asset endpoints"], [`/assets/${asset.id}/scanner-findings`, "asset findings"]] as const) { const response = await app.inject({ method: "GET", url: path, headers }); expectStatus(response.statusCode, 200, label); if ((response.json() as unknown[]).length !== 1) throw new Error(`${label} missing fixture`); }

    const urlDetail = await app.inject({ method: "GET", url: `/urls/${url.id}`, headers }); expectStatus(urlDetail.statusCode, 200, "URL detail"); const urlBody = urlDetail.json() as { asset: { id: string }; endpoints: Array<{ id: string }>; scannerFindings: Array<{ id: string }> }; if (urlBody.asset.id !== asset.id || urlBody.endpoints[0]?.id !== endpoint.id || urlBody.scannerFindings[0]?.id !== finding.id) throw new Error("URL detail relations incorrect");
    const endpointDetail = await app.inject({ method: "GET", url: `/endpoints/${endpoint.id}`, headers }); expectStatus(endpointDetail.statusCode, 200, "endpoint detail"); const endpointBody = endpointDetail.json() as { parameters: Array<{ name: string }>; scannerFindings: Array<{ id: string }> }; if (endpointBody.parameters[0]?.name !== "query" || endpointBody.scannerFindings[0]?.id !== finding.id) throw new Error("Endpoint detail relations incorrect");
    const findingDetail = await app.inject({ method: "GET", url: `/scanner-findings/${finding.id}`, headers }); expectStatus(findingDetail.statusCode, 200, "finding detail"); const findingBody = findingDetail.json() as { asset: { id: string }; url: { id: string }; endpoint: { id: string } }; if (findingBody.asset.id !== asset.id || findingBody.url.id !== url.id || findingBody.endpoint.id !== endpoint.id) throw new Error("Finding detail relations incorrect");
    expectStatus((await app.inject({ method: "PATCH", url: `/urls/${url.id}/status`, headers, payload: { status: "promising" } })).statusCode, 200, "URL status");
    expectStatus((await app.inject({ method: "PATCH", url: `/endpoints/${endpoint.id}/status`, headers, payload: { status: "manual_started" } })).statusCode, 200, "endpoint status");
    expectStatus((await app.inject({ method: "PATCH", url: `/scanner-findings/${finding.id}/status`, headers, payload: { status: "potential_bug" } })).statusCode, 200, "finding status");
    for (const [path, label] of [[`/urls/${url.id}/score-explanation`, "URL score"], [`/endpoints/${endpoint.id}/score-explanation`, "endpoint score"]] as const) { const response = await app.inject({ method: "GET", url: path, headers }); expectStatus(response.statusCode, 200, label); if (!(response.json() as { events: unknown[] }).events.length) throw new Error(`${label} has no events`); }
    const audit = await app.inject({ method: "GET", url: `/audit-logs?programId=${programId}&limit=100`, headers }); expectStatus(audit.statusCode, 200, "audit"); const actions = (audit.json() as Array<{ action: string }>).map((entry) => entry.action); for (const action of ["url.created", "endpoint.created", "scanner_finding.created"]) if (!actions.includes(action)) throw new Error(`Missing audit action ${action}`);
    console.log(JSON.stringify({ success: true, publicRecon: "not_run", relationsVerified: true, scoringVerified: true, statusUpdatesVerified: true, auditVerified: true }, null, 2));
  } finally {
    if (programId) await app.prisma.$transaction([app.prisma.scoreEvent.deleteMany({ where: { programId } }), app.prisma.entityClassification.deleteMany({ where: { programId } }), app.prisma.entityChange.deleteMany({ where: { programId } }), app.prisma.scopeGuardCheck.deleteMany({ where: { programId } }), app.prisma.auditLog.deleteMany({ where: { programId } }), app.prisma.program.deleteMany({ where: { id: programId } })]);
    await app.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
