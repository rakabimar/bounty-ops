import type { FastifyInstance } from "fastify";
import { ApiError } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";
import { publicTelegramConfig, resolveTelegramConfig } from "./telegram-config.service.js";
import { sendTelegramMessage } from "./telegram-client.service.js";

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/notifications/telegram/config", { preHandler: app.requireAuth }, async () => publicTelegramConfig(await resolveTelegramConfig(app.prisma)));
  app.post("/notifications/test-telegram", { preHandler: app.requireAuth }, async (request) => {
    const config = await resolveTelegramConfig(app.prisma);
    if (!config.configured) throw new ApiError(400, "BAD_REQUEST", "Telegram bot token and chat ID are required");
    try {
      await sendTelegramMessage({ botToken: config.botToken, chatId: config.chatId, text: "BountyOps Telegram test" });
      await createAuditLog(app.prisma, { userId: request.user.sub, action: "notifications.telegram.test.success", entityType: "notification_test", metadata: { transport: config.transport } });
      return { success: true };
    } catch {
      await createAuditLog(app.prisma, { userId: request.user.sub, action: "notifications.telegram.test.failed", entityType: "notification_test", metadata: { errorCategory: "provider_error", transport: config.transport } });
      throw new ApiError(502, "TELEGRAM_ERROR", "Telegram notification failed");
    }
  });
}
