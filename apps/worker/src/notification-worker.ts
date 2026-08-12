import { Prisma, prisma } from "@bountyops/db";
import { evaluateNotificationControls, formatTelegramNotification, NOTIFICATION_DELIVERY_QUEUE_NAME, type TelegramDeliveryPayload } from "@bountyops/shared";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { MockNotificationTransport, TelegramNotificationTransport, TelegramTransportError, type NotificationTransport } from "./services/telegram.service.js";

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
const booleanValue = (value: unknown) => value === true || value === "true";
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function config() {
  const stored = await prisma.appSetting.findMany({ where: { key: { in: ["telegram.enabled", "telegram.botToken", "telegram.chatId"] } } }); const settings = new Map(stored.map(item => [item.key, item.value]));
  const token = stringValue(settings.get("telegram.botToken")) || (process.env.TELEGRAM_BOT_TOKEN?.trim() ?? ""); const chatId = stringValue(settings.get("telegram.chatId")) || (process.env.TELEGRAM_CHAT_ID?.trim() ?? "");
  return { enabled: settings.has("telegram.enabled") ? booleanValue(settings.get("telegram.enabled")) : Boolean(token && chatId), token, chatId, configured: process.env.BOUNTYOPS_NOTIFICATION_TRANSPORT === "mock" || Boolean(token && chatId) };
}

async function audit(action: string, event: { programId: string | null; id: string; eventType: string; importance: string }, deliveryId: string, extra: Record<string, unknown> = {}) {
  await prisma.auditLog.create({ data: { programId: event.programId, action, entityType: "notification_delivery", entityId: deliveryId, metadata: json({ notificationEventId: event.id, deliveryId, eventType: event.eventType, importance: event.importance, ...extra }) } });
}

export async function processNotificationDelivery(data: TelegramDeliveryPayload, options: { transport?: NotificationTransport; attemptNumber?: number; maxAttempts?: number } = {}) {
  const delivery = await prisma.notificationDelivery.findUnique({ where: { id: data.notificationDeliveryId }, include: { notificationEvent: true } });
  if (!delivery || delivery.notificationEventId !== data.notificationEventId) throw new Error("Notification delivery no longer exists");
  const event = delivery.notificationEvent;
  if (["ignored", "suppressed", "delivered"].includes(event.status) || ["suppressed", "delivered"].includes(delivery.status)) return { skipped: true };
  const [preference, telegram, program] = await Promise.all([event.programId ? prisma.programNotificationPreference.findUnique({ where: { programId: event.programId } }) : null, config(), event.programId ? prisma.program.findUnique({ where: { id: event.programId }, select: { name: true } }) : null]);
  const eligibility = evaluateNotificationControls({ eventStatus: event.status, eventImportance: event.importance, eventType: event.eventType, preference: preference ? { ...preference, eventTypes: strings(preference.eventTypes) } : null, globalEnabled: telegram.enabled, configured: telegram.configured, alreadyDelivered: delivery.status === "delivered" });
  if (!eligibility.eligible) {
    if (eligibility.reason === "event_not_pending" || eligibility.reason === "already_delivered") return { skipped: true };
    const configurationFailure = eligibility.reason === "missing_configuration";
    await prisma.$transaction([
      prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: configurationFailure ? "failed" : "suppressed", lastError: eligibility.reason, failedAt: configurationFailure ? new Date() : null } }),
      prisma.notificationEvent.updateMany({ where: { id: event.id, status: "pending" }, data: { status: configurationFailure ? "failed" : "suppressed" } }),
    ]);
    await audit(configurationFailure ? "notification.delivery.failed" : "notification.delivery.suppressed", event, delivery.id, { reason: eligibility.reason, errorCategory: configurationFailure ? "configuration" : undefined });
    return { skipped: true };
  }
  const attempt = options.attemptNumber ?? delivery.attemptCount + 1; const maxAttempts = options.maxAttempts ?? 4;
  const claimed = await prisma.notificationDelivery.updateMany({ where: { id: delivery.id, status: { in: ["queued", "failed"] } }, data: { status: "sending", startedAt: new Date(), attemptCount: { increment: 1 }, lastError: null, nextRetryAt: null } });
  if (!claimed.count) return { skipped: true };
  const fresh = await prisma.notificationEvent.findUnique({ where: { id: event.id }, select: { status: true } });
  if (fresh?.status !== "pending") { await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: "suppressed", lastError: `event_${fresh?.status ?? "missing"}` } }); return { skipped: true }; }
  const transport = options.transport ?? (process.env.BOUNTYOPS_NOTIFICATION_TRANSPORT === "mock" ? new MockNotificationTransport() : new TelegramNotificationTransport());
  const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};
  const message = formatTelegramNotification({ event: { ...event, metadata }, programName: program?.name, frontendBaseUrl: process.env.WEB_BASE_URL || "http://localhost:5173" });
  try {
    const sent = await transport.send({ token: telegram.token, chatId: telegram.chatId, message }); const now = new Date();
    await prisma.$transaction([prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: "delivered", providerMessageId: sent.providerMessageId, deliveredAt: now, failedAt: null, nextRetryAt: null } }), prisma.notificationEvent.update({ where: { id: event.id }, data: { status: "delivered", deliveredAt: now } })]);
    await audit("notification.delivery.delivered", event, delivery.id, { attemptCount: attempt }); return { delivered: true, providerMessageId: sent.providerMessageId };
  } catch (error) {
    const transportError = error instanceof TelegramTransportError ? error : new TelegramTransportError("Notification transport failed", true); const exhausted = !transportError.transient || attempt >= maxAttempts; const nextRetryAt = exhausted ? null : new Date(Date.now() + Math.max(5_000, (transportError.retryAfterSeconds ?? 0) * 1_000));
    await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: exhausted ? "failed" : "queued", lastError: transportError.message.slice(0, 300), failedAt: exhausted ? new Date() : null, nextRetryAt } });
    if (exhausted) { await prisma.notificationEvent.update({ where: { id: event.id }, data: { status: "failed" } }); await audit("notification.delivery.failed", event, delivery.id, { attemptCount: attempt, errorCategory: transportError.transient ? "retries_exhausted" : "permanent" }); return { delivered: false, failed: true }; }
    throw transportError;
  }
}

export async function createNotificationWorker(redisUrl: string) {
  const connection = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 5_000, maxRetriesPerRequest: null, retryStrategy: () => null }); connection.on("error", () => undefined); await connection.connect(); await connection.ping();
  const worker = new Worker<TelegramDeliveryPayload>(NOTIFICATION_DELIVERY_QUEUE_NAME, (job: Job<TelegramDeliveryPayload>) => processNotificationDelivery(job.data, { attemptNumber: job.attemptsMade + 1, maxAttempts: Number(job.opts.attempts) || 4 }), { connection, concurrency: 1 });
  return { worker, async close() { await worker.close(); connection.disconnect(); } };
}
