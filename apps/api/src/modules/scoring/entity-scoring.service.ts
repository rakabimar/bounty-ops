import { Prisma, type PrismaClient } from "@bountyops/db";
import { evaluateScoring, priorityFromScore } from "@bountyops/shared";
import type { EntityType, ScoringPreviewRequest, ScoringPreviewResponse } from "@bountyops/shared";
import { loadScoringConfig } from "./scoring-config.service.js";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const strings = (value: Prisma.JsonValue | null): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

async function replaceScoring(prisma: PrismaClient, programId: string, entityType: EntityType, entityId: string, result: ScoringPreviewResponse) {
  await prisma.$transaction(async (tx) => {
    await tx.scoreEvent.deleteMany({ where: { entityType, entityId, source: "scoring_engine" } });
    await tx.entityClassification.deleteMany({ where: { entityType, entityId, source: "scoring_engine" } });
    if (result.scoreEvents.length) await tx.scoreEvent.createMany({ data: result.scoreEvents.map((event) => ({ programId, entityType, entityId, ruleId: event.ruleId, ruleName: event.ruleName, reasonTag: event.reasonTag, scoreDelta: event.scoreDelta, matched: true, evidence: event.evidence ? json(event.evidence) : Prisma.JsonNull, source: "scoring_engine" })) });
    if (result.categories.length) await tx.entityClassification.createMany({ data: result.categories.map((category) => ({ programId, entityType, entityId, category, confidence: result.confidence, source: "scoring_engine", evidence: json({ reasonTags: result.reasonTags }) })) });
  });
}

export async function aggregateAssetScore(prisma: PrismaClient, assetId: string): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, include: { httpServices: { select: { id: true } }, urls: { select: { id: true } }, endpoints: { select: { id: true } } } });
  if (!asset) return;
  const ids = [asset.id, ...asset.httpServices.map((item) => item.id), ...asset.urls.map((item) => item.id), ...asset.endpoints.map((item) => item.id)];
  const [events, classifications] = await Promise.all([
    prisma.scoreEvent.findMany({ where: { entityId: { in: ids }, entityType: { in: ["asset", "http_service", "url", "endpoint"] }, source: "scoring_engine", matched: true } }),
    prisma.entityClassification.findMany({ where: { entityId: { in: ids }, entityType: { in: ["asset", "http_service", "url", "endpoint"] }, source: "scoring_engine" } }),
  ]);
  const totals = new Map<string, number>();
  for (const event of events) totals.set(event.entityId, (totals.get(event.entityId) ?? 0) + event.scoreDelta);
  const autoScore = Math.max(0, ...ids.map((id) => Math.max(0, totals.get(id) ?? 0)));
  const categories = [...new Set(classifications.map((item) => item.category))];
  const reasonTags = [...new Set(events.map((item) => item.reasonTag))];
  const confidence = classifications.length ? Math.max(...classifications.map((item) => item.confidence)) : events.length ? 50 : 25;
  const finalScore = asset.manualScore ?? autoScore;
  if (asset.autoScore === autoScore && asset.confidence === confidence && JSON.stringify(strings(asset.categories).sort()) === JSON.stringify(categories.sort()) && JSON.stringify(strings(asset.reasonTags).sort()) === JSON.stringify(reasonTags.sort())) return;
  await prisma.asset.update({ where: { id: assetId }, data: { autoScore, finalScore, confidence, categories, reasonTags, lastChangedAt: new Date() } });
  await prisma.entityChange.create({ data: { programId: asset.programId, entityType: "asset", entityId: assetId, type: "score_changed", summary: "Related detail scoring changed asset priority", oldValue: String(asset.finalScore), newValue: String(finalScore), source: "scoring_engine", importance: finalScore >= 8 ? "medium" : "low" } });
}

export async function scoreDetailEntity(prisma: PrismaClient, input: { entityType: "url" | "endpoint"; entityId: string; programId: string; assetId: string | null; manualScore: number | null; scoringInput: ScoringPreviewRequest }) {
  const result = evaluateScoring(await loadScoringConfig(), input.scoringInput);
  await replaceScoring(prisma, input.programId, input.entityType, input.entityId, result);
  const finalScore = input.manualScore ?? result.autoScore;
  if (input.entityType === "url") await prisma.url.update({ where: { id: input.entityId }, data: { autoScore: result.autoScore, finalScore, confidence: result.confidence, categories: result.categories, reasonTags: result.reasonTags } });
  else await prisma.apiEndpoint.update({ where: { id: input.entityId }, data: { autoScore: result.autoScore, finalScore, confidence: result.confidence, categories: result.categories, reasonTags: result.reasonTags } });
  if (input.assetId) await aggregateAssetScore(prisma, input.assetId);
  return { ...result, finalScore };
}

export async function getEntityScoreExplanation(prisma: PrismaClient, entityType: "url" | "endpoint", entity: { id: string; autoScore: number; manualScore: number | null; finalScore: number; confidence: number; categories: Prisma.JsonValue | null; reasonTags: Prisma.JsonValue | null; updatedAt: Date }) {
  const [events, classifications] = await Promise.all([
    prisma.scoreEvent.findMany({ where: { entityType, entityId: entity.id }, orderBy: { createdAt: "asc" } }),
    prisma.entityClassification.findMany({ where: { entityType, entityId: entity.id } }),
  ]);
  const categories = [...new Set([...strings(entity.categories), ...classifications.map((item) => item.category)])];
  const reasonTags = [...new Set([...strings(entity.reasonTags), ...events.map((item) => item.reasonTag)])];
  return { entityType, entityId: entity.id, autoScore: entity.autoScore, manualScore: entity.manualScore, finalScore: entity.finalScore, priority: priorityFromScore(entity.finalScore), confidence: entity.confidence, categories, reasonTags, events: events.length ? events : reasonTags.map((reasonTag) => ({ ruleId: null, ruleName: null, reasonTag, scoreDelta: 0, matched: true, evidence: null, source: "legacy_entity", createdAt: entity.updatedAt })) };
}
