import { NOTIFICATION_IMPORTANCE_RANK } from "../constants/index.js";
import type { NotificationEligibilityReason, NotificationImportance } from "../types/index.js";

export function meetsMinimumImportance(value: string, minimum: string): boolean {
  return (NOTIFICATION_IMPORTANCE_RANK[value as NotificationImportance] ?? 0) >= (NOTIFICATION_IMPORTANCE_RANK[minimum as NotificationImportance] ?? 99);
}

export function evaluateNotificationControls(input: { eventStatus: string; eventImportance: string; eventType: string; preference: { enabled: boolean; telegramEnabled: boolean; minImportance: string; eventTypes: string[] } | null; globalEnabled: boolean; configured: boolean; alreadyDelivered: boolean }): { eligible: boolean; reason: NotificationEligibilityReason } {
  if (input.eventStatus !== "pending") return { eligible: false, reason: "event_not_pending" };
  if (input.alreadyDelivered) return { eligible: false, reason: "already_delivered" };
  if (!input.preference?.enabled) return { eligible: false, reason: "notifications_disabled" };
  if (!input.preference.telegramEnabled) return { eligible: false, reason: "telegram_disabled" };
  if (!input.globalEnabled) return { eligible: false, reason: "global_telegram_disabled" };
  if (!input.preference.eventTypes.includes(input.eventType)) return { eligible: false, reason: "event_type_disabled" };
  if (!meetsMinimumImportance(input.eventImportance, input.preference.minImportance)) return { eligible: false, reason: "importance_below_threshold" };
  if (!input.configured) return { eligible: false, reason: "missing_configuration" };
  return { eligible: true, reason: "eligible" };
}

const safe = (value: unknown, limit: number) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
const labels: Record<string, string> = {
  new_subdomain: "New in-scope subdomain discovered", high_score_asset: "High-priority asset discovered",
  new_live_host: "New live HTTP service discovered", new_open_web_service: "New open web service discovered",
  api_docs_discovered: "API documentation discovered", graphql_discovered: "GraphQL surface discovered",
  staging_dev_discovered: "Staging/development surface discovered", scanner_finding_high: "High-severity scanner finding observed",
  scanner_finding_critical: "Critical-severity scanner finding observed", scanner_finding_resolved: "Scanner finding no longer observed",
  scanner_finding_reappeared: "Scanner finding observed again", priority_promoted: "Asset priority promoted",
  job_failed: "Recon job failed", scope_changed: "Program scope changed", schedule_blocked: "Scheduled recon was blocked by current policy",
};

export function formatTelegramNotification(input: { event: { eventType: string; importance: string; entityType?: string | null; entityId?: string | null; title: string; message: string; metadata?: Record<string, unknown> | null }; programName?: string | null; frontendBaseUrl?: string }): string {
  const metadata = input.event.metadata ?? {};
  const target = safe(metadata.target ?? metadata.url ?? metadata.normalizedUrl, 500);
  const score = typeof metadata.score === "number" ? metadata.score : typeof metadata.finalScore === "number" ? metadata.finalScore : null;
  const priority = safe(metadata.priority, 20);
  const entityType = safe(input.event.entityType, 60);
  const entityId = safe(input.event.entityId, 200);
  const route = entityType === "url" ? "urls" : entityType === "endpoint" ? "endpoints" : entityType === "scanner_finding" ? "scanner-findings" : entityType === "asset" ? "assets" : null;
  const link = route && entityId && input.frontendBaseUrl ? `${input.frontendBaseUrl.replace(/\/$/, "")}/${route}/${encodeURIComponent(entityId)}` : "";
  const lines = [`[BountyOps] ${safe(input.event.importance, 20).toUpperCase()}`, "", `Program: ${safe(input.programName ?? "Unknown program", 200)}`, `Event: ${labels[input.event.eventType] ?? safe(input.event.title, 200)}`, "", safe(input.event.message, 1200)];
  if (entityType) lines.push("", `Entity: ${entityType.replaceAll("_", " ")}`);
  if (target) lines.push(`Target: ${target}`);
  if (score !== null) lines.push(`Score: ${score}${priority ? ` (${priority})` : ""}`);
  if (link) lines.push("", "Open in BountyOps:", safe(link, 700));
  return lines.join("\n").slice(0, 3500);
}
