import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { fingerprintHttpMetadata, scoreAsset, scoreHttpService } from "../../worker/src/services/scoring.service.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const expectStatus = (actual: number, expected: number, label: string) => { if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${actual}`); };

async function main() {
  const app = await buildApp();
  let programId = "";
  try {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
    expectStatus(login.statusCode, 200, "login");
    const cookie = login.headers["set-cookie"]?.split(";")[0]; if (!cookie) throw new Error("No session cookie");
    const headers = { cookie };
    const program = await app.inject({ method: "POST", url: "/programs", headers, payload: { platform: "custom", name: `Phase 7 smoke ${Date.now()}`, status: "active", huntingStatus: "ongoing" } });
    expectStatus(program.statusCode, 201, "create program"); programId = program.json().id as string;

    const asset = await app.prisma.asset.create({ data: { programId, type: "host", value: "api-staging.phase7.invalid", normalizedValue: "api-staging.phase7.invalid", scopeStatus: "in_scope", status: "live", sourceTools: ["fixture"] } });
    const metadata = { statusCode: 403, title: "GraphQL Swagger Admin Login", webserver: "Express", technologies: ["GraphQL", "Express"], contentLength: 8192 };
    const service = await app.prisma.httpService.create({ data: { programId, assetId: asset.id, url: "https://api-staging.phase7.invalid:8443/graphql/swagger/admin/login", normalizedUrl: "https://api-staging.phase7.invalid:8443/graphql/swagger/admin/login", scheme: "https", host: asset.normalizedValue, port: 8443, ...metadata, ...fingerprintHttpMetadata(metadata) } });
    await scoreAsset(asset.id, true);
    await scoreHttpService(service.id, { isNewAsset: true, duplicateFingerprint: false });

    const explanationResponse = await app.inject({ method: "GET", url: `/assets/${asset.id}/score-explanation`, headers });
    expectStatus(explanationResponse.statusCode, 200, "score explanation");
    const explanation = explanationResponse.json() as { autoScore: number; finalScore: number; priority: string; categories: string[]; reasonTags: string[]; events: unknown[] };
    for (const category of ["api", "graphql", "swagger_openapi", "admin_dashboard", "login", "staging_dev"]) if (!explanation.categories.includes(category)) throw new Error(`Missing expected category ${category}`);
    for (const tag of ["api_host", "graphql_detected", "swagger_detected", "admin_detected", "login_detected", "staging_keyword", "interesting_403", "unusual_port"]) if (!explanation.reasonTags.includes(tag)) throw new Error(`Missing expected reason tag ${tag}`);
    if (explanation.autoScore < 15 || explanation.priority !== "P1" || explanation.events.length < 8) throw new Error("Scoring thresholds or history are incorrect");
    const filteredAssets = await app.inject({ method: "GET", url: `/assets?programId=${programId}&category=graphql&reasonTag=graphql_detected&priority=P1&hasManualScore=false`, headers });
    expectStatus(filteredAssets.statusCode, 200, "scored asset filters"); if (!(filteredAssets.json() as Array<{ id: string }>).some((item) => item.id === asset.id)) throw new Error("Score/category filters did not return the fixture asset");

    const rules = await app.inject({ method: "GET", url: "/scoring/rules", headers });
    expectStatus(rules.statusCode, 200, "scoring rules"); if (!(rules.json() as { rules: unknown[] }).rules.length) throw new Error("Scoring rules are empty");
    const invalidRules = await app.inject({ method: "PUT", url: "/scoring/rules", headers, payload: { yaml: "rules: [invalid" } });
    expectStatus(invalidRules.statusCode, 400, "invalid scoring rules");
    const preview = await app.inject({ method: "POST", url: "/scoring/preview", headers, payload: { entityType: "http_service", host: asset.normalizedValue, url: service.url, title: service.title, statusCode: 403, port: 8443, technologies: ["GraphQL", "Express"] } });
    expectStatus(preview.statusCode, 200, "scoring preview"); if ((preview.json() as { priority: string }).priority !== "P1") throw new Error("Scoring preview did not produce P1");

    const override = await app.inject({ method: "PATCH", url: `/assets/${asset.id}/manual-score`, headers, payload: { manualScore: 18 } });
    expectStatus(override.statusCode, 200, "manual score override"); if ((override.json() as { finalScore: number }).finalScore !== 18) throw new Error("Manual score was not applied");
    const queue = await app.inject({ method: "GET", url: `/manual-review/queue?programId=${programId}`, headers });
    expectStatus(queue.statusCode, 200, "manual review queue"); if (!(queue.json() as Array<{ id: string }>).some((item) => item.id === asset.id)) throw new Error("Scored asset missing from manual review queue");
    const cleared = await app.inject({ method: "PATCH", url: `/assets/${asset.id}/manual-score`, headers, payload: { manualScore: null } });
    expectStatus(cleared.statusCode, 200, "clear manual score"); if ((cleared.json() as { finalScore: number }).finalScore !== explanation.autoScore) throw new Error("Clearing override did not restore autoScore");

    console.log(JSON.stringify({ success: true, publicRecon: "not_run", autoScore: explanation.autoScore, priority: explanation.priority, categories: explanation.categories, reasonTags: explanation.reasonTags, scoreEvents: explanation.events.length, fingerprintStored: true }, null, 2));
  } finally {
    if (programId) {
      await app.prisma.$transaction([
        app.prisma.scoreEvent.deleteMany({ where: { programId } }),
        app.prisma.entityClassification.deleteMany({ where: { programId } }),
        app.prisma.entityChange.deleteMany({ where: { programId } }),
        app.prisma.program.deleteMany({ where: { id: programId } }),
      ]);
    }
    await app.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
