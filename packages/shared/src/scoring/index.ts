import type {
  Priority,
  ReasonTag,
  ScoreEventDto,
  ScoringConfigDto,
  ScoringPreviewRequest,
  ScoringPreviewResponse,
  ScoringRuleDto,
} from "../types/index.js";

const normalized = (value?: string) => (value ?? "").trim().toLowerCase();
const includesKeyword = (value: string, keywords?: string[]) => Boolean(keywords?.some((keyword) => value.includes(normalized(keyword))));

export function priorityFromScore(score: number, thresholds: ScoringConfigDto["priorityThresholds"] = { P1: 15, P2: 8, Monitor: 3 }): Priority {
  if (score >= thresholds.P1) return "P1";
  if (score >= thresholds.P2) return "P2";
  if (score >= thresholds.Monitor) return "Monitor";
  return "Low";
}

function matchRule(rule: ScoringRuleDto, input: ScoringPreviewRequest): Record<string, unknown> | null {
  const match = rule.match ?? {};
  const host = normalized(input.host);
  const url = normalized(input.url);
  let path = normalized(input.path);
  if (!path && input.url) {
    try { path = new URL(input.url).pathname.toLowerCase(); } catch { path = url; }
  }
  const title = normalized(input.title);
  const technologies = (input.technologies ?? []).map(normalized);
  const contentType = normalized(input.contentType);
  const evidence: Record<string, unknown> = {};
  let matched = false;

  if (includesKeyword(host, match.hostKeywords)) { matched = true; evidence.host = input.host; }
  if (includesKeyword(path, match.pathKeywords)) { matched = true; evidence.path = path; }
  if (includesKeyword(title, match.titleKeywords)) { matched = true; evidence.title = input.title; }
  if (match.techKeywords?.some((keyword) => technologies.some((technology) => technology.includes(normalized(keyword))))) { matched = true; evidence.technologies = input.technologies; }
  if (input.statusCode !== undefined && match.statusCodes?.includes(input.statusCode)) { matched = true; evidence.statusCode = input.statusCode; }
  if (input.port !== undefined && match.ports?.includes(input.port)) { matched = true; evidence.port = input.port; }
  if (includesKeyword(contentType, match.contentTypeKeywords)) { matched = true; evidence.contentType = input.contentType; }
  if (match.urlRegex && input.url) {
    try { if (new RegExp(match.urlRegex, "i").test(input.url)) { matched = true; evidence.url = input.url; } } catch { /* Invalid regex is rejected by config validation. */ }
  }
  return matched ? evidence : null;
}

function event(ruleId: string | null, ruleName: string | null, reasonTag: ReasonTag, scoreDelta: number, evidence: Record<string, unknown>): ScoreEventDto {
  return { ruleId, ruleName, reasonTag, scoreDelta, matched: true, evidence };
}

export function evaluateScoring(config: ScoringConfigDto, input: ScoringPreviewRequest): ScoringPreviewResponse {
  const scoreEvents: ScoreEventDto[] = [];
  const categories = new Set<ScoringRuleDto["category"]>();
  for (const rule of config.rules) {
    if (!rule.enabled || !rule.entityTypes.includes(input.entityType)) continue;
    const evidence = matchRule(rule, input);
    if (!evidence) continue;
    categories.add(rule.category);
    scoreEvents.push(event(rule.id, rule.name, rule.reasonTag, rule.scoreDelta, evidence));
  }
  if (input.isNew) scoreEvents.push(event("new_asset", "New asset", "new_asset", 2, { firstSeen: true }));
  if (input.entityType === "http_service" && input.statusCode !== undefined && input.statusCode > 0) {
    scoreEvents.push(event("live_host", "Live HTTP service", "live_host", 0, { statusCode: input.statusCode }));
  }
  if (input.duplicateFingerprint) scoreEvents.push(event("duplicate_fingerprint", "Duplicate fingerprint", "duplicate_fingerprint", -2, { duplicate: true }));

  const autoScore = Math.max(0, scoreEvents.reduce((total, item) => total + item.scoreDelta, 0));
  const substantive = scoreEvents.filter((item) => !["new_asset", "live_host", "duplicate_fingerprint"].includes(item.reasonTag));
  const confidence = substantive.length >= 2 ? 90 : substantive.length === 1
    ? ((config.rules.find((rule) => rule.id === substantive[0]?.ruleId)?.confidence ?? 50) >= 75 ? 75 : 50)
    : scoreEvents.length ? 50 : 25;

  return {
    categories: [...categories],
    reasonTags: [...new Set(scoreEvents.map((item) => item.reasonTag))],
    scoreEvents,
    autoScore,
    priority: priorityFromScore(autoScore, config.priorityThresholds),
    confidence,
  };
}
