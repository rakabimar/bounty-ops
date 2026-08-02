import type { DnsxResult } from "@bountyops/shared";
import { normalizeHostname } from "../normalization.js";
import { readLines } from "./parser-utils.js";

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : [];
export async function parseDnsx(path: string): Promise<{ results: DnsxResult[]; skipped: number }> {
  const results: DnsxResult[] = []; let skipped = 0;
  await readLines(path, (line) => {
    try {
      const json = JSON.parse(line) as Record<string, unknown>;
      const host = normalizeHostname(String(json.host ?? json.input ?? ""));
      if (!host) { skipped++; return; }
      const ttl = typeof json.ttl === "number" ? json.ttl : undefined;
      const records: DnsxResult["records"] = [];
      for (const value of strings(json.a)) records.push({ type: "A", value, ttl });
      for (const value of strings(json.aaaa)) records.push({ type: "AAAA", value, ttl });
      for (const value of strings(json.cname)) records.push({ type: "CNAME", value: normalizeHostname(value), ttl });
      if (!records.length && json.resp && typeof json.resp === "object") {
        const response = json.resp as Record<string, unknown>;
        for (const value of strings(response.a)) records.push({ type: "A", value, ttl });
        for (const value of strings(response.aaaa)) records.push({ type: "AAAA", value, ttl });
        for (const value of strings(response.cname)) records.push({ type: "CNAME", value: normalizeHostname(value), ttl });
      }
      results.push({ host, records, ...(typeof json.resolver === "string" ? { resolver: json.resolver } : {}) });
    } catch { skipped++; }
  });
  return { results, skipped };
}
