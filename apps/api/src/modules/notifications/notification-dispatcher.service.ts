import { Prisma, type PrismaClient } from "@bountyops/db";
import { NOTIFICATION_DELIVERY_QUEUE_NAME, type TelegramDeliveryPayload } from "@bountyops/shared";
import type { Queue } from "bullmq";
import { env } from "../../env.js";
import { evaluateNotificationEligibility } from "./notification-eligibility.service.js";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
// BullMQ custom IDs cannot contain `:`, so this is the safe equivalent of
// the conceptual `telegram:<eventId>` deduplication key.
export const notificationDeliveryJobId = (eventId: string) => `telegram-${eventId}`;

export async function enqueueNotificationDelivery(queue: Queue<TelegramDeliveryPayload>, payload: TelegramDeliveryPayload) {
  const id = notificationDeliveryJobId(payload.notificationEventId);
  const existing = await queue.getJob(id);
  if (existing) return existing;
  return queue.add("telegram", payload, { jobId: id, attempts: 4, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: false, removeOnFail: false });
}

export async function dispatchPendingNotifications(prisma: PrismaClient, queue: Queue<TelegramDeliveryPayload>, limit = 100) {
  const events = await prisma.notificationEvent.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: limit });
  const result = { queued: 0, suppressed: 0, pending: 0 };
  for (const event of events) {
    const eligibility = await evaluateNotificationEligibility(prisma, event);
    if (eligibility.eligible) {
      let delivery = await prisma.notificationDelivery.findUnique({ where: { notificationEventId_channel: { notificationEventId: event.id, channel: "telegram" } } });
      let created = false;
      if (!delivery) {
        try {
          delivery = await prisma.notificationDelivery.create({ data: { notificationEventId: event.id, channel: "telegram", status: "queued", queuedAt: new Date() } });
          created = true;
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
          delivery = await prisma.notificationDelivery.findUnique({ where: { notificationEventId_channel: { notificationEventId: event.id, channel: "telegram" } } });
        }
      }
      if (!delivery || !["queued", "sending"].includes(delivery.status)) { result.pending++; continue; }
      await enqueueNotificationDelivery(queue, { notificationEventId: event.id, notificationDeliveryId: delivery.id, channel: "telegram" });
      if (created) await prisma.auditLog.create({ data: { programId: event.programId, action: "notification.delivery.queued", entityType: "notification_delivery", entityId: delivery.id, metadata: json({ notificationEventId: event.id, deliveryId: delivery.id, eventType: event.eventType, importance: event.importance }) } });
      result.queued++;
    } else if (["notifications_disabled", "telegram_disabled", "global_telegram_disabled", "event_type_disabled", "importance_below_threshold"].includes(eligibility.reason)) {
      const delivery = await prisma.notificationDelivery.upsert({ where: { notificationEventId_channel: { notificationEventId: event.id, channel: "telegram" } }, update: { status: "suppressed", lastError: eligibility.reason }, create: { notificationEventId: event.id, channel: "telegram", status: "suppressed", lastError: eligibility.reason } });
      await prisma.notificationEvent.updateMany({ where: { id: event.id, status: "pending" }, data: { status: "suppressed" } });
      await prisma.auditLog.create({ data: { programId: event.programId, action: "notification.delivery.suppressed", entityType: "notification_delivery", entityId: delivery.id, metadata: json({ notificationEventId: event.id, deliveryId: delivery.id, eventType: event.eventType, importance: event.importance, reason: eligibility.reason }) } });
      result.suppressed++;
    } else result.pending++;
  }
  return result;
}

export function startNotificationDispatcher(prisma: PrismaClient, queue: Queue<TelegramDeliveryPayload>, log: { error(value: unknown, message?: string): void }) {
  let running = false;
  const tick = async () => { if (running) return; running = true; try { await dispatchPendingNotifications(prisma, queue); } catch (error) { log.error({ err: error }, "Notification dispatcher failed"); } finally { running = false; } };
  const timer = setInterval(() => void tick(), env.NOTIFICATION_DISPATCH_INTERVAL_MS); timer.unref();
  return () => clearInterval(timer);
}

export { NOTIFICATION_DELIVERY_QUEUE_NAME };
