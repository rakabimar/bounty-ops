import { Prisma } from "@bountyops/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../env.js";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";

export const SETTING_KEYS = [
  "ai.enabled",
  "ai.provider",
  "ai.monthlyLimit",
  "ai.intakeFallbackThreshold",
  "deepseek.model",
  "deepseek.apiKey",
  "deepseek.baseUrl",
  "deepseek.timeoutMs",
  // Deprecated compatibility key. Phase 13 no longer reads it.
  "gemini.model",
  "telegram.enabled",
  "telegram.botToken",
  "telegram.chatId",
  "default.rateLimitRps",
  "default.maxConcurrency",
  "artifact.retentionDays",
  "recon.snapshotRetentionDays",
] as const;

type SettingKey = (typeof SETTING_KEYS)[number];

const settingParamsSchema = z.object({ key: z.string().min(1) });
const settingBodySchema = z.object({ value: z.unknown() });

const defaultSettings: Record<SettingKey, Prisma.InputJsonValue> = {
  "ai.enabled": env.AI_ENABLED.toLowerCase() === "true",
  "ai.provider": "deepseek",
  "ai.monthlyLimit": env.AI_MONTHLY_LIMIT,
  "ai.intakeFallbackThreshold": env.AI_INTAKE_FALLBACK_THRESHOLD,
  "deepseek.model": env.DEEPSEEK_MODEL,
  "deepseek.apiKey": env.DEEPSEEK_API_KEY,
  "deepseek.baseUrl": env.DEEPSEEK_BASE_URL,
  "deepseek.timeoutMs": env.DEEPSEEK_TIMEOUT_MS,
  "gemini.model": "deprecated",
  "telegram.enabled": false,
  "telegram.botToken": env.TELEGRAM_BOT_TOKEN,
  "telegram.chatId": env.TELEGRAM_CHAT_ID,
  "default.rateLimitRps": env.DEFAULT_RATE_LIMIT_RPS,
  "default.maxConcurrency": env.DEFAULT_MAX_CONCURRENCY,
  "artifact.retentionDays": env.ARTIFACT_RETENTION_DAYS,
  "recon.snapshotRetentionDays": 90,
};

function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key);
}

function maskSetting(key: string, value: unknown): unknown {
  if (["telegram.botToken", "deepseek.apiKey"].includes(key) && typeof value === "string" && value.length > 0) {
    return "********";
  }

  return value;
}

function asJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) {
    return Prisma.JsonNull;
  }

  try {
    JSON.stringify(value);
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Setting value must be valid JSON");
  }

  if (value === undefined) {
    throw new ApiError(400, "BAD_REQUEST", "Setting value is required");
  }

  return value as Prisma.InputJsonValue;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings", { preHandler: app.requireAuth }, async () => {
    const storedSettings = await app.prisma.appSetting.findMany();
    const settings: Record<string, unknown> = { ...defaultSettings };

    for (const setting of storedSettings) {
      settings[setting.key] = setting.value;
    }

    for (const [key, value] of Object.entries(settings)) {
      settings[key] = maskSetting(key, value);
    }

    return settings;
  });

  app.put("/settings/:key", { preHandler: app.requireAuth }, async (request) => {
    const { key } = parseRequest(settingParamsSchema, request.params);
    const body = parseRequest(settingBodySchema, request.body);

    if (!isSettingKey(key)) {
      throw new ApiError(400, "BAD_REQUEST", "Unsupported setting key");
    }
    if (key === "ai.provider" && body.value !== "deepseek") throw new ApiError(400, "BAD_REQUEST", "DeepSeek is the only supported AI provider");
    if (key === "deepseek.baseUrl" && (typeof body.value !== "string" || !body.value.startsWith("https://"))) throw new ApiError(400, "BAD_REQUEST", "DeepSeek base URL must use HTTPS");
    if (key === "ai.intakeFallbackThreshold" && (!Number.isInteger(body.value) || Number(body.value) < 0 || Number(body.value) > 100)) throw new ApiError(400, "BAD_REQUEST", "AI intake fallback threshold must be between 0 and 100");

    if (["telegram.botToken", "deepseek.apiKey"].includes(key) && body.value === "********") {
      const existing = await app.prisma.appSetting.findUnique({ where: { key } });
      return { key, value: maskSetting(key, existing?.value ?? defaultSettings[key]) };
    }

    // TODO(Phase 3): encrypt sensitive setting values at rest in production.
    const setting = await app.prisma.appSetting.upsert({
      where: { key },
      update: { value: asJsonValue(body.value) },
      create: { key, value: asJsonValue(body.value) },
    });

    await createAuditLog(app.prisma, {
      userId: request.user.sub,
      action: key.startsWith("ai.") || key.startsWith("deepseek.") ? "ai.configuration.updated" : "setting.updated",
      entityType: "setting",
      entityId: setting.id,
      metadata: { key },
    });

    return { key, value: maskSetting(key, setting.value) };
  });
}
