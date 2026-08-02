import type { AssetType } from "@bountyops/shared";

export function normalizeHostname(value: string): string {
  let host = value.trim().toLowerCase();
  try { host = new URL(host.includes("://") ? host : `http://${host}`).hostname.toLowerCase(); } catch { host = host.split("/")[0]?.split(":")[0] ?? host; }
  return host.replace(/^\*\./, "").replace(/\.$/, "");
}

export function normalizeDomainInput(value: string): string { return normalizeHostname(value); }

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    url.hash = "";
    url.hostname = normalizeHostname(url.hostname);
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "" : "/");
  } catch { return value.trim().toLowerCase().replace(/#.*$/, ""); }
}

export function parseUrlHostPort(value: string): { host: string; scheme?: string; port?: number } {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    return { host: normalizeHostname(url.hostname), scheme: value.includes("://") ? url.protocol.slice(0, -1) : undefined, port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : url.protocol === "http:" ? 80 : undefined };
  } catch { return { host: normalizeHostname(value) }; }
}

export function normalizeAssetValue(type: AssetType, value: string): string {
  return type === "service" ? normalizeUrl(value) : normalizeHostname(value);
}
