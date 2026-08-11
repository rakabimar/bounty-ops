import { parseNormalizedUrl } from "@bountyops/shared";
import type { UrlArchiveResult } from "@bountyops/shared";
import { readLines } from "./parser-utils.js";

export async function parseUrlArchive(path: string, sourceTool: "gau" | "waybackurls") {
  const values = new Map<string, UrlArchiveResult>(); let skippedCount = 0;
  await readLines(path, (line) => {
    try {
      const parsedUrl = new URL(line);
      if (!new Set(["http:", "https:"]).has(parsedUrl.protocol)) { skippedCount++; return; }
      const parsed = parseNormalizedUrl(line);
      if (!parsed.host) { skippedCount++; return; }
      values.set(parsed.normalizedUrl, { url: line, normalizedUrl: parsed.normalizedUrl, scheme: parsed.scheme, host: parsed.host, port: parsed.port, path: parsed.path, queryParamKeys: parsed.queryParamKeys, sourceTool });
    } catch { skippedCount++; }
  });
  const results = [...values.values()];
  return { results, parsedCount: results.length, skippedCount };
}
