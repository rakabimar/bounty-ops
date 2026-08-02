import { Prisma, type PrismaClient } from "@bountyops/db";
import {
  DEFAULT_BLOCKED_ACTION_CATEGORIES,
  MANUAL_APPROVAL_JOB_TYPES,
  RECON_JOB_DEFAULT_STAGES,
  RECON_STAGES,
  type AutomationAllowed,
  type ReconJobType,
  type ReconStage,
  type ScopeGuardDecision,
  type ScopeGuardPreflightInput,
  type ScopeGuardPreflightResult,
  type ScopeGuardSummary,
} from "@bountyops/shared";
import { env } from "../../env.js";
import { createAuditLog } from "../audit/audit.service.js";
import { matchProgramScopes, normalizeScopeGuardTarget } from "./scope-matcher.js";

const STAGE_RANK: Record<ReconStage, number> = {
  passive: 0,
  active_light: 1,
  active_medium: 2,
  active_deep: 3,
  manual_approval: 4,
  blocked: 5,
};

const POLICY_AWARE_DEEP_JOB_TYPES = new Set<ReconJobType>([
  "ffuf_small",
  "alterx_permutation",
  "crawl_headless",
  "full_deep_recon",
]);

const JOB_ACTION_CATEGORIES: Partial<Record<ReconJobType, string[]>> = {
  ffuf_small: ["bruteforce", "content_discovery"],
  ffuf_deep: ["bruteforce", "content_discovery"],
  port_discovery: ["port_scan"],
  nmap_verification: ["port_scan"],
  nuclei_safe: ["scanner"],
  nuclei_advanced: ["scanner", "advanced_scanning"],
  interactsh_oob: ["oob"],
  full_deep_recon: ["deep_recon"],
};

interface EvaluateOptions {
  persist?: boolean;
  userId?: string;
}

interface RulesView {
  automationAllowed: AutomationAllowed;
  aggressiveAllowed: boolean;
  rateLimitRps: number | null;
  maxConcurrency: number | null;
  forbiddenActions: string[];
  dosTestingAllowed: boolean;
}

function automationValue(value: string | undefined): AutomationAllowed {
  return value === "yes" || value === "no" || value === "limited" ? value : "unknown";
}

function jsonStrings(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase())
    : [];
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

async function resolveLimits(
  prisma: PrismaClient,
  rules: RulesView,
  jobType?: ReconJobType,
): Promise<{ rateLimitRps: number; maxConcurrency: number }> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["default.rateLimitRps", "default.maxConcurrency"] } },
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  const storedRate = positiveInteger(values.get("default.rateLimitRps"));
  const storedConcurrency = positiveInteger(values.get("default.maxConcurrency"));
  const envRate = positiveInteger(env.DEFAULT_RATE_LIMIT_RPS) ?? 3;
  const envConcurrency = positiveInteger(env.DEFAULT_MAX_CONCURRENCY) ?? 2;

  return {
    rateLimitRps:
      rules.rateLimitRps ?? storedRate ?? (jobType === "dns_resolve" ? 10 : envRate),
    maxConcurrency: rules.maxConcurrency ?? storedConcurrency ?? envConcurrency,
  };
}

function effectiveStage(jobType: ReconJobType, requested?: ReconStage): ReconStage {
  const defaultStage = RECON_JOB_DEFAULT_STAGES[jobType];
  if (!requested) return defaultStage;
  return STAGE_RANK[requested] > STAGE_RANK[defaultStage] ? requested : defaultStage;
}

function stageAccess(
  programActive: boolean,
  huntingOngoing: boolean,
  rules: RulesView,
): { allowed: ReconStage[]; blocked: ReconStage[] } {
  if (!programActive || !huntingOngoing) {
    return { allowed: [], blocked: [...RECON_STAGES] };
  }

  const allowed = new Set<ReconStage>(["passive"]);
  if (rules.automationAllowed !== "no") {
    allowed.add("active_light");
    allowed.add("active_medium");
  }
  if (
    rules.automationAllowed === "limited" ||
    rules.automationAllowed === "yes" ||
    (rules.automationAllowed === "unknown" && rules.aggressiveAllowed)
  ) {
    allowed.add("active_deep");
  }

  return {
    allowed: RECON_STAGES.filter((stage) => allowed.has(stage)),
    blocked: RECON_STAGES.filter((stage) => !allowed.has(stage)),
  };
}

function actionBlockReason(rules: RulesView, jobType: ReconJobType): string | null {
  const categories = new Set([
    jobType.toLowerCase(),
    ...(JOB_ACTION_CATEGORIES[jobType] ?? []),
  ]);
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const normalizedCategories = new Set([...categories].map(normalize));
  const configured = rules.forbiddenActions.map(normalize);

  for (const forbidden of configured) {
    if (normalizedCategories.has(forbidden) || normalize(jobType).includes(forbidden)) {
      return `forbidden_action:${forbidden}`;
    }
  }

  for (const blocked of DEFAULT_BLOCKED_ACTION_CATEGORIES) {
    if (normalizedCategories.has(normalize(blocked))) return `default_action_blocked:${blocked}`;
  }

  if (!rules.dosTestingAllowed && normalizedCategories.has("dos")) {
    return "dos_testing_not_allowed";
  }

  return null;
}

function policyDecision(
  rules: RulesView,
  jobType: ReconJobType,
  stage: ReconStage,
  manualApproved: boolean,
  reasons: string[],
): { blocked: boolean; limited: boolean } {
  if (stage === "blocked") {
    reasons.push("stage_blocked");
    return { blocked: true, limited: false };
  }

  const manualRequired = stage === "manual_approval" || MANUAL_APPROVAL_JOB_TYPES.includes(jobType as never);
  if (manualRequired && !manualApproved) {
    reasons.push("manual_approval_required");
    return { blocked: true, limited: false };
  }
  if (manualRequired) reasons.push("manual_approval_confirmed");

  if (stage === "passive") {
    reasons.push("passive_stage_allowed");
    return { blocked: false, limited: false };
  }

  if (rules.automationAllowed === "no") {
    reasons.push("automation_not_allowed");
    return { blocked: true, limited: false };
  }

  if (rules.automationAllowed === "unknown") {
    if (stage === "active_deep" || stage === "manual_approval") {
      if (!rules.aggressiveAllowed) {
        reasons.push("aggressive_automation_not_allowed");
        return { blocked: true, limited: false };
      }
      reasons.push("automation_unknown_conservative_limits");
      return { blocked: false, limited: true };
    }
    reasons.push("automation_unknown_conservative_limits");
    return { blocked: false, limited: true };
  }

  if (rules.automationAllowed === "limited") {
    if ((stage === "active_deep" || stage === "manual_approval") && !rules.aggressiveAllowed) {
      reasons.push("deep_recon_limited_by_policy");
      return { blocked: false, limited: true };
    }
    reasons.push("limited_automation_allowed");
    return { blocked: false, limited: false };
  }

  if (stage === "active_deep" && !rules.aggressiveAllowed && !POLICY_AWARE_DEEP_JOB_TYPES.has(jobType)) {
    reasons.push("deep_recon_requires_aggressive_permission");
    return { blocked: true, limited: false };
  }

  reasons.push("automation_allowed");
  return { blocked: false, limited: false };
}

async function persistDecision(
  prisma: PrismaClient,
  result: ScopeGuardPreflightResult,
  userId?: string,
  programExists = true,
): Promise<void> {
  // TODO(production): review encryption/masking for persisted header values.
  const check = await prisma.scopeGuardCheck.create({
    data: {
      programId: programExists ? result.programId : null,
      userId,
      target: result.target,
      normalizedTarget: result.normalizedTarget as unknown as Prisma.InputJsonValue,
      jobType: result.jobType,
      stage: result.stage,
      decision: result.decision,
      allowed: result.allowed,
      reasons: result.reasons as Prisma.InputJsonValue,
      matchedInScopeScopeId: result.matchedInScopeScopeId,
      matchedOutOfScopeScopeId: result.matchedOutOfScopeScopeId,
      effectiveRateLimitRps: result.effectiveRateLimitRps,
      effectiveMaxConcurrency: result.effectiveMaxConcurrency,
      requiredHeaders: result.requiredHeaders as unknown as Prisma.InputJsonValue,
    },
  });

  await createAuditLog(prisma, {
    userId,
    programId: programExists ? result.programId : undefined,
    action: `scope_guard.${result.decision}`,
    entityType: "scope_guard_check",
    entityId: check.id,
    metadata: {
      requestedProgramId: result.programId,
      target: result.target,
      normalizedTarget: result.normalizedTarget,
      jobType: result.jobType,
      stage: result.stage,
      reasons: result.reasons,
      matchedInScopeScopeId: result.matchedInScopeScopeId,
      matchedOutOfScopeScopeId: result.matchedOutOfScopeScopeId,
      effectiveRateLimitRps: result.effectiveRateLimitRps,
      effectiveMaxConcurrency: result.effectiveMaxConcurrency,
      requiredHeaderNames: result.requiredHeaders.map((header) => header.name),
    } as unknown as Prisma.InputJsonValue,
  });
}

export async function evaluateScopeGuard(
  prisma: PrismaClient,
  input: ScopeGuardPreflightInput,
  options: EvaluateOptions = {},
): Promise<ScopeGuardPreflightResult> {
  const normalizedTarget = normalizeScopeGuardTarget(input.target);
  const stage = effectiveStage(input.jobType, input.stage);
  const program = await prisma.program.findUnique({
    where: { id: input.programId },
    include: {
      scopes: { orderBy: { createdAt: "asc" } },
      rules: true,
      headers: { orderBy: { createdAt: "asc" } },
    },
  });

  const rules: RulesView = {
    automationAllowed: automationValue(program?.rules?.automationAllowed),
    aggressiveAllowed: program?.rules?.aggressiveAllowed ?? false,
    rateLimitRps: program?.rules?.rateLimitRps ?? null,
    maxConcurrency: program?.rules?.maxConcurrency ?? null,
    forbiddenActions: jsonStrings(program?.rules?.forbiddenActions),
    dosTestingAllowed: program?.rules?.dosTestingAllowed ?? false,
  };
  const limits = await resolveLimits(prisma, rules, input.jobType);
  const scope = matchProgramScopes(program?.scopes ?? [], normalizedTarget);
  const stages = stageAccess(
    program?.status === "active",
    program?.huntingStatus === "ongoing",
    rules,
  );
  const reasons: string[] = [];
  let hardBlocked = false;
  let limited = false;

  if (input.stage && input.stage !== stage) reasons.push("stage_elevated_to_job_default");

  if (!program) {
    reasons.push("program_not_found");
    hardBlocked = true;
  } else {
    if (program.status === "active") reasons.push("program_active");
    else {
      reasons.push("program_not_active");
      hardBlocked = true;
    }
    if (program.huntingStatus === "ongoing") reasons.push("hunting_ongoing");
    else {
      reasons.push("hunting_not_ongoing");
      hardBlocked = true;
    }
  }

  reasons.push(...scope.scopeReasons);
  if (!scope.matchedInScope || scope.matchedOutOfScope) hardBlocked = true;

  const actionReason = actionBlockReason(rules, input.jobType);
  if (actionReason) {
    reasons.push(actionReason);
    hardBlocked = true;
  }

  const policy = policyDecision(rules, input.jobType, stage, input.manualApproved ?? false, reasons);
  hardBlocked ||= policy.blocked;
  limited ||= policy.limited;

  let effectiveRateLimitRps = limits.rateLimitRps;
  let effectiveMaxConcurrency = limits.maxConcurrency;
  if (limited) {
    effectiveRateLimitRps = Math.min(effectiveRateLimitRps, 3);
    effectiveMaxConcurrency = Math.min(effectiveMaxConcurrency, 2);
  }
  reasons.push("rate_limit_resolved", "max_concurrency_resolved");

  const decision: ScopeGuardDecision = hardBlocked ? "blocked" : limited ? "limited" : "allowed";
  const requiredHeaders = (program?.headers ?? []).map((header) => ({
    name: header.name,
    value: header.value,
    isRequired: header.isRequired,
  }));
  const result: ScopeGuardPreflightResult = {
    decision,
    allowed: decision !== "blocked",
    programId: input.programId,
    target: input.target,
    normalizedTarget,
    jobType: input.jobType,
    stage,
    matchedInScope: scope.matchedInScope,
    matchedInScopeScopeId: scope.matchedInScopeScopeId,
    matchedOutOfScope: scope.matchedOutOfScope,
    matchedOutOfScopeScopeId: scope.matchedOutOfScopeScopeId,
    scopeReasons: scope.scopeReasons,
    automationAllowed: rules.automationAllowed,
    manualApprovalRequired:
      stage === "manual_approval" || MANUAL_APPROVAL_JOB_TYPES.includes(input.jobType as never),
    effectiveRateLimitRps,
    effectiveMaxConcurrency,
    requiredHeaders,
    effectiveHeaders: requiredHeaders,
    allowedStages: stages.allowed,
    blockedStages: stages.blocked,
    reasons: [...new Set(reasons)],
  };

  if (options.persist !== false) {
    await persistDecision(prisma, result, options.userId, Boolean(program));
  }

  return result;
}

export async function getScopeGuardSummary(
  prisma: PrismaClient,
  programId: string,
): Promise<ScopeGuardSummary | null> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: { rules: true, scopes: true, headers: true },
  });
  if (!program) return null;

  const rules: RulesView = {
    automationAllowed: automationValue(program.rules?.automationAllowed),
    aggressiveAllowed: program.rules?.aggressiveAllowed ?? false,
    rateLimitRps: program.rules?.rateLimitRps ?? null,
    maxConcurrency: program.rules?.maxConcurrency ?? null,
    forbiddenActions: jsonStrings(program.rules?.forbiddenActions),
    dosTestingAllowed: program.rules?.dosTestingAllowed ?? false,
  };
  const limits = await resolveLimits(prisma, rules);
  const stages = stageAccess(
    program.status === "active",
    program.huntingStatus === "ongoing",
    rules,
  );
  const warnings: string[] = [];
  if (program.status !== "active") warnings.push("program_not_active");
  if (program.huntingStatus !== "ongoing") warnings.push("hunting_not_ongoing");
  if (rules.automationAllowed === "unknown") warnings.push("automation_permission_unknown");
  if (rules.automationAllowed === "no") warnings.push("active_automation_disabled");
  if (!program.scopes.some((scope) => scope.isInScope)) warnings.push("no_in_scope_targets");
  if (!rules.rateLimitRps) warnings.push("using_default_rate_limit");
  if (!rules.maxConcurrency) warnings.push("using_default_max_concurrency");
  if (!rules.dosTestingAllowed) warnings.push("dos_testing_disabled");

  return {
    programId,
    programStatus: program.status as ScopeGuardSummary["programStatus"],
    huntingStatus: program.huntingStatus as ScopeGuardSummary["huntingStatus"],
    automationAllowed: rules.automationAllowed,
    aggressiveAllowed: rules.aggressiveAllowed,
    rateLimitRps: limits.rateLimitRps,
    maxConcurrency: limits.maxConcurrency,
    inScopeCount: program.scopes.filter((scope) => scope.isInScope).length,
    outOfScopeCount: program.scopes.filter((scope) => !scope.isInScope).length,
    requiredHeadersCount: program.headers.filter((header) => header.isRequired).length,
    forbiddenActions: rules.forbiddenActions,
    defaultAllowedStages: stages.allowed,
    defaultBlockedStages: stages.blocked,
    warnings,
  };
}
