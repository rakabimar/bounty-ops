import type { DeterministicIntakeResult, IntakeSourceDocument, ProgramIntakeStructuredResult } from "@bountyops/shared";

const assetType = (asset: string): ProgramIntakeStructuredResult["scopes"][number]["assetType"] => {
  if (asset.startsWith("*.")) return "wildcard_domain";
  if (/^https?:\/\//i.test(asset)) return /\/api(?:\/|$)|\/graphql(?:\/|$)/i.test(asset) ? "api" : "url";
  if (/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/.test(asset)) return "cidr";
  return asset.split(".").length > 2 ? "subdomain" : "domain";
};
const cleanAsset = (value: string) => value.trim().replace(/^[`'"([{]+|[`'"\])},;:]+$/g, "").replace(/[.)]$/, "");
const candidates = (line: string) => {
  const values = line.match(/https?:\/\/[^\s<>'"`]+|\*\.[a-z0-9][a-z0-9.-]*\.[a-z]{2,}|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?|\b\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}\b/gi) ?? [];
  return [...new Set(values.map(cleanAsset).filter((value) => !/^(www\.)?(hackerone|bugcrowd|yeswehack)\.com$/i.test(value)))];
};
const evidence = (line: string) => line.replace(/\s+/g, " ").trim().slice(0, 500);

export function parseProgramPolicy(source: IntakeSourceDocument): DeterministicIntakeResult {
  const lines = source.rawText.split("\n").map((line) => line.trim()).filter(Boolean);
  const lower = source.rawText.toLowerCase();
  let section: "in" | "out" | null = null; let explicitIn = false; let explicitOut = false; let conflicts = false;
  const scopeMap = new Map<string, ProgramIntakeStructuredResult["scopes"][number]>();
  for (const line of lines) {
    const l = line.toLowerCase();
    if (/\bout[- ]of[- ]scope\b|\bexcluded targets?\b|\bnot in scope\b/.test(l)) { section = "out"; explicitOut = true; }
    else if (/\bin[- ]scope\b|\beligible targets?\b|\bscope assets?\b/.test(l)) { section = "in"; explicitIn = true; }
    if (/safe harbor|reporting|rules|policy|guidelines|automation|prohibited|forbidden/i.test(l) && !candidates(line).length && !/in[- ]scope|out[- ]of[- ]scope/i.test(l)) section = null;
    for (const asset of candidates(line)) {
      const normalized = asset.toLowerCase().replace(/\/$/, "");
      const lineOut = /out[- ]of[- ]scope|excluded|not eligible|not in scope/i.test(line);
      const lineIn = /in[- ]scope|eligible/i.test(line) && !lineOut;
      const isInScope: boolean | null = lineOut ? false : lineIn ? true : section === "out" ? false : section === "in" ? true : null;
      if (isInScope === null) continue;
      const previous = scopeMap.get(normalized);
      if (previous && previous.isInScope !== isInScope) conflicts = true;
      if (!previous || !isInScope) scopeMap.set(normalized, { asset, assetType: assetType(asset), isInScope, bountyEligible: /not bounty eligible|no bounty/i.test(line) ? false : null, notes: null, confidence: lineOut || lineIn ? 95 : 80, sourceEvidence: evidence(line) });
    }
  }
  const automationDenied = /(?:automated|automation|scanner|scanning)[^.\n]{0,80}(?:not allowed|prohibited|forbidden|must not|do not)/i.test(source.rawText) || /(?:do not|must not)[^.\n]{0,50}(?:automated|scanner|scanning)/i.test(source.rawText);
  const automationLimited = /(?:automated|automation|scanner|scanning)[^.\n]{0,120}(?:limited|rate limit|requests? per second|rps)/i.test(source.rawText);
  const automationPermitted = /(?:automated|automation|scanner|scanning)[^.\n]{0,80}(?:allowed|permitted|may use)/i.test(source.rawText);
  const automationAllowed = automationDenied ? "no" : automationLimited ? "limited" : automationPermitted ? "yes" : "unknown";
  const ruleConflict = automationDenied && automationPermitted;
  const rate = source.rawText.match(/(?:up to|limit(?:ed)? to|maximum(?: of)?|at)\s*(\d{1,5})\s*(?:requests?\s*per\s*second|rps)/i) ?? source.rawText.match(/(\d{1,5})\s*(?:requests?\s*per\s*second|rps)/i);
  const concurrency = source.rawText.match(/(?:max(?:imum)?\s*)?(?:concurrency|concurrent requests?)\s*(?:of|:|is)?\s*(\d{1,4})/i);
  const dosMention = /denial of service|\bdos\b|\bddos\b|stress test|load test/i.test(source.rawText);
  const brute = /brute[- ]?force/i.test(source.rawText);
  const forbidden = [...new Set([...(dosMention ? ["dos"] : []), ...(brute ? ["bruteforce"] : []), ...(/social engineering/i.test(lower) ? ["social_engineering"] : [])])];
  const authAllowed = /auth(?:entication)? testing[^.\n]{0,50}(?:allowed|permitted)/i.test(source.rawText) && !/auth(?:entication)? testing[^.\n]{0,50}(?:prohibited|forbidden|not allowed)/i.test(source.rawText);
  const requiredHeaders: ProgramIntakeStructuredResult["requiredHeaders"] = [];
  for (const line of lines) {
    if (!/required|must include|researcher header|custom header/i.test(line)) continue;
    const match = line.match(/\b(X-[A-Za-z0-9-]{2,100})\b\s*(?::|=)?\s*([^,;\n]*)/i);
    if (match) requiredHeaders.push({ name: match[1], value: match[2]?.trim() && !/required|header/i.test(match[2]) ? match[2].trim().slice(0, 500) : null, isRequired: true, notes: evidence(line) });
  }
  const warnings: string[] = [];
  if (!scopeMap.size) warnings.push("No scope assets were extracted deterministically");
  if (automationAllowed === "unknown") warnings.push("Automation permission not explicitly stated");
  if (!rate) warnings.push("Rate limit not specified");
  if (requiredHeaders.some((header) => !header.value)) warnings.push("Required header value missing");
  if (conflicts) warnings.push("Scope conflict detected; out-of-scope takes precedence");
  if (ruleConflict) warnings.push("Conflicting automation language detected; the restrictive interpretation was retained");
  if (dosMention) warnings.push("DoS language requires manual review; DoS testing remains disabled");
  const name = source.title?.replace(/\s*[|—-]\s*(HackerOne|Bugcrowd|YesWeHack).*$/i, "").trim() || lines.find((line) => /^program(?: name)?\s*:/i.test(line))?.split(":").slice(1).join(":").trim() || null;
  const handle = source.sourceUrl ? new URL(source.sourceUrl).pathname.split("/").filter(Boolean).at(-1) ?? null : null;
  let confidence = 15;
  if (scopeMap.size) confidence += 35;
  if (explicitIn) confidence += 15;
  if (explicitOut) confidence += 10;
  if (automationAllowed !== "unknown") confidence += 15;
  if (rate || requiredHeaders.length) confidence += 5;
  if (name) confidence += 5;
  if (conflicts) confidence -= 20;
  confidence = Math.max(0, Math.min(100, confidence));
  const structuredData: ProgramIntakeStructuredResult = {
    platform: source.platform, programName: name, handle, programUrl: source.sourceUrl ?? null,
    scopes: [...scopeMap.values()],
    rules: { automationAllowed, aggressiveAllowed: /aggressive (?:scanning|testing)[^.\n]{0,50}(?:allowed|permitted)/i.test(source.rawText) && !/aggressive (?:scanning|testing)[^.\n]{0,50}(?:not allowed|prohibited|forbidden)/i.test(source.rawText), rateLimitRps: rate ? Number(rate[1]) : null, maxConcurrency: concurrency ? Number(concurrency[1]) : null, forbiddenActions: forbidden, authTestingAllowed: authAllowed, dosTestingAllowed: false, notes: null },
    requiredHeaders, safeHarborSummary: lines.find((line) => /safe harbor/i.test(line))?.slice(0, 2000) ?? null,
    reportingNotes: lines.find((line) => /report(?:ing)? (?:guideline|requirement|process)/i.test(line))?.slice(0, 2000) ?? null,
    warnings, overallConfidence: confidence,
  };
  return { structuredData, confidence, ambiguous: conflicts || ruleConflict || !scopeMap.size || automationAllowed === "unknown", warnings };
}
