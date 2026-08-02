import type { HttpxResult } from "@bountyops/shared";
import { normalizeHostname, normalizeUrl, parseUrlHostPort } from "../normalization.js";
import { readLines } from "./parser-utils.js";

const integer = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? Math.round(value) : typeof value === "string" && Number.isFinite(Number(value)) ? Math.round(Number(value)) : undefined;
const durationMs = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value); if (!Number.isFinite(parsed)) return undefined;
  return Math.round(parsed * (value.toLowerCase().includes("ms") ? 1 : value.toLowerCase().includes("µs") ? 0.001 : 1000));
};
export async function parseHttpx(path: string): Promise<{ results: HttpxResult[]; skipped: number }> {
  const results: HttpxResult[] = []; let skipped = 0;
  await readLines(path, (line) => {
    try {
      const json = JSON.parse(line) as Record<string, unknown>;
      const rawUrl = String(json.url ?? "");
      if (!rawUrl) { skipped++; return; }
      const parsed = parseUrlHostPort(rawUrl);
      const host = normalizeHostname(String(json.host ?? json.input ?? parsed.host));
      if (!host) { skipped++; return; }
      results.push({
        url: rawUrl, normalizedUrl: normalizeUrl(rawUrl), host,
        scheme: typeof json.scheme === "string" ? json.scheme : parsed.scheme,
        port: typeof json.port === "number" ? json.port : parsed.port,
        statusCode: typeof json.status_code === "number" ? json.status_code : undefined,
        title: typeof json.title === "string" ? json.title : undefined,
        webserver: typeof json.webserver === "string" ? json.webserver : undefined,
        technologies: Array.isArray(json.tech) ? json.tech.filter((item): item is string => typeof item === "string") : [],
        contentLength: integer(json.content_length), responseTimeMs: durationMs(json.response_time),
        contentType: typeof json.content_type === "string" ? json.content_type : undefined,
        location: typeof json.location === "string" ? json.location : undefined,
        cdnName: typeof json.cdn_name === "string" ? json.cdn_name : undefined,
        failed: json.failed === true,
      });
    } catch { skipped++; }
  });
  return { results, skipped };
}
