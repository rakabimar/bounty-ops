import ipaddr from "ipaddr.js";
import type { ScopeGuardNormalizedTarget } from "@bountyops/shared";

export interface ScopeRule {
  id: string;
  asset: string;
  assetType: string;
  isInScope: boolean;
}

interface RuleMatch {
  matched: boolean;
  reason?: string;
  unsupportedReason?: string;
}

export interface ScopeMatchResult {
  matchedInScope: boolean;
  matchedInScopeScopeId: string | null;
  matchedOutOfScope: boolean;
  matchedOutOfScopeScopeId: string | null;
  scopeReasons: string[];
}

function stripMarkdownLink(value: string): string {
  const match = value.match(/^\[([^\]]+)]\(([^)]+)\)$/);
  return (match?.[1]?.startsWith("http") ? match[1] : match?.[2]) ?? value;
}

function normalizedHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

function validPort(value: string | null): number | null {
  if (!value) return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
}

export function normalizeScopeGuardTarget(input: string): ScopeGuardNormalizedTarget {
  const trimmed = stripMarkdownLink(input.trim());

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const scheme = url.protocol.slice(0, -1).toLowerCase();
      const host = normalizedHost(url.hostname);
      const explicitPort = validPort(url.port);
      const port =
        explicitPort ?? (scheme === "http" ? 80 : scheme === "https" ? 443 : null);
      const renderedPort =
        explicitPort && !((scheme === "http" && explicitPort === 80) || (scheme === "https" && explicitPort === 443))
          ? `:${explicitPort}`
          : "";
      const path = url.pathname || "/";
      const normalized = `${scheme}://${host}${renderedPort}${path}${url.search}`;
      return { input, normalized, host, scheme, port, path, type: "url" };
    } catch {
      // Fall through to conservative host/other parsing.
    }
  }

  if (trimmed.includes("/")) {
    try {
      const [address, prefix] = ipaddr.parseCIDR(trimmed);
      return {
        input,
        normalized: `${address.toString()}/${prefix}`,
        host: address.toString(),
        scheme: null,
        port: null,
        path: null,
        type: "cidr",
      };
    } catch {
      return {
        input,
        normalized: trimmed.toLowerCase(),
        host: null,
        scheme: null,
        port: null,
        path: null,
        type: "other",
      };
    }
  }

  const hostPort = trimmed.match(/^([^:\s]+):(\d{1,5})$/);
  if (hostPort) {
    const host = normalizedHost(hostPort[1] ?? "");
    const port = validPort(hostPort[2] ?? null);
    if (host && port) {
      return {
        input,
        normalized: `${host}:${port}`,
        host,
        scheme: null,
        port,
        path: null,
        type: "host_port",
      };
    }
  }

  const wildcard = trimmed.startsWith("*.");
  const host = normalizedHost(wildcard ? trimmed.slice(2) : trimmed);
  try {
    const address = ipaddr.parse(host);
    if (address.kind() === "ipv4") {
      return {
        input,
        normalized: address.toString(),
        host: address.toString(),
        scheme: null,
        port: null,
        path: null,
        type: "ipv4",
      };
    }
  } catch {
    // A hostname is expected for most targets.
  }

  if (host && /^[a-z\d_.-]+$/i.test(host)) {
    return {
      input,
      normalized: `${wildcard ? "*." : ""}${host}`,
      host,
      scheme: null,
      port: null,
      path: null,
      type: wildcard ? "wildcard_domain" : "host",
    };
  }

  return {
    input,
    normalized: trimmed.toLowerCase(),
    host: null,
    scheme: null,
    port: null,
    path: null,
    type: "other",
  };
}

function pathMatches(scopePath: string, targetPath: string): boolean {
  if (scopePath === "/") return true;
  const prefix = scopePath.replace(/\/+$/, "");
  return targetPath === prefix || targetPath.startsWith(`${prefix}/`);
}

function matchUrl(scope: ScopeGuardNormalizedTarget, target: ScopeGuardNormalizedTarget): boolean {
  return (
    scope.type === "url" &&
    target.type === "url" &&
    scope.scheme === target.scheme &&
    scope.host === target.host &&
    scope.port === target.port &&
    pathMatches(scope.path ?? "/", target.path ?? "/")
  );
}

function matchCidr(scopeAsset: string, target: ScopeGuardNormalizedTarget): RuleMatch {
  try {
    const cidr = ipaddr.parseCIDR(scopeAsset.trim());
    if (!target.host) return { matched: false };
    const targetAddress = ipaddr.parse(target.host);
    if (targetAddress.kind() !== cidr[0].kind()) return { matched: false };
    return { matched: targetAddress.match(cidr), reason: "cidr_scope_match" };
  } catch {
    return { matched: false, unsupportedReason: "unsupported_cidr_scope" };
  }
}

function matchRule(rule: ScopeRule, target: ScopeGuardNormalizedTarget): RuleMatch {
  const assetType = rule.assetType.toLowerCase();
  const asset = rule.asset.trim();
  const scope = normalizeScopeGuardTarget(asset);
  const targetHost = target.host;

  if (assetType === "wildcard_domain") {
    const base = normalizedHost(asset.startsWith("*.") ? asset.slice(2) : asset);
    return {
      matched: Boolean(targetHost && targetHost !== base && targetHost.endsWith(`.${base}`)),
      reason: "wildcard_scope_match",
    };
  }

  if (assetType === "domain") {
    return { matched: Boolean(targetHost && scope.host === targetHost), reason: "domain_scope_match" };
  }

  if (assetType === "subdomain") {
    return { matched: Boolean(targetHost && scope.host === targetHost), reason: "subdomain_scope_match" };
  }

  if (assetType === "url") {
    return { matched: matchUrl(scope, target), reason: "url_scope_match" };
  }

  if (assetType === "api") {
    const matched = scope.type === "url" ? matchUrl(scope, target) : Boolean(scope.host && scope.host === targetHost);
    return { matched, reason: "api_scope_match" };
  }

  if (assetType === "cidr") {
    return matchCidr(asset, target);
  }

  return {
    matched: scope.normalized === target.normalized || Boolean(scope.host && scope.host === targetHost),
    reason: "exact_scope_match",
  };
}

export function matchProgramScopes(
  scopes: ScopeRule[],
  target: ScopeGuardNormalizedTarget,
): ScopeMatchResult {
  let matchedInScopeScopeId: string | null = null;
  let matchedOutOfScopeScopeId: string | null = null;
  const scopeReasons = new Set<string>();

  for (const scope of scopes) {
    const result = matchRule(scope, target);
    if (result.unsupportedReason) scopeReasons.add(result.unsupportedReason);
    if (!result.matched) continue;
    if (result.reason) scopeReasons.add(result.reason);

    if (scope.isInScope && !matchedInScopeScopeId) matchedInScopeScopeId = scope.id;
    if (!scope.isInScope && !matchedOutOfScopeScopeId) matchedOutOfScopeScopeId = scope.id;
  }

  if (matchedInScopeScopeId) scopeReasons.add("target_in_scope");
  else scopeReasons.add("no_matching_in_scope_rule");
  if (matchedOutOfScopeScopeId) scopeReasons.add("target_out_of_scope");

  return {
    matchedInScope: Boolean(matchedInScopeScopeId),
    matchedInScopeScopeId,
    matchedOutOfScope: Boolean(matchedOutOfScopeScopeId),
    matchedOutOfScopeScopeId,
    scopeReasons: [...scopeReasons],
  };
}
