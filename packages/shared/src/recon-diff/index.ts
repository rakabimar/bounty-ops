import type { ReconObservationEntityType } from "../types/index.js";

type Entity = Record<string, unknown>;
const text = (value: unknown) => value == null ? "" : String(value);
const list = (value: unknown) => Array.isArray(value) ? value.map(text).sort() : [];

export function buildStableKey(entityType: ReconObservationEntityType, entity: Entity): string {
  if (entityType === "asset") return `${text(entity.type)}:${text(entity.normalizedValue)}`;
  if (entityType === "dns_record") return `${text(entity.host)}|${text(entity.recordType)}|${text(entity.value)}`;
  if (entityType === "http_service") return text(entity.normalizedUrl);
  if (entityType === "url") return text(entity.normalizedUrl);
  if (entityType === "endpoint") return `${text(entity.method).toUpperCase()}|${text(entity.normalizedFullUrl)}`;
  return `${text(entity.tool)}|${text(entity.templateId)}|${text(entity.matchedUrl)}|${text(entity.name)}`;
}

export function buildFingerprintPayload(entityType: ReconObservationEntityType, entity: Entity): Record<string, unknown> {
  if (entityType === "asset") return { normalizedValue: entity.normalizedValue, status: entity.status, categories: list(entity.categories), finalScore: entity.finalScore };
  if (entityType === "dns_record") return { host: entity.host, recordType: entity.recordType, value: entity.value };
  if (entityType === "http_service") return { normalizedUrl: entity.normalizedUrl, statusCode: entity.statusCode, title: text(entity.title).trim().toLowerCase(), technologies: list(entity.technologies), contentType: entity.contentType, webserver: entity.webserver };
  if (entityType === "url") return { normalizedUrl: entity.normalizedUrl, statusCode: entity.statusCode, title: text(entity.title).trim().toLowerCase(), categories: list(entity.categories), finalScore: entity.finalScore };
  if (entityType === "endpoint") return { method: text(entity.method).toUpperCase(), normalizedFullUrl: entity.normalizedFullUrl, statusCode: entity.statusCode, parameters: list(entity.parameters), categories: list(entity.categories), finalScore: entity.finalScore };
  return { tool: entity.tool, templateId: entity.templateId, matchedUrl: entity.matchedUrl, name: entity.name, severity: entity.severity, status: entity.status };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Entity).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

export async function buildFingerprint(entityType: ReconObservationEntityType, entity: Entity): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(buildFingerprintPayload(entityType, entity)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
