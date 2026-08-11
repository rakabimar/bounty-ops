import { inferMethod, parseNormalizedUrl } from "@bountyops/shared";
import type { KatanaEndpointResult, KatanaResult } from "@bountyops/shared";
import { readLines } from "./parser-utils.js";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? Math.round(value) : typeof value === "string" && Number.isFinite(Number(value)) ? Math.round(Number(value)) : undefined;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const endpointLike = (path: string, contentType?: string) => /\/(?:api|rest|v\d+)(?:\/|$)|\/graphql(?:\/|$)/i.test(path) || contentType?.toLowerCase().includes("application/json") === true;

export async function parseKatana(path: string): Promise<KatanaResult> {
  const urls = new Map<string, KatanaResult["urls"][number]>(); const endpoints = new Map<string, KatanaEndpointResult>(); const warnings: string[] = []; let skippedCount = 0; let lineNumber = 0;
  await readLines(path, (line) => {
    lineNumber++;
    try {
      let record: Record<string, unknown> = {}; let rawUrl = line;
      if (line.startsWith("{")) {
        record = JSON.parse(line) as Record<string, unknown>;
        const request = object(record.request); const response = object(record.response);
        rawUrl = String(record.url ?? request.endpoint ?? record.endpoint ?? "");
        const statusCode = number(record.status_code ?? response.status_code);
        const contentType = typeof record.content_type === "string" ? record.content_type : typeof response.content_type === "string" ? response.content_type : undefined;
        const parsed = parseCandidate(rawUrl); if (!parsed) { skippedCount++; warnings.push(`Skipped malformed katana record at line ${lineNumber}`); return; }
        const method = inferMethod(typeof record.method === "string" ? record.method : typeof request.method === "string" ? request.method : undefined);
        const url = { ...parsed, sourceTool: "katana" as const, title: typeof record.title === "string" ? record.title : undefined, statusCode, contentType, contentLength: number(record.response_content_length ?? response.content_length), technologies: strings(record.technologies ?? record.tech) };
        urls.set(parsed.normalizedUrl, url);
        if (method !== "UNKNOWN" || endpointLike(parsed.path, contentType)) {
          const endpoint: KatanaEndpointResult = { method, path: parsed.path, fullUrl: rawUrl, normalizedFullUrl: parsed.normalizedUrl, statusCode, contentType, parameters: parsed.queryParamKeys.map((name) => ({ name, location: "query", source: "katana" })) };
          endpoints.set(`${endpoint.method}:${endpoint.normalizedFullUrl}`, endpoint);
        }
        return;
      }
      const parsed = parseCandidate(rawUrl); if (!parsed) { skippedCount++; warnings.push(`Skipped malformed katana URL at line ${lineNumber}`); return; }
      urls.set(parsed.normalizedUrl, { ...parsed, sourceTool: "katana" });
      if (endpointLike(parsed.path)) endpoints.set(`UNKNOWN:${parsed.normalizedUrl}`, { method: "UNKNOWN", path: parsed.path, fullUrl: rawUrl, normalizedFullUrl: parsed.normalizedUrl, parameters: parsed.queryParamKeys.map((name) => ({ name, location: "query", source: "katana" })) });
    } catch { skippedCount++; warnings.push(`Skipped invalid katana JSON at line ${lineNumber}`); }
  });
  return { urls: [...urls.values()], endpoints: [...endpoints.values()], skippedCount, warnings: warnings.slice(0, 100) };
}

function parseCandidate(rawUrl: string) {
  try {
    const url = new URL(rawUrl); if (!new Set(["http:", "https:"]).has(url.protocol)) return null;
    const parsed = parseNormalizedUrl(rawUrl); if (!parsed.host) return null;
    return { url: rawUrl, normalizedUrl: parsed.normalizedUrl, scheme: parsed.scheme, host: parsed.host, port: parsed.port, path: parsed.path, queryParamKeys: parsed.queryParamKeys };
  } catch { return null; }
}
