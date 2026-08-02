import { evaluateScoring } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";
import { loadScoringConfig, loadScoringConfigWithSource, saveScoringConfig } from "./scoring-config.service.js";

const updateSchema = z.object({ yaml: z.string().min(1).max(1_000_000) });
const previewSchema = z.object({
  entityType: z.enum(["asset", "http_service", "url", "endpoint", "scanner_finding", "js_file", "secret_candidate", "job"]),
  host: z.string().optional(), url: z.string().optional(), path: z.string().optional(), title: z.string().optional(),
  statusCode: z.number().int().optional(), port: z.number().int().min(1).max(65535).optional(),
  technologies: z.array(z.string()).optional(), contentType: z.string().optional(), isNew: z.boolean().optional(),
  duplicateFingerprint: z.boolean().optional(),
});

export async function scoringRoutes(app: FastifyInstance): Promise<void> {
  app.get("/scoring/rules", { preHandler: app.requireAuth }, async () => loadScoringConfigWithSource());

  app.put("/scoring/rules", { preHandler: app.requireAuth }, async (request) => {
    const body = parseRequest(updateSchema, request.body);
    const config = await saveScoringConfig(body.yaml);
    await createAuditLog(app.prisma, { userId: request.user.sub, action: "scoring.rules.updated", entityType: "scoring_config", metadata: { ruleCount: config.rules.length } });
    return config;
  });

  app.post("/scoring/preview", { preHandler: app.requireAuth }, async (request) => {
    const input = parseRequest(previewSchema, request.body);
    return evaluateScoring(await loadScoringConfig(), input);
  });
}
