import { Prisma, type PrismaClient } from "@bountyops/db";
import { programIntakeStructuredResultSchema, type ProgramIntakePreviewRequest, type ProgramIntakeStructuredResult, type ProgramIntakeSyncDiff } from "@bountyops/shared";
import { createAiProvider, aiUsageThisMonth, resolveAiConfig, type AiProvider } from "../ai/deepseek.service.js";
import { createAuditLog } from "../audit/audit.service.js";
import { normalizeAsset } from "../../utils/normalize.js";
import { intakeAdapters } from "./adapters/platform.adapters.js";
import { buildAiPolicyInput, pastedTextDocument, platformFromUrl } from "./source-document.service.js";
import { mergeIntakeResults } from "./intake-merge.service.js";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export async function createProgramIntakePreview(prisma: PrismaClient, input: ProgramIntakePreviewRequest, userId: string, options: { programId?: string; aiProvider?: AiProvider } = {}) {
  const platform = input.sourceType === "platform_url" ? platformFromUrl(input.url) : input.platform;
  const run = await prisma.programIntakeRun.create({ data: { programId: options.programId, platform, sourceType: input.sourceType, sourceUrl: input.sourceType === "platform_url" ? input.url : null, status: "parsing", createdByUserId: userId } });
  try {
    const adapter = intakeAdapters.find((candidate) => candidate.canHandle(input));
    if (!adapter?.fetchSource) throw new Error("No deterministic adapter supports this input");
    const source = await adapter.fetchSource(input); const deterministic = await adapter.parse(source);
    const config = await resolveAiConfig(prisma); let aiData: ProgramIntakeStructuredResult | null = null; let aiUsed = false; let model: string | null = null;
    const warnings = [...deterministic.warnings];
    const needsAi = deterministic.confidence < config.fallbackThreshold || deterministic.ambiguous;
    if (needsAi && config.enabled) {
      const used = await aiUsageThisMonth(prisma);
      if (used >= config.monthlyLimit) warnings.push("AI fallback skipped: monthly limit reached");
      else if (!config.apiKey && !options.aiProvider) warnings.push("AI fallback skipped: DeepSeek API key is missing");
      else {
        try {
          const provider = options.aiProvider ?? createAiProvider(config);
          const result = await provider.extractProgramPolicy({ policyText: buildAiPolicyInput(source.rawText), deterministic: deterministic.structuredData, platform });
          aiData = result.data; aiUsed = true; model = result.model;
          await prisma.aiUsageLog.create({ data: { provider: "deepseek", model: result.model, purpose: "program_intake", inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens, totalTokens: result.usage?.totalTokens, cachedInputTokens: result.usage?.cachedInputTokens, requestId: result.requestId, success: true } });
          await createAuditLog(prisma, { userId, programId: options.programId, action: "program_intake.ai_fallback.used", entityType: "program_intake_run", entityId: run.id, metadata: json({ intakeRunId: run.id, platform, model: result.model, parserConfidence: deterministic.confidence }) });
        } catch (error) {
          const category = error instanceof Error && "category" in error ? String((error as { category: unknown }).category) : "provider_error";
          await prisma.aiUsageLog.create({ data: { provider: "deepseek", model: config.model, purpose: "program_intake", success: false, errorCategory: category } });
          warnings.push(`AI fallback failed (${category}); deterministic proposal retained`);
          await createAuditLog(prisma, { userId, programId: options.programId, action: "program_intake.ai_fallback.failed", entityType: "program_intake_run", entityId: run.id, metadata: json({ intakeRunId: run.id, platform, model: config.model, errorCategory: category }) });
        }
      }
    }
    const structured = aiData ? mergeIntakeResults({ ...deterministic.structuredData, warnings }, aiData, source.rawText) : { ...deterministic.structuredData, warnings: [...new Set(warnings)] };
    const validated = programIntakeStructuredResultSchema.parse({ ...structured, rules: { ...structured.rules, dosTestingAllowed: false } });
    const proposal = await prisma.programIntakeProposal.create({ data: { intakeRunId: run.id, structuredData: json(validated), deterministicData: json({ ...deterministic.structuredData, _sourceText: source.rawText }), aiData: aiData ? json(aiData) : undefined, confidence: validated.overallConfidence, warnings: json(validated.warnings) } });
    const completed = await prisma.programIntakeRun.update({ where: { id: run.id }, data: { status: "needs_review", parserConfidence: deterministic.confidence, aiUsed, aiProvider: aiUsed ? "deepseek" : null, aiModel: model, sourceContentHash: source.contentHash, completedAt: new Date() } });
    await createAuditLog(prisma, { userId, programId: options.programId, action: "program_intake.preview.created", entityType: "program_intake_run", entityId: run.id, metadata: json({ intakeRunId: run.id, platform, sourceType: source.sourceType, parserConfidence: deterministic.confidence, aiUsed, model, scopes: validated.scopes.length, warnings: validated.warnings.length }) });
    return { run: completed, proposal: { ...proposal, structuredData: validated, deterministicData: deterministic.structuredData, aiData, warnings: validated.warnings } };
  } catch (error) {
    await prisma.programIntakeRun.update({ where: { id: run.id }, data: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Program intake failed", completedAt: new Date() } });
    throw error;
  }
}

export async function approveNewIntake(prisma: PrismaClient, runId: string, userId: string, edited?: unknown) {
  const run = await prisma.programIntakeRun.findUnique({ where: { id: runId }, include: { proposal: true } });
  if (!run?.proposal || run.programId || run.status !== "needs_review") return null;
  const structured = programIntakeStructuredResultSchema.parse(edited ?? run.proposal.structuredData);
  const storedDeterministic = run.proposal.deterministicData && typeof run.proposal.deterministicData === "object" && !Array.isArray(run.proposal.deterministicData) ? run.proposal.deterministicData as Record<string, unknown> : {};
  const rawPolicyText = typeof storedDeterministic._sourceText === "string" ? storedDeterministic._sourceText : null;
  const program = await prisma.$transaction(async (tx) => {
    const created = await tx.program.create({ data: { platform: structured.platform, name: structured.programName || structured.handle || "Imported program", handle: structured.handle, programUrl: structured.programUrl, status: "active", huntingStatus: "not_hunting", intakeSource: run.sourceType, rawPolicyText, policyHash: run.sourceContentHash, rules: { create: { ...structured.rules, dosTestingAllowed: false, forbiddenActions: json(structured.rules.forbiddenActions) } }, scopes: { create: structured.scopes.map((scope) => ({ asset: scope.asset, normalizedAsset: normalizeAsset(scope.asset), assetType: scope.assetType, isInScope: scope.isInScope, bountyEligible: scope.bountyEligible ?? true, notes: scope.notes })) }, headers: { create: structured.requiredHeaders.filter((header) => header.value !== null).map((header) => ({ name: header.name, value: header.value!, isRequired: header.isRequired })) } }, include: { scopes: true, rules: true, headers: true, reconSchedules: true } });
    await tx.programIntakeRun.update({ where: { id: runId }, data: { programId: created.id, status: "approved" } });
    await tx.programIntakeProposal.update({ where: { intakeRunId: runId }, data: { structuredData: json(structured), warnings: json(structured.warnings) } });
    return created;
  });
  await createAuditLog(prisma, { userId, programId: program.id, action: "program_intake.approved", entityType: "program_intake_run", entityId: runId, metadata: json({ intakeRunId: runId, platform: structured.platform, scopes: structured.scopes.length, warnings: structured.warnings.length }) });
  return program;
}

export function calculateIntakeSyncDiff(current: { scopes: Array<{ id: string; asset: string; assetType: string; isInScope: boolean; bountyEligible: boolean; notes: string | null }>; rules: Record<string, unknown> | null; headers: Array<{ id: string; name: string; value: string; isRequired: boolean }> }, proposed: ProgramIntakeStructuredResult): ProgramIntakeSyncDiff {
  const currentScopes = new Map(current.scopes.map((scope) => [normalizeAsset(scope.asset), scope])); const nextScopes = new Map(proposed.scopes.map((scope) => [normalizeAsset(scope.asset), scope]));
  const scopeAdded = proposed.scopes.filter((scope) => !currentScopes.has(normalizeAsset(scope.asset)));
  const scopeRemoved = current.scopes.filter((scope) => !nextScopes.has(normalizeAsset(scope.asset))).map(({ id, asset, assetType, isInScope }) => ({ id, asset, assetType, isInScope }));
  const scopeChanged = proposed.scopes.flatMap((scope) => { const before = currentScopes.get(normalizeAsset(scope.asset)); return before && (before.assetType !== scope.assetType || before.isInScope !== scope.isInScope || before.bountyEligible !== (scope.bountyEligible ?? true) || before.notes !== scope.notes) ? [{ asset: scope.asset, before, after: scope }] : []; });
  const rulesChanged: ProgramIntakeSyncDiff["rulesChanged"] = []; const nextRules = proposed.rules as unknown as Record<string, unknown>;
  const permissionRank: Record<string, number> = { no: 0, unknown: 1, limited: 2, yes: 3 };
  for (const field of ["automationAllowed", "aggressiveAllowed", "rateLimitRps", "maxConcurrency", "authTestingAllowed", "dosTestingAllowed", "notes"]) if (current.rules?.[field] !== nextRules[field]) rulesChanged.push({ field, before: current.rules?.[field] ?? null, after: nextRules[field], dangerous: field === "aggressiveAllowed" && nextRules[field] === true || field === "dosTestingAllowed" && nextRules[field] === true || field === "automationAllowed" && (permissionRank[String(nextRules[field])] ?? 0) > (permissionRank[String(current.rules?.[field])] ?? 0) });
  const currentHeaders = new Map(current.headers.map((header) => [header.name.toLowerCase(), header])); const nextHeaders = new Map(proposed.requiredHeaders.map((header) => [header.name.toLowerCase(), header]));
  const headersAdded = proposed.requiredHeaders.filter((header) => !currentHeaders.has(header.name.toLowerCase()));
  const headersRemoved = current.headers.filter((header) => !nextHeaders.has(header.name.toLowerCase())).map(({ id, name, isRequired }) => ({ id, name, isRequired }));
  const warnings = [...proposed.warnings]; if (scopeRemoved.some((scope) => scope.isInScope)) warnings.push("Removal of in-scope assets requires explicit confirmation"); if (scopeAdded.some((scope) => scope.assetType === "wildcard_domain")) warnings.push("New wildcard scope requires explicit confirmation"); if (rulesChanged.some((change) => change.dangerous)) warnings.push("More permissive Rules of Engagement changes require explicit confirmation"); if (headersRemoved.some((header) => header.isRequired)) warnings.push("Required header deletion requires explicit confirmation");
  return { scopeAdded, scopeRemoved, scopeChanged, rulesChanged, headersAdded, headersRemoved, warnings: [...new Set(warnings)] };
}

export async function applyIntakeSync(prisma: PrismaClient, input: { programId: string; runId: string; userId: string; structuredData?: unknown; confirmations: { scopeRemovals?: boolean; wildcardAdditions?: boolean; permissionWidening?: boolean; aggressiveEnablement?: boolean; headerRemovals?: boolean } }) {
  const [run, program] = await Promise.all([prisma.programIntakeRun.findUnique({ where: { id: input.runId }, include: { proposal: true } }), prisma.program.findUnique({ where: { id: input.programId }, include: { scopes: true, rules: true, headers: true } })]);
  if (!run?.proposal || run.programId !== input.programId || run.status !== "needs_review" || !program) return null;
  const structured = programIntakeStructuredResultSchema.parse(input.structuredData ?? run.proposal.structuredData); const diff = calculateIntakeSyncDiff(program, structured);
  const storedDeterministic = run.proposal.deterministicData && typeof run.proposal.deterministicData === "object" && !Array.isArray(run.proposal.deterministicData) ? run.proposal.deterministicData as Record<string, unknown> : {};
  const rawPolicyText = typeof storedDeterministic._sourceText === "string" ? storedDeterministic._sourceText : undefined;
  if (diff.scopeRemoved.some((scope) => scope.isInScope) && !input.confirmations.scopeRemovals) throw new Error("In-scope removal requires explicit confirmation");
  if (diff.scopeAdded.some((scope) => scope.assetType === "wildcard_domain") && !input.confirmations.wildcardAdditions) throw new Error("Wildcard scope addition requires explicit confirmation");
  if (diff.rulesChanged.some((change) => change.field === "automationAllowed" && change.dangerous) && !input.confirmations.permissionWidening) throw new Error("Automation permission widening requires explicit confirmation");
  if (structured.rules.aggressiveAllowed && !program.rules?.aggressiveAllowed && !input.confirmations.aggressiveEnablement) throw new Error("Aggressive scanning enablement requires explicit confirmation");
  if (diff.headersRemoved.some((header) => header.isRequired) && !input.confirmations.headerRemovals) throw new Error("Required header deletion requires explicit confirmation");
  if (structured.rules.dosTestingAllowed) throw new Error("DoS testing cannot be enabled through policy intake");
  await prisma.$transaction(async (tx) => {
    await tx.program.update({ where: { id: input.programId }, data: { platform: structured.platform, name: structured.programName ?? program.name, handle: structured.handle, programUrl: structured.programUrl, intakeSource: run.sourceType, rawPolicyText, policyHash: run.sourceContentHash, lastSyncedAt: new Date() } });
    await tx.programScope.deleteMany({ where: { programId: input.programId } });
    await tx.programScope.createMany({ data: structured.scopes.map((scope) => ({ programId: input.programId, asset: scope.asset, normalizedAsset: normalizeAsset(scope.asset), assetType: scope.assetType, isInScope: scope.isInScope, bountyEligible: scope.bountyEligible ?? true, notes: scope.notes })) });
    await tx.programRules.upsert({ where: { programId: input.programId }, update: { ...structured.rules, dosTestingAllowed: false, forbiddenActions: json(structured.rules.forbiddenActions) }, create: { programId: input.programId, ...structured.rules, dosTestingAllowed: false, forbiddenActions: json(structured.rules.forbiddenActions) } });
    await tx.programHeader.deleteMany({ where: { programId: input.programId } });
    await tx.programHeader.createMany({ data: structured.requiredHeaders.filter((header) => header.value !== null).map((header) => ({ programId: input.programId, name: header.name, value: header.value!, isRequired: header.isRequired })) });
    await tx.programIntakeRun.update({ where: { id: input.runId }, data: { status: "approved" } });
    await tx.notificationEvent.create({ data: { programId: input.programId, eventType: "scope_changed", entityType: "program", entityId: input.programId, importance: "high", title: "Program policy synchronized", message: "Program scope or Rules of Engagement changed after explicit intake approval.", metadata: json({ intakeRunId: input.runId, scopeAdded: diff.scopeAdded.length, scopeRemoved: diff.scopeRemoved.length, rulesChanged: diff.rulesChanged.length }) } });
  });
  await createAuditLog(prisma, { userId: input.userId, programId: input.programId, action: "program_intake.sync.applied", entityType: "program_intake_run", entityId: input.runId, metadata: json({ intakeRunId: input.runId, scopeAdded: diff.scopeAdded.length, scopeRemoved: diff.scopeRemoved.length, rulesChanged: diff.rulesChanged.length, warningCount: diff.warnings.length }) });
  return { programId: input.programId, intakeRunId: input.runId, diff };
}

export { pastedTextDocument, strings };
