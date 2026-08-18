import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { IntakeSourceDocument, ProgramIntakePlatform } from "@bountyops/shared";
import { ApiError } from "../../utils/response.js";

const HOSTS: Record<Exclude<ProgramIntakePlatform, "manual">, readonly string[]> = {
  hackerone: ["hackerone.com", "www.hackerone.com"],
  bugcrowd: ["bugcrowd.com", "www.bugcrowd.com"],
  yeswehack: ["yeswehack.com", "www.yeswehack.com"],
};
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const privateV4 = (address: string) => {
  const parts = address.split(".").map(Number);
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || parts[0] >= 224;
};
const privateV6 = (address: string) => {
  const value = address.toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
};
const isPrivate = (address: string) => isIP(address) === 4 ? privateV4(address) : isIP(address) === 6 ? privateV6(address) : true;

export function platformFromUrl(value: string): Exclude<ProgramIntakePlatform, "manual"> {
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiError(400, "BAD_REQUEST", "Program URL is invalid"); }
  if (url.protocol !== "https:") throw new ApiError(400, "BAD_REQUEST", "Program URL must use HTTPS");
  if (url.username || url.password || (url.port && url.port !== "443")) throw new ApiError(400, "BAD_REQUEST", "Program URL credentials and non-standard ports are not allowed");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  for (const [platform, hosts] of Object.entries(HOSTS)) if (hosts.includes(hostname)) return platform as Exclude<ProgramIntakePlatform, "manual">;
  throw new ApiError(400, "BAD_REQUEST", "Program URL host is not an allowlisted platform host");
}

async function validateDestination(value: string, expected: Exclude<ProgramIntakePlatform, "manual">) {
  const platform = platformFromUrl(value);
  if (platform !== expected) throw new ApiError(400, "BAD_REQUEST", "Redirect changed program platform");
  const url = new URL(value);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => isPrivate(address))) throw new ApiError(400, "BAD_REQUEST", "Program host did not resolve to a permitted public address");
  return url;
}

const entities = (value: string) => value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
export function normalizeSourceHtml(html: string) {
  const title = entities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  const jsonLd = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .slice(0, 10)
    .flatMap((match) => {
      try { return [JSON.stringify(JSON.parse(match[1]))]; } catch { return []; }
    })
    .join("\n")
    .slice(0, 20_000);
  const structured = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(h[1-6]|li|tr|p|div|section|article|br|table|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<\/((h[1-6])|li|tr|p|div|section|article|table|ul|ol)>/gi, "\n")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => `${label} (${href})`)
    .replace(/<[^>]+>/g, " ");
  const visibleText = entities(structured).replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  const rawText = `${visibleText}${jsonLd ? `\nStructured metadata:\n${jsonLd}` : ""}`.slice(0, 250000);
  return { title: title || undefined, rawText };
}

async function readCapped(response: Response) {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BYTES) throw new ApiError(400, "BAD_REQUEST", "Program page exceeds the 2 MB limit");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_BYTES) { await reader.cancel(); throw new ApiError(400, "BAD_REQUEST", "Program page exceeds the 2 MB limit"); } chunks.push(value); }
  const all = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(all);
}

export async function fetchPlatformSource(sourceUrl: string): Promise<IntakeSourceDocument> {
  const platform = platformFromUrl(sourceUrl);
  let current = sourceUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await validateDestination(current, platform);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(current, { redirect: "manual", signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml", "user-agent": "BountyOps-Program-Intake/1.0" } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) throw new ApiError(400, "BAD_REQUEST", "Unable to fetch program page. Paste the policy text manually.");
        current = new URL(location, current).toString(); continue;
      }
      if (!response.ok) throw new ApiError(400, "BAD_REQUEST", "Unable to fetch program page. Paste the policy text manually.");
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new ApiError(400, "BAD_REQUEST", "Program page returned an unsupported content type");
      const body = await readCapped(response); const normalized = contentType.includes("html") ? normalizeSourceHtml(body) : { rawText: body.slice(0, 250000), title: undefined };
      return { platform, sourceType: "platform_url", sourceUrl: current, ...normalized, fetchedAt: new Date().toISOString(), contentHash: createHash("sha256").update(normalized.rawText).digest("hex") };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "BAD_REQUEST", "Unable to fetch program page. Paste the policy text manually.");
    } finally { clearTimeout(timeout); }
  }
  throw new ApiError(400, "BAD_REQUEST", "Unable to fetch program page. Paste the policy text manually.");
}

export function pastedTextDocument(platform: ProgramIntakePlatform, text: string): IntakeSourceDocument {
  const rawText = text.replace(/\u0000/g, "").replace(/\r/g, "").trim().slice(0, 250000);
  return { platform, sourceType: "pasted_text", rawText, contentHash: createHash("sha256").update(rawText).digest("hex") };
}

export function buildAiPolicyInput(text: string, limit = 50_000) {
  if (text.length <= limit) return text;
  const keywords = /scope|in scope|out of scope|bounty|eligib|automat|scanner|rate|request|prohibit|forbid|denial of service|brute force|authentication|safe harbor|header|researcher/i;
  const priority = text.split("\n").filter((line) => keywords.test(line)).join("\n");
  return `${priority}\n\n${text}`.slice(0, limit);
}
