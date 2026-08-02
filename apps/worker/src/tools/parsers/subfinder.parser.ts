import type { SubfinderResult } from "@bountyops/shared";
import { normalizeHostname } from "../normalization.js";
import { readLines } from "./parser-utils.js";

export async function parseSubfinder(path: string): Promise<{ results: SubfinderResult[]; skipped: number }> {
  const values = new Map<string, SubfinderResult>(); let skipped = 0;
  await readLines(path, (line) => {
    try {
      const json = line.startsWith("{") ? JSON.parse(line) as Record<string, unknown> : null;
      const raw = json ? String(json.host ?? json.input ?? "") : line;
      const host = normalizeHostname(raw);
      if (!host || !host.includes(".")) { skipped++; return; }
      values.set(host, { host, ...(typeof json?.source === "string" ? { source: json.source } : {}) });
    } catch { skipped++; }
  });
  return { results: [...values.values()], skipped };
}
