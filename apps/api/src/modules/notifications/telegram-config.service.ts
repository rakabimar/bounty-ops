import type { PrismaClient } from "@bountyops/db";
import { env } from "../../env.js";

const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
const booleanValue = (value: unknown) => value === true || value === "true";

export async function resolveTelegramConfig(prisma: PrismaClient) {
  const stored = await prisma.appSetting.findMany({ where: { key: { in: ["telegram.enabled", "telegram.botToken", "telegram.chatId"] } } });
  const settings = new Map(stored.map((item) => [item.key, item.value]));
  const botToken = stringValue(settings.get("telegram.botToken")) || env.TELEGRAM_BOT_TOKEN;
  const chatId = stringValue(settings.get("telegram.chatId")) || env.TELEGRAM_CHAT_ID;
  const hasStoredEnabled = settings.has("telegram.enabled");
  const enabled = hasStoredEnabled ? booleanValue(settings.get("telegram.enabled")) : Boolean(botToken && chatId);
  return { enabled, botToken, chatId, configured: env.NOTIFICATION_TRANSPORT === "mock" || Boolean(botToken && chatId), transport: env.NOTIFICATION_TRANSPORT } as const;
}

export function publicTelegramConfig(config: Awaited<ReturnType<typeof resolveTelegramConfig>>) {
  return { enabled: config.enabled, tokenConfigured: Boolean(config.botToken), chatIdConfigured: Boolean(config.chatId), transport: config.transport };
}
