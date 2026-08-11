import { Prisma, prisma } from "@bountyops/db";
import { priorityFromScore, type ChangeImportance } from "@bountyops/shared";

type Meta = Record<string, unknown>;
type Observation = { entityType: string; entityId: string | null; stableKey: string; fingerprint: string | null; metadata: Prisma.JsonValue | null };
type ChangeInput = { entityType: string; entityId: string; type: string; summary: string; oldValue?: string; newValue?: string; importance: ChangeImportance };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const meta = (value: Prisma.JsonValue | null): Meta => value && typeof value === "object" && !Array.isArray(value) ? value as Meta : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").sort() : [];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const importanceRank: Record<ChangeImportance, number> = { low: 0, medium: 1, high: 2, critical: 3 };

async function notify(input: { programId: string; eventType: string; entityType?: string; entityId?: string | null; importance: ChangeImportance; title: string; message: string; metadata?: Meta }) {
  const existing = await prisma.notificationEvent.findFirst({ where: { programId: input.programId, eventType: input.eventType, entityId: input.entityId ?? null, status: "pending", message: input.message } });
  if (existing) return existing;
  return prisma.notificationEvent.create({ data: { ...input, entityId: input.entityId ?? undefined, metadata: input.metadata ? json(input.metadata) : undefined } });
}

function value(data: Meta, key: string) { return data[key] == null ? undefined : String(data[key]); }
function number(data: Meta, key: string) { const result = Number(data[key]); return Number.isFinite(result) ? result : 0; }

async function addChange(batchId: string, programId: string, input: ChangeInput) {
  return prisma.entityChange.create({ data: { programId, entityType: input.entityType, entityId: input.entityId, type: input.type, summary: input.summary, oldValue: input.oldValue, newValue: input.newValue, source: `recon_diff:${batchId}`, importance: input.importance } });
}

async function addedChange(batchId: string, programId: string, observation: Observation): Promise<ChangeImportance> {
  const data = meta(observation.metadata); const id = observation.entityId ?? observation.stableKey;
  if (observation.entityType === "asset") {
    const score = number(data, "finalScore"); const importance: ChangeImportance = score >= 15 ? "high" : "medium";
    await addChange(batchId, programId, { entityType: "asset", entityId: id, type: "asset_discovered", summary: `New subdomain discovered: ${value(data, "normalizedValue") ?? observation.stableKey}`, newValue: value(data, "normalizedValue"), importance });
    await notify({ programId, eventType: "new_subdomain", entityType: "asset", entityId: observation.entityId, importance, title: "New subdomain discovered", message: value(data, "normalizedValue") ?? observation.stableKey });
    if (score >= 15) await notify({ programId, eventType: "high_score_asset", entityType: "asset", entityId: observation.entityId, importance: "high", title: "High-score asset discovered", message: `${value(data, "normalizedValue") ?? observation.stableKey} scored ${score}` });
    return importance;
  }
  if (observation.entityType === "dns_record") { await addChange(batchId, programId, { entityType: "dns_record", entityId: id, type: "dns_record_added", summary: `DNS record added: ${observation.stableKey}`, newValue: value(data, "value"), importance: "low" }); return "low"; }
  if (observation.entityType === "http_service") {
    await addChange(batchId, programId, { entityType: "http_service", entityId: id, type: "http_service_discovered", summary: `HTTP service became reachable: ${value(data, "normalizedUrl") ?? observation.stableKey}`, newValue: value(data, "normalizedUrl"), importance: "medium" });
    await notify({ programId, eventType: "new_live_host", entityType: "http_service", entityId: observation.entityId, importance: "medium", title: "New live HTTP service", message: value(data, "normalizedUrl") ?? observation.stableKey });
    await notify({ programId, eventType: "new_open_web_service", entityType: "http_service", entityId: observation.entityId, importance: "medium", title: "New open web service", message: value(data, "normalizedUrl") ?? observation.stableKey });
    return "medium";
  }
  if (observation.entityType === "url") {
    const score = number(data, "finalScore"); const importance: ChangeImportance = score >= 15 ? "high" : score >= 8 ? "medium" : "low";
    await addChange(batchId, programId, { entityType: "url", entityId: id, type: "url_discovered", summary: `New URL discovered: ${value(data, "normalizedUrl") ?? observation.stableKey}`, newValue: value(data, "normalizedUrl"), importance });
    const categories = strings(data.categories); const eventType = categories.includes("graphql") ? "graphql_discovered" : categories.includes("swagger_openapi") ? "api_docs_discovered" : categories.includes("staging_dev") ? "staging_dev_discovered" : null;
    if (eventType) await notify({ programId, eventType, entityType: "url", entityId: observation.entityId, importance, title: "High-signal URL discovered", message: value(data, "normalizedUrl") ?? observation.stableKey });
    return importance;
  }
  if (observation.entityType === "endpoint") {
    const categories = strings(data.categories); const important = categories.some((item) => ["api", "admin_dashboard", "graphql", "upload", "billing_payment", "auth"].includes(item)); const importance: ChangeImportance = important ? "medium" : "low";
    await addChange(batchId, programId, { entityType: "endpoint", entityId: id, type: "endpoint_discovered", summary: `New endpoint discovered: ${observation.stableKey}`, newValue: observation.stableKey, importance }); return importance;
  }
  const severity = value(data, "severity") ?? "info"; const importance: ChangeImportance = severity === "critical" ? "critical" : severity === "high" ? "high" : severity === "medium" ? "medium" : "low";
  const resolved = observation.entityId ? await prisma.entityChange.findFirst({ where: { entityType: "scanner_finding", entityId: observation.entityId, type: "scanner_finding_resolved" } }) : null;
  const type = resolved ? "scanner_finding_reappeared" : "scanner_finding_appeared";
  await addChange(batchId, programId, { entityType: "scanner_finding", entityId: id, type, summary: resolved ? "Scanner finding reappeared" : "Scanner finding appeared", newValue: observation.stableKey, importance });
  if (["high", "critical"].includes(severity) || resolved) await notify({ programId, eventType: resolved ? "scanner_finding_reappeared" : `scanner_finding_${severity}`, entityType: "scanner_finding", entityId: observation.entityId, importance, title: resolved ? "Scanner finding reappeared" : `${severity} scanner finding`, message: value(data, "name") ?? observation.stableKey });
  return importance;
}

async function changedChange(batchId: string, programId: string, before: Observation, after: Observation): Promise<ChangeImportance> {
  const oldData = meta(before.metadata); const newData = meta(after.metadata); const id = after.entityId ?? after.stableKey; let highest: ChangeImportance = "low";
  const emit = async (input: Omit<ChangeInput, "entityType" | "entityId">) => { if (importanceRank[input.importance] > importanceRank[highest]) highest = input.importance; await addChange(batchId, programId, { ...input, entityType: after.entityType, entityId: id }); };
  if (after.entityType === "http_service") {
    const oldStatus = value(oldData, "statusCode"); const newStatus = value(newData, "statusCode");
    if (oldStatus !== newStatus) { const promoted = (["403", "404"].includes(oldStatus ?? "") && newStatus === "200"); await emit({ type: "status_code_changed", summary: `HTTP status changed ${oldStatus ?? "unknown"} → ${newStatus ?? "unknown"}`, oldValue: oldStatus, newValue: newStatus, importance: promoted ? "high" : "medium" }); }
    if (value(oldData, "title") !== value(newData, "title")) await emit({ type: "title_changed", summary: "HTTP service title changed", oldValue: value(oldData, "title"), newValue: value(newData, "title"), importance: "medium" });
    if (!same(strings(oldData.technologies), strings(newData.technologies))) await emit({ type: "technology_changed", summary: "HTTP technology set changed", oldValue: strings(oldData.technologies).join(", "), newValue: strings(newData.technologies).join(", "), importance: "medium" });
    if (value(oldData, "contentType") !== value(newData, "contentType")) await emit({ type: "content_type_changed", summary: "HTTP content type changed", oldValue: value(oldData, "contentType"), newValue: value(newData, "contentType"), importance: "low" });
  }
  if (["asset", "url", "endpoint"].includes(after.entityType)) {
    const oldScore = number(oldData, "finalScore"); const newScore = number(newData, "finalScore"); const oldPriority = priorityFromScore(oldScore); const newPriority = priorityFromScore(newScore);
    if (oldScore !== newScore) await emit({ type: "score_changed", summary: `Score changed ${oldScore} → ${newScore}`, oldValue: String(oldScore), newValue: String(newScore), importance: Math.abs(newScore - oldScore) >= 8 ? "high" : "medium" });
    if (oldPriority !== newPriority) { const promoted = importanceRankForPriority(newPriority) > importanceRankForPriority(oldPriority); const importance: ChangeImportance = newPriority === "P1" ? "high" : "medium"; await emit({ type: "priority_changed", summary: `Asset priority ${promoted ? "promoted" : "changed"} ${oldPriority} → ${newPriority}`, oldValue: oldPriority, newValue: newPriority, importance }); if (promoted) await notify({ programId, eventType: "priority_promoted", entityType: after.entityType, entityId: after.entityId, importance, title: "Priority promoted", message: `${oldPriority} → ${newPriority}` }); }
    if (!same(strings(oldData.categories), strings(newData.categories))) await emit({ type: "category_changed", summary: "Entity categories changed", oldValue: strings(oldData.categories).join(", "), newValue: strings(newData.categories).join(", "), importance: "medium" });
  }
  if (after.entityType === "endpoint") {
    const added = strings(newData.parameters).filter((item) => !strings(oldData.parameters).includes(item));
    for (const parameter of added) await emit({ type: "endpoint_parameter_added", summary: `Endpoint parameter added: ${parameter}`, newValue: parameter, importance: "medium" });
  }
  return highest;
}

function importanceRankForPriority(priority: string) { return priority === "P1" ? 4 : priority === "P2" ? 3 : priority === "Monitor" ? 2 : 1; }

async function removedChange(batchId: string, programId: string, observation: Observation): Promise<ChangeImportance> {
  const data = meta(observation.metadata); const id = observation.entityId ?? observation.stableKey;
  if (observation.entityType === "dns_record") { await addChange(batchId, programId, { entityType: "dns_record", entityId: id, type: "dns_record_removed", summary: `DNS record removed: ${observation.stableKey}`, oldValue: value(data, "value"), importance: "low" }); return "low"; }
  if (observation.entityType === "http_service") { await addChange(batchId, programId, { entityType: "http_service", entityId: id, type: "http_service_not_seen", summary: `HTTP service not seen: ${value(data, "normalizedUrl") ?? observation.stableKey}`, oldValue: value(data, "normalizedUrl"), importance: "medium" }); return "medium"; }
  await addChange(batchId, programId, { entityType: "scanner_finding", entityId: id, type: "scanner_finding_resolved", summary: "Scanner finding no longer observed", oldValue: observation.stableKey, importance: "medium" });
  await notify({ programId, eventType: "scanner_finding_resolved", entityType: "scanner_finding", entityId: observation.entityId, importance: "medium", title: "Scanner finding no longer observed", message: value(data, "name") ?? observation.stableKey }); return "medium";
}

export async function runReconDiff(currentSnapshotId: string) {
  const current = await prisma.reconSnapshot.findUnique({ where: { id: currentSnapshotId }, include: { observations: true } });
  if (!current || !current.comparable || current.status !== "success") return null;
  const currentMeta = meta(current.metadata); const candidates = await prisma.reconSnapshot.findMany({ where: { programId: current.programId, stage: current.stage, comparable: true, status: "success", id: { not: current.id }, completedAt: { lt: current.completedAt ?? new Date() } }, include: { observations: true }, orderBy: { completedAt: "desc" }, take: 20 });
  const previous = candidates.find((candidate) => value(meta(candidate.metadata), "comparisonKey") === value(currentMeta, "comparisonKey"));
  if (!previous) return null;
  const batch = await prisma.reconDiffBatch.create({ data: { programId: current.programId, stage: current.stage, previousSnapshotId: previous.id, currentSnapshotId: current.id } });
  const oldMap = new Map(previous.observations.map((item) => [`${item.entityType}:${item.stableKey}`, item])); const newMap = new Map(current.observations.map((item) => [`${item.entityType}:${item.stableKey}`, item]));
  const added = [...newMap.entries()].filter(([key]) => !oldMap.has(key)).map(([, item]) => item); const removed = [...oldMap.entries()].filter(([key]) => !newMap.has(key)).map(([, item]) => item); const changed = [...newMap.entries()].filter(([key, item]) => oldMap.has(key) && oldMap.get(key)!.fingerprint !== item.fingerprint).map(([key, item]) => [oldMap.get(key)!, item] as const);
  let highest: ChangeImportance = "low"; const raise = (importance: ChangeImportance) => { if (importanceRank[importance] > importanceRank[highest]) highest = importance; };
  for (const item of added) raise(await addedChange(batch.id, current.programId, item));
  for (const [before, after] of changed) raise(await changedChange(batch.id, current.programId, before, after));
  const removalsAllowed = ["dns_resolve", "http_probe", "nuclei_safe"].includes(current.stage);
  if (removalsAllowed) for (const item of removed) raise(await removedChange(batch.id, current.programId, item));
  if (current.stage === "dns_resolve") {
    for (const newRecord of added) { const newData = meta(newRecord.metadata); const oldRecord = removed.find((item) => { const oldData = meta(item.metadata); return value(oldData, "host") === value(newData, "host") && value(oldData, "recordType") === value(newData, "recordType"); }); if (!oldRecord) continue; const type = ["A", "AAAA"].includes(value(newData, "recordType") ?? "") ? "ip_changed" : value(newData, "recordType") === "CNAME" ? "cname_changed" : null; if (type) { await addChange(batch.id, current.programId, { entityType: "dns_record", entityId: newRecord.entityId ?? newRecord.stableKey, type, summary: `${type === "ip_changed" ? "IP" : "CNAME"} changed for ${value(newData, "host")}`, oldValue: value(meta(oldRecord.metadata), "value"), newValue: value(newData, "value"), importance: "medium" }); raise("medium"); } }
  }
  const summary = { added: added.length, changed: changed.length, removed: removalsAllowed ? removed.length : 0, removalsSuppressed: removalsAllowed ? 0 : removed.length };
  return prisma.reconDiffBatch.update({ where: { id: batch.id }, data: { addedCount: added.length, changedCount: changed.length, removedCount: removalsAllowed ? removed.length : 0, importance: highest, summary: json(summary) } });
}
