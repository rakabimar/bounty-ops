export interface NormalizedUrlParts {
  input: string;
  normalizedUrl: string;
  scheme: string | null;
  host: string;
  port: number | null;
  path: string;
  queryParamKeys: string[];
}

export function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return path.replace(/\/{2,}/g, "/");
}

export function inferSchemeFromUrl(value: string): string | null {
  try { return new URL(value.trim()).protocol.replace(/:$/, "").toLowerCase(); } catch { return null; }
}

export function inferPortFromUrl(value: string): number | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.port) return Number(parsed.port);
    return parsed.protocol === "https:" ? 443 : parsed.protocol === "http:" ? 80 : null;
  } catch { return null; }
}

export function extractQueryParamKeys(value: string): string[] {
  try { return [...new Set([...new URL(value.trim()).searchParams.keys()].sort())]; } catch { return []; }
}

export function parseNormalizedUrl(value: string): NormalizedUrlParts {
  const input = value.trim();
  try {
    const parsed = new URL(input);
    parsed.hostname = normalizeHost(parsed.hostname);
    parsed.hash = "";
    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) parsed.port = "";
    const entries = [...parsed.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    parsed.search = "";
    for (const [key, entryValue] of entries) parsed.searchParams.append(key, entryValue);
    parsed.pathname = normalizePath(parsed.pathname);
    const normalizedUrl = parsed.pathname === "/" && !parsed.search ? parsed.toString().replace(/\/$/, "") : parsed.toString();
    return { input, normalizedUrl, scheme: parsed.protocol.replace(/:$/, ""), host: parsed.hostname, port: parsed.port ? Number(parsed.port) : inferPortFromUrl(parsed.toString()), path: parsed.pathname, queryParamKeys: [...new Set(entries.map(([key]) => key))] };
  } catch {
    const fallback = input.toLowerCase().replace(/#.*$/, "");
    return { input, normalizedUrl: fallback, scheme: null, host: normalizeHost(fallback.split(/[/:?]/)[0] ?? fallback), port: null, path: normalizePath(fallback.includes("/") ? fallback.slice(fallback.indexOf("/")) : "/"), queryParamKeys: [] };
  }
}

export const normalizeUrl = (value: string) => parseNormalizedUrl(value).normalizedUrl;
export const normalizeFullUrl = normalizeUrl;

export function inferMethod(value?: string): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "UNKNOWN" {
  const method = value?.trim().toUpperCase();
  return method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE" || method === "OPTIONS" || method === "HEAD" ? method : "UNKNOWN";
}
