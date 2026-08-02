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
  AI_ENABLED: process.env.AI_ENABLED ?? "true",
  AI_MONTHLY_LIMIT: integer("AI_MONTHLY_LIMIT", 200),
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID?.trim() ?? "",
  DEFAULT_RATE_LIMIT_RPS: integer("DEFAULT_RATE_LIMIT_RPS", 10),
  DEFAULT_MAX_CONCURRENCY: integer("DEFAULT_MAX_CONCURRENCY", 5),
  ARTIFACT_RETENTION_DAYS: integer("ARTIFACT_RETENTION_DAYS", 30),
} as const;
