import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be set in the root .env file`);
  }

  return value;
}

function integer(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  API_PORT: integer("API_PORT", 3000),
  REDIS_URL: process.env.REDIS_URL?.trim() || "redis://localhost:6379",
  JWT_SECRET: required("JWT_SECRET"),
  AI_ENABLED: process.env.AI_ENABLED ?? "false",
  AI_MONTHLY_LIMIT: integer("AI_MONTHLY_LIMIT", 100),
  AI_INTAKE_FALLBACK_THRESHOLD: integer("AI_INTAKE_FALLBACK_THRESHOLD", 70),
  AI_TRANSPORT: process.env.BOUNTYOPS_AI_TRANSPORT === "mock" ? "mock" : "deepseek",
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY?.trim() ?? "",
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
  DEEPSEEK_TIMEOUT_MS: Math.max(1_000, integer("DEEPSEEK_TIMEOUT_MS", 30_000)),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID?.trim() ?? "",
  WEB_BASE_URL: process.env.WEB_BASE_URL?.trim() || "http://localhost:5173",
  NOTIFICATION_TRANSPORT: process.env.BOUNTYOPS_NOTIFICATION_TRANSPORT === "mock" ? "mock" : "telegram",
  NOTIFICATION_DISPATCH_INTERVAL_MS: Math.max(5_000, integer("NOTIFICATION_DISPATCH_INTERVAL_MS", 30_000)),
  DEFAULT_RATE_LIMIT_RPS: integer("DEFAULT_RATE_LIMIT_RPS", 10),
  DEFAULT_MAX_CONCURRENCY: integer("DEFAULT_MAX_CONCURRENCY", 5),
  ARTIFACT_RETENTION_DAYS: integer("ARTIFACT_RETENTION_DAYS", 30),
} as const;
