import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Prisma, prisma } from "@bountyops/db";
import { evaluateScoring } from "@bountyops/shared";
import type { ScoringConfigDto, ScoringPreviewRequest, ScoringPreviewResponse } from "@bountyops/shared";
import { parse } from "yaml";

const configPath = fileURLToPath(new URL("../../../../configs/scoring-rules.yaml", import.meta.url));
let cached: { modifiedMs: number; config: ScoringConfigDto } | null = null;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const strings = (value: Prisma.JsonValue | null): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const sameStrings = (left: string[], right: string[]) => [...left].sort().join("\0") === [...right].sort().join("\0");

async function scoringConfig(): Promise<ScoringConfigDto> {
  const metadata = await stat(configPath);
  if (cached?.modifiedMs === metadata.mtimeMs) return cached.config;
  const config = parse(await readFile(configPath, "utf8")) as ScoringConfigDto;
  if (!config?.rules?.length || !config.priorityThresholds) throw new Error("Scoring rules config is invalid");
  cached = { modifiedMs: metadata.mtimeMs, config };
  return config;
}

async function replaceEntityScoring(programId: string, entityType: "asset" | "http_service", entityId: string, result: ScoringPreviewResponse) {
  await prisma.$transaction(async (tx) => {
    await tx.scoreEvent.deleteMany({ where: { entityType, entityId, source: "scoring_engine" } });
    await tx.entityClassification.deleteMany({ where: { entityType, entityId, source: "scoring_engine" } });
    if (result.scoreEvents.length) {
      await tx.scoreEvent.createMany({ data: result.scoreEvents.map((item) => ({
        programId, entityType, entityId, ruleId: item.ruleId, ruleName: item.ruleName,
        reasonTag: item.reasonTag, scoreDelta: item.scoreDelta, matched: item.matched,
        evidence: item.evidence ? json(item.evidence) : Prisma.JsonNull, source: "scoring_engine",
      })) });
    }
    if (result.categories.length) {
      await tx.entityClassification.createMany({ data: result.categories.map((category) => ({
        programId, entityType, entityId, category, confidence: result.confidence,
        source: "scoring_engine", evidence: json({ reasonTags: result.reasonTags }),
      })) });
    }
  });
}

async function aggregateAsset(assetId: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, include: { httpServices: { select: { id: true } } } });
  if (!asset) return;
  const serviceIds = asset.httpServices.map((service) => service.id);
  const entityIds = [asset.id, ...serviceIds];
  const [events, classifications] = await Promise.all([
    prisma.scoreEvent.findMany({ where: { entityId: { in: entityIds }, entityType: { in: ["asset", "http_service"] }, source: "scoring_engine", matched: true } }),
    prisma.entityClassification.findMany({ where: { entityId: { in: entityIds }, entityType: { in: ["asset", "http_service"] }, source: "scoring_engine" } }),
  ]);
  const scores = new Map<string, number>();
  for (const item of events) scores.set(item.entityId, (scores.get(item.entityId) ?? 0) + item.scoreDelta);
  const ownScore = Math.max(0, scores.get(asset.id) ?? 0);
  const serviceScore = Math.max(0, ...serviceIds.map((id) => Math.max(0, scores.get(id) ?? 0)));
  const autoScore = Math.max(ownScore, serviceScore);
  const categories = [...new Set(classifications.map((item) => item.category))];
  const reasonTags = [...new Set(events.map((item) => item.reasonTag))];
  const confidence = classifications.length ? Math.max(...classifications.map((item) => item.confidence)) : events.length ? 50 : 25;
  const changed = asset.autoScore !== autoScore || asset.confidence !== confidence || !sameStrings(strings(asset.categories), categories) || !sameStrings(strings(asset.reasonTags), reasonTags);
  if (!changed) return;
  const finalScore = asset.manualScore ?? autoScore;
  await prisma.$transaction([
    prisma.asset.update({ where: { id: asset.id }, data: { autoScore, finalScore, confidence, categories, reasonTags, lastChangedAt: new Date() } }),
    prisma.entityChange.create({ data: {
      programId: asset.programId, entityType: "asset", entityId: asset.id, type: "score_changed",
      summary: "Scoring engine refreshed asset priority", oldValue: String(asset.finalScore), newValue: String(finalScore),
      source: "scoring_engine", importance: finalScore >= 8 ? "medium" : "low",
    } }),
  ]);
}

export async function scoreAsset(assetId: string, isNew: boolean): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return;
  const previouslyNew = await prisma.scoreEvent.findFirst({ where: { entityType: "asset", entityId: assetId, reasonTag: "new_asset", source: "scoring_engine" }, select: { id: true } });
  const input: ScoringPreviewRequest = { entityType: "asset", host: asset.normalizedValue, url: asset.normalizedValue, isNew: isNew || Boolean(previouslyNew) };
  const result = evaluateScoring(await scoringConfig(), input);
  await replaceEntityScoring(asset.programId, "asset", asset.id, result);
  await aggregateAsset(asset.id);
}

export async function scoreHttpService(serviceId: string, options: { isNewAsset: boolean; duplicateFingerprint: boolean }): Promise<void> {
  const service = await prisma.httpService.findUnique({ where: { id: serviceId }, include: { asset: true } });
  if (!service) return;
  const result = evaluateScoring(await scoringConfig(), {
    entityType: "http_service", host: service.host, url: service.normalizedUrl,
    title: service.title ?? undefined, statusCode: service.statusCode ?? undefined, port: service.port ?? undefined,
    technologies: strings(service.technologies), contentType: service.contentType ?? undefined,
    isNew: false, duplicateFingerprint: options.duplicateFingerprint,
  });
  await replaceEntityScoring(service.programId, "http_service", service.id, result);
  if (service.assetId) await aggregateAsset(service.assetId);
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export function fingerprintHttpMetadata(input: { statusCode?: number; title?: string; webserver?: string; technologies?: string[]; contentLength?: number }) {
  const title = (input.title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const technologies = [...(input.technologies ?? [])].map((item) => item.trim().toLowerCase()).sort();
  const contentLengthBucket = input.contentLength === undefined ? null : Math.floor(input.contentLength / 1024) * 1024;
  const stable = JSON.stringify([input.statusCode ?? null, title, (input.webserver ?? "").trim().toLowerCase(), technologies, contentLengthBucket]);
  return { titleHash: title ? sha256(title) : null, fingerprintHash: sha256(stable) };
}
