import { normalizeAsset } from "../../utils/normalize.js";
import type { ProgramIntakeStructuredResult } from "@bountyops/shared";

const permissionRank = { no: 0, unknown: 1, limited: 2, yes: 3 } as const;
export function mergeIntakeResults(deterministic: ProgramIntakeStructuredResult, ai: ProgramIntakeStructuredResult, sourceText: string) {
  const warnings = [...deterministic.warnings];
  const detScopes = new Map(deterministic.scopes.map((scope) => [normalizeAsset(scope.asset), scope]));
  for (const proposed of ai.scopes) {
    const key = normalizeAsset(proposed.asset); const current = detScopes.get(key);
    if (current) {
      if (!current.isInScope && proposed.isInScope) warnings.push(`AI scope conflict ignored for ${current.asset}: out-of-scope takes precedence`);
      continue;
    }
    const literalPresent = sourceText.toLowerCase().includes(proposed.asset.toLowerCase());
    const wildcardWidening = proposed.asset.startsWith("*.") && !literalPresent;
    if (!literalPresent || wildcardWidening) { warnings.push(`AI-proposed scope ${proposed.asset} was not accepted because it was not explicitly present in policy text`); continue; }
    detScopes.set(key, { ...proposed, isInScope: proposed.isInScope, confidence: Math.min(proposed.confidence, 75) });
  }
  const detAutomation = deterministic.rules.automationAllowed; const aiAutomation = ai.rules.automationAllowed;
  const automationAllowed = permissionRank[aiAutomation] < permissionRank[detAutomation] ? aiAutomation : detAutomation;
  if (aiAutomation !== detAutomation) warnings.push("AI disagreed with deterministic automation extraction; the safer value was retained");
  if (ai.rules.dosTestingAllowed) warnings.push("AI suggested DoS permission; it was rejected and requires manual review");
  if (ai.rules.aggressiveAllowed && !deterministic.rules.aggressiveAllowed) warnings.push("AI suggested aggressive scanning; it was rejected pending explicit user approval");
  const aiRateSupported = ai.rules.rateLimitRps !== null && new RegExp(`\\b${ai.rules.rateLimitRps}\\b[^.\\n]{0,40}(?:requests?\\s*per\\s*second|rps)`, "i").test(sourceText);
  const aiConcurrencySupported = ai.rules.maxConcurrency !== null && new RegExp(`(?:concurren|parallel)[^.\\n]{0,40}\\b${ai.rules.maxConcurrency}\\b`, "i").test(sourceText);
  if (deterministic.rules.rateLimitRps === null && ai.rules.rateLimitRps !== null && !aiRateSupported) warnings.push("AI-proposed rate limit lacked explicit source evidence and was not accepted");
  if (deterministic.rules.maxConcurrency === null && ai.rules.maxConcurrency !== null && !aiConcurrencySupported) warnings.push("AI-proposed concurrency lacked explicit source evidence and was not accepted");
  const headers = deterministic.requiredHeaders.map((header) => ({ ...header, value: header.value ?? ai.requiredHeaders.find((candidate) => candidate.name.toLowerCase() === header.name.toLowerCase() && sourceText.includes(candidate.value ?? "\u0000"))?.value ?? null }));
  const overallConfidence = Math.min(100, Math.max(deterministic.overallConfidence, Math.round((deterministic.overallConfidence + ai.overallConfidence) / 2)));
  return {
    ...deterministic,
    programName: deterministic.programName ?? (ai.programName && sourceText.toLowerCase().includes(ai.programName.toLowerCase()) ? ai.programName : null),
    handle: deterministic.handle ?? (ai.handle && sourceText.toLowerCase().includes(ai.handle.toLowerCase()) ? ai.handle : null),
    scopes: [...detScopes.values()],
    rules: { ...deterministic.rules, automationAllowed, aggressiveAllowed: deterministic.rules.aggressiveAllowed && ai.rules.aggressiveAllowed, rateLimitRps: deterministic.rules.rateLimitRps ?? (aiRateSupported ? ai.rules.rateLimitRps : null), maxConcurrency: deterministic.rules.maxConcurrency ?? (aiConcurrencySupported ? ai.rules.maxConcurrency : null), forbiddenActions: [...new Set([...deterministic.rules.forbiddenActions, ...ai.rules.forbiddenActions])], authTestingAllowed: deterministic.rules.authTestingAllowed && ai.rules.authTestingAllowed, dosTestingAllowed: false },
    requiredHeaders: headers, safeHarborSummary: deterministic.safeHarborSummary ?? ai.safeHarborSummary, reportingNotes: deterministic.reportingNotes ?? ai.reportingNotes,
    warnings: [...new Set(warnings)], overallConfidence,
  } satisfies ProgramIntakeStructuredResult;
}
