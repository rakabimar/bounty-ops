import type { NucleiFindingResult, ScannerFindingSeverity } from "@bountyops/shared";
import { readLines } from "./parser-utils.js";

const severities = new Set<ScannerFindingSeverity>(["info", "low", "medium", "high", "critical"]);
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function redact(value: string): string {
  return value
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(?:bearer\s+)[A-Za-z0-9._~+\/-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 1_000);
}

export async function parseNuclei(path: string) {
  const results: NucleiFindingResult[] = []; let skippedCount = 0;
  await readLines(path, (line) => {
    try {
      const record = JSON.parse(line) as Record<string, unknown>; const info = object(record.info);
      const matchedUrl = String(record["matched-at"] ?? record.matched_at ?? record.host ?? "");
      if (!matchedUrl) { skippedCount++; return; }
      const rawSeverity = String(info.severity ?? record.severity ?? "info").toLowerCase() as ScannerFindingSeverity;
      const severity = severities.has(rawSeverity) ? rawSeverity : "info";
      const name = String(info.name ?? record.name ?? record["template-id"] ?? record.templateID ?? "Nuclei scanner finding").slice(0, 500);
      const matcher = typeof record["matcher-name"] === "string" ? record["matcher-name"] : typeof record.matcher === "string" ? record.matcher : undefined;
      const extracted = Array.isArray(record["extracted-results"]) ? record["extracted-results"].filter((item): item is string => typeof item === "string").slice(0, 20).map(redact) : [];
      results.push({ templateId: typeof record["template-id"] === "string" ? record["template-id"] : typeof record.templateID === "string" ? record.templateID : undefined, name, severity, description: typeof info.description === "string" ? info.description.slice(0, 5_000) : undefined, matcher, matchedUrl, evidenceSnippet: redact([matcher, ...extracted.slice(0, 3)].filter(Boolean).join(" · ")), extractedResults: extracted });
    } catch { skippedCount++; }
  });
  return { results, parsedCount: results.length, skippedCount };
}
