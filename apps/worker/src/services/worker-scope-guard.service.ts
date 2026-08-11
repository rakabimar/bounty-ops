import { prisma } from "@bountyops/db";
import { normalizeHostname, normalizeUrl } from "../tools/normalization.js";

export interface WorkerPolicy {
  programId: string;
  rateLimitRps: number;
  maxConcurrency: number;
  requiredHeaders: Array<{ name: string; value: string }>;
  outOfScopeRegexes: string[];
  allows(target: string, active: boolean): { allowed: boolean; reason: string };
}

function matches(asset: string, type: string, target: string): boolean {
  const host = normalizeHostname(target);
  const normalizedAsset = asset.trim().toLowerCase().replace(/\.$/, "");
  if (type === "wildcard_domain") {
    const base = normalizeHostname(normalizedAsset.replace(/^\*\./, ""));
    return host !== base && host.endsWith(`.${base}`);
  }
  if (type === "url" || (type === "api" && normalizedAsset.includes("://"))) {
    const targetUrl = normalizeUrl(target);
    const scopeUrl = normalizeUrl(normalizedAsset);
    return targetUrl === scopeUrl || targetUrl.startsWith(`${scopeUrl.replace(/\/$/, "")}/`);
  }
  return host === normalizeHostname(normalizedAsset);
}

export async function loadWorkerPolicy(programId: string): Promise<WorkerPolicy> {
  const program = await prisma.program.findUnique({ where: { id: programId }, include: { scopes: true, rules: true, headers: true } });
  if (!program) throw new Error("Program not found during worker Scope Guard check");
  const rateLimitRps = program.rules?.rateLimitRps ?? Math.max(1, Number(process.env.DEFAULT_RATE_LIMIT_RPS) || 3);
  const maxConcurrency = program.rules?.maxConcurrency ?? Math.max(1, Number(process.env.DEFAULT_MAX_CONCURRENCY) || 2);
  return {
    programId,
    rateLimitRps,
    maxConcurrency,
    requiredHeaders: program.headers.filter((header) => header.isRequired).map((header) => ({ name: header.name, value: header.value })),
    outOfScopeRegexes: program.scopes.filter((scope) => !scope.isInScope).map((scope) => scopeRegex(scope.asset, scope.assetType)),
    allows(target, active) {
      if (program.status !== "active") return { allowed: false, reason: "program_not_active" };
      if (program.huntingStatus !== "ongoing") return { allowed: false, reason: "hunting_not_ongoing" };
      if (active && program.rules?.automationAllowed === "no") return { allowed: false, reason: "automation_not_allowed" };
      const out = program.scopes.find((scope) => !scope.isInScope && matches(scope.asset, scope.assetType, target));
      if (out) return { allowed: false, reason: "target_out_of_scope" };
      const inside = program.scopes.find((scope) => scope.isInScope && matches(scope.asset, scope.assetType, target));
      return inside ? { allowed: true, reason: "target_in_scope" } : { allowed: false, reason: "no_matching_in_scope_rule" };
    },
  };
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function scopeRegex(asset: string, type: string): string {
  const trimmed = asset.trim();
  if ((type === "url" || type === "api") && trimmed.includes("://")) return `^${escapeRegex(normalizeUrl(trimmed)).replace(/\/$/, "")}(?:/|$)`;
  const host = normalizeHostname(trimmed.replace(/^\*\./, ""));
  return type === "wildcard_domain" ? `^https?://(?:[^/]+\\.)+${escapeRegex(host)}(?::\\d+)?(?:/|$)` : `^https?://${escapeRegex(host)}(?::\\d+)?(?:/|$)`;
}
