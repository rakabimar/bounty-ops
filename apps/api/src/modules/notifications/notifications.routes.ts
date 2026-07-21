import type { FastifyInstance } from "fastify";
import { env } from "../../env.js";
import { ApiError } from "../../utils/response.js";

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/notifications/test-telegram",
    { preHandler: app.requireAuth },
    async () => {
      const stored = await app.prisma.appSetting.findMany({
        where: { key: { in: ["telegram.botToken", "telegram.chatId"] } },
      });
      const settings = new Map(stored.map((setting) => [setting.key, setting.value]));
      const botToken =
        stringValue(settings.get("telegram.botToken")) || env.TELEGRAM_BOT_TOKEN;
      const chatId = stringValue(settings.get("telegram.chatId")) || env.TELEGRAM_CHAT_ID;

      if (!botToken || !chatId) {
        throw new ApiError(
          400,
          "BAD_REQUEST",
          "Telegram bot token and chat ID are required",
        );
      }

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "BountyOps test notification",
            }),
            signal: AbortSignal.timeout(10_000),
          },
        );

        if (!response.ok) {
          throw new Error(`Telegram returned HTTP ${response.status}`);
        }
      } catch (error) {
        app.log.warn({ err: error }, "Telegram test notification failed");
        throw new ApiError(502, "TELEGRAM_ERROR", "Telegram notification failed");
      }

      return { success: true };
    },
  );
}
