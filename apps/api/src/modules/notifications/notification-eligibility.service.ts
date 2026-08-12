import type { PrismaClient } from "@bountyops/db";
import { evaluateNotificationControls, type NotificationEligibilityResult } from "@bountyops/shared";
import { resolveTelegramConfig } from "./telegram-config.service.js";

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export async function evaluateNotificationEligibility(prisma: PrismaClient, eventOrId: string | { id: string; programId: string | null; status: string; importance: string; eventType: string }): Promise<NotificationEligibilityResult> {
  const event = typeof eventOrId === "string" ? await prisma.notificationEvent.findUnique({ where: { id: eventOrId } }) : eventOrId;
  if (!event) return { eligible: false, reason: "event_not_pending" };
  const [program, preference, delivered, config] = await Promise.all([
    event.programId ? prisma.program.findUnique({ where: { id: event.programId }, select: { id: true } }) : null,
    event.programId ? prisma.programNotificationPreference.findUnique({ where: { programId: event.programId } }) : null,
    prisma.notificationDelivery.findUnique({ where: { notificationEventId_channel: { notificationEventId: event.id, channel: "telegram" } } }),
    resolveTelegramConfig(prisma),
  ]);
  if (!program) return { eligible: false, reason: "notifications_disabled" };
  return evaluateNotificationControls({ eventStatus: event.status, eventImportance: event.importance, eventType: event.eventType, preference: preference ? { ...preference, eventTypes: strings(preference.eventTypes) } : null, globalEnabled: config.enabled, configured: config.configured, alreadyDelivered: delivered?.status === "delivered" });
}
