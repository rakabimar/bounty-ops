import { Prisma } from "@bountyops/db";
import type { FastifyInstance } from "fastify";
import { createAuditLog } from "../audit/audit.service.js";
import { AiProviderError, DeepSeekAiProvider, getAiHealth, resolveAiConfig } from "./deepseek.service.js";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const synthetic = { platform: "manual" as const, programName: "AI health test", handle: null, programUrl: null, scopes: [], rules: { automationAllowed: "unknown" as const, aggressiveAllowed: false, rateLimitRps: null, maxConcurrency: null, forbiddenActions: ["dos"], authTestingAllowed: false, dosTestingAllowed: false, notes: null }, requiredHeaders: [], safeHarborSummary: null, reportingNotes: null, warnings: [], overallConfidence: 20 };

export async function aiRoutes(app: FastifyInstance) {
  app.get("/ai/health", { preHandler: app.requireAuth }, async () => getAiHealth(app.prisma));
  app.post("/ai/test", { preHandler: app.requireAuth }, async (request) => {
    const config = await resolveAiConfig(app.prisma); const started = Date.now();
    try {
      const result = await new DeepSeekAiProvider(config).extractProgramPolicy({ platform: "manual", deterministic: synthetic, policyText: "Synthetic configuration test. No scope or authorization is stated." });
      await app.prisma.aiUsageLog.create({ data: { provider: "deepseek", model: result.model, purpose: "ai_test", inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens, totalTokens: result.usage?.totalTokens, cachedInputTokens: result.usage?.cachedInputTokens, requestId: result.requestId, success: true } });
      await createAuditLog(app.prisma, { userId: request.user.sub, action: "ai.test.success", entityType: "ai_provider", metadata: json({ provider: "deepseek", model: result.model, latencyMs: Date.now() - started }) });
      return { success: true, model: result.model, latencyMs: Date.now() - started, usage: result.usage ?? null };
    } catch (error) {
      const category = error instanceof AiProviderError ? error.category : "provider_error";
      await app.prisma.aiUsageLog.create({ data: { provider: "deepseek", model: config.model, purpose: "ai_test", success: false, errorCategory: category } });
      await createAuditLog(app.prisma, { userId: request.user.sub, action: "ai.test.failed", entityType: "ai_provider", metadata: json({ provider: "deepseek", model: config.model, errorCategory: category }) });
      return { success: false, model: config.model, latencyMs: Date.now() - started, error: "DeepSeek test failed", errorCategory: category };
    }
  });
}
