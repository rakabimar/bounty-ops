import { Prisma, prisma } from "@bountyops/db";
import { normalizeFullUrl, normalizeUrl, parseNormalizedUrl } from "@bountyops/shared";
import type { KatanaEndpointResult, NucleiFindingResult, ToolName, UrlArchiveResult } from "@bountyops/shared";
import { aggregateAssetScore, scoreEndpoint, scoreUrl } from "./scoring.service.js";

const strings = (value: Prisma.JsonValue | null): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function relations(programId: string, rawUrl: string) {
  const parsed = parseNormalizedUrl(rawUrl);
  const asset = await prisma.asset.findFirst({ where: { programId, normalizedValue: parsed.host, type: { in: ["root_domain", "subdomain", "host"] } }, orderBy: [{ status: "desc" }, { lastSeenAt: "desc" }] });
  const httpService = await prisma.httpService.findFirst({ where: { programId, host: parsed.host, scheme: parsed.scheme ?? undefined, port: parsed.port ?? undefined }, orderBy: { lastSeenAt: "desc" } });
  return { parsed, asset, httpService };
}

export async function upsertReconUrl(programId: string, candidate: Omit<UrlArchiveResult, "sourceTool"> & { sourceTool: ToolName; title?: string; statusCode?: number; contentType?: string; contentLength?: number; technologies?: string[] }) {
  const linked = await relations(programId, candidate.url); const normalizedUrl = normalizeUrl(candidate.normalizedUrl || candidate.url);
  const existing = await prisma.url.findUnique({ where: { programId_normalizedUrl: { programId, normalizedUrl } } });
  const sourceTools = [...new Set([...(existing ? strings(existing.sourceTools) : []), candidate.sourceTool])];
  const item = await prisma.url.upsert({
    where: { programId_normalizedUrl: { programId, normalizedUrl } },
    create: { programId, assetId: linked.asset?.id, httpServiceId: linked.httpService?.id, url: candidate.url, normalizedUrl, scheme: candidate.scheme, host: candidate.host, port: candidate.port, path: candidate.path, queryParamKeys: candidate.queryParamKeys, title: candidate.title, statusCode: candidate.statusCode, contentType: candidate.contentType, contentLength: candidate.contentLength, technologies: candidate.technologies, sourceTools, scopeStatus: "in_scope", status: "new" },
    update: { assetId: existing?.assetId ?? linked.asset?.id, httpServiceId: existing?.httpServiceId ?? linked.httpService?.id, url: candidate.url, scheme: candidate.scheme, host: candidate.host, port: candidate.port, path: candidate.path, queryParamKeys: candidate.queryParamKeys, title: candidate.title ?? existing?.title, statusCode: candidate.statusCode ?? existing?.statusCode, contentType: candidate.contentType ?? existing?.contentType, contentLength: candidate.contentLength ?? existing?.contentLength, technologies: candidate.technologies, sourceTools, scopeStatus: "in_scope", lastSeenAt: new Date() },
  });
  await scoreUrl(item.id, !existing);
  if (!existing) await prisma.entityChange.create({ data: { programId, entityType: "url", entityId: item.id, type: "url_created", summary: `Discovered URL ${item.normalizedUrl}`, newValue: item.normalizedUrl, source: candidate.sourceTool, importance: item.finalScore >= 8 ? "medium" : "low" } });
  return { item, created: !existing, updated: Boolean(existing) };
}

export async function upsertReconEndpoint(programId: string, candidate: KatanaEndpointResult) {
  const linked = await relations(programId, candidate.fullUrl); const normalizedFullUrl = normalizeFullUrl(candidate.normalizedFullUrl || candidate.fullUrl);
  const url = await prisma.url.findUnique({ where: { programId_normalizedUrl: { programId, normalizedUrl: normalizeUrl(candidate.fullUrl) } } });
  const key = { programId, method: candidate.method, normalizedFullUrl };
  const existing = await prisma.apiEndpoint.findUnique({ where: { programId_method_normalizedFullUrl: key } });
  const item = await prisma.apiEndpoint.upsert({ where: { programId_method_normalizedFullUrl: key }, create: { ...key, assetId: linked.asset?.id, urlId: url?.id, path: candidate.path, fullUrl: candidate.fullUrl, statusCode: candidate.statusCode, contentType: candidate.contentType, source: "katana" }, update: { assetId: existing?.assetId ?? linked.asset?.id, urlId: existing?.urlId ?? url?.id, path: candidate.path, fullUrl: candidate.fullUrl, statusCode: candidate.statusCode ?? existing?.statusCode, contentType: candidate.contentType ?? existing?.contentType, lastSeenAt: new Date() } });
  let parametersCreated = 0;
  for (const parameter of candidate.parameters) {
    const compound = { endpointId: item.id, name: parameter.name, location: parameter.location };
    const prior = await prisma.endpointParameter.findUnique({ where: { endpointId_name_location: compound } });
    await prisma.endpointParameter.upsert({ where: { endpointId_name_location: compound }, create: { ...compound, source: parameter.source }, update: { source: parameter.source } });
    if (!prior) parametersCreated++;
  }
  await scoreEndpoint(item.id, !existing);
  if (!existing) await prisma.entityChange.create({ data: { programId, entityType: "endpoint", entityId: item.id, type: "endpoint_created", summary: `Discovered endpoint ${item.method} ${item.path}`, newValue: item.normalizedFullUrl, source: "katana", importance: item.finalScore >= 8 ? "medium" : "low" } });
  return { item, created: !existing, updated: Boolean(existing), parametersCreated };
}

export async function upsertNucleiFinding(programId: string, finding: NucleiFindingResult) {
  const target = finding.matchedUrl.includes("://") ? finding.matchedUrl : `https://${finding.matchedUrl}`; const linked = await relations(programId, target); const normalized = normalizeUrl(target);
  const url = await prisma.url.findUnique({ where: { programId_normalizedUrl: { programId, normalizedUrl: normalized } } });
  const endpoint = await prisma.apiEndpoint.findFirst({ where: { programId, normalizedFullUrl: normalized }, orderBy: { lastSeenAt: "desc" } });
  const existing = await prisma.scannerFinding.findFirst({ where: { programId, tool: "nuclei", templateId: finding.templateId ?? null, matchedUrl: finding.matchedUrl, name: finding.name } });
  const item = existing ? await prisma.scannerFinding.update({ where: { id: existing.id }, data: { assetId: existing.assetId ?? linked.asset?.id, urlId: existing.urlId ?? url?.id, endpointId: existing.endpointId ?? endpoint?.id, severity: finding.severity, description: finding.description, matcher: finding.matcher, evidenceSnippet: finding.evidenceSnippet, extractedResults: json(finding.extractedResults), lastSeenAt: new Date() } }) : await prisma.scannerFinding.create({ data: { programId, assetId: linked.asset?.id, urlId: url?.id, endpointId: endpoint?.id, tool: "nuclei", severity: finding.severity, templateId: finding.templateId, name: finding.name, description: finding.description, matcher: finding.matcher, matchedUrl: finding.matchedUrl, evidenceSnippet: finding.evidenceSnippet, extractedResults: json(finding.extractedResults), status: "new" } });
  if (!existing) await prisma.entityChange.create({ data: { programId, entityType: "scanner_finding", entityId: item.id, type: "scanner_finding_created", summary: `Scanner Finding created: ${item.name}`, newValue: item.matchedUrl, source: "nuclei", importance: ["high", "critical"].includes(item.severity) ? "high" : "medium" } });
  if (item.assetId) await aggregateAssetScore(item.assetId);
  return { item, created: !existing, updated: Boolean(existing) };
}
