import { Prisma, prisma } from "@bountyops/db";
import { NUCLEI_SAFE_ALLOWED_SEVERITIES, NUCLEI_SAFE_ALLOWED_TAGS, NUCLEI_SAFE_BLOCKED_TAGS, parseNormalizedUrl } from "@bountyops/shared";
import type { JobLogEntry, ReconQueueJobData, ToolName, UrlArchiveResult } from "@bountyops/shared";
import { compressArtifacts, createArtifactPaths } from "./artifact.service.js";
import { loadWorkerPolicy, type WorkerPolicy } from "./worker-scope-guard.service.js";
import { runCommand, ToolMissingError } from "../tools/command-runner.js";
import { normalizeDomainInput, normalizeHostname, normalizeUrl } from "../tools/normalization.js";
import { parseDnsx } from "../tools/parsers/dnsx.parser.js";
import { parseHttpx } from "../tools/parsers/httpx.parser.js";
import { parseSubfinder } from "../tools/parsers/subfinder.parser.js";
import { parseGau } from "../tools/parsers/gau.parser.js";
import { parseWaybackurls } from "../tools/parsers/waybackurls.parser.js";
import { parseKatana } from "../tools/parsers/katana.parser.js";
import { parseNuclei } from "../tools/parsers/nuclei.parser.js";
import { TOOL_REGISTRY } from "../tools/tool-registry.js";
import { fingerprintHttpMetadata, scoreAsset, scoreHttpService } from "./scoring.service.js";
import { upsertNucleiFinding, upsertReconEndpoint, upsertReconUrl } from "./recon-persistence.service.js";
import { beginSnapshot, completeSnapshot, failSnapshot, type ObservationCandidate } from "./recon-snapshot.service.js";

type Log = (message: string, level?: JobLogEntry["level"], meta?: Record<string, unknown>) => Promise<void>;
type JsonObject = Record<string, unknown>;
type StageResult = Record<string, unknown> & { _observations?: ObservationCandidate[]; _snapshotMetadata?: Record<string, unknown>; _snapshotComparable?: boolean; _snapshotStatus?: "success" | "partial" };

function configObject(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function configStrings(config: unknown, key: string): string[] { const value = configObject(config)[key]; return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : []; }
function configNumber(config: unknown, key: string, fallback: number, minimum: number, maximum: number): number { const value = Number(configObject(config)[key]); return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback; }
function jsonStrings(value: Prisma.JsonValue | null): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function executeTool(options: { programId: string; jobRunId: string; tool: ToolName; args: string[]; storedArgs?: string[]; stdinLines?: string[]; timeoutMs?: number; log: Log }) {
  const definition = TOOL_REGISTRY[options.tool];
  const artifacts = await createArtifactPaths(options.programId, options.jobRunId, options.tool);
  const toolRun = await prisma.toolRun.create({ data: { jobRunId: options.jobRunId, toolName: options.tool, command: definition.binary, args: json(options.storedArgs ?? options.args), status: "running", startedAt: new Date(), stdoutPath: artifacts.stdoutPath, stderrPath: artifacts.stderrPath } });
  await options.log(`Starting ${options.tool}`, "info", { toolRunId: toolRun.id });
  try {
    const result = await runCommand(definition.binary, options.args, { artifacts, stdinLines: options.stdinLines, timeoutMs: options.timeoutMs });
    if (result.exitCode !== 0) throw new Error(`${options.tool} exited with code ${result.exitCode ?? "unknown"}${result.signal ? ` (${result.signal})` : ""}`);
    return { toolRun, result, artifacts };
  } catch (error) {
    const message = error instanceof ToolMissingError ? error.message : error instanceof Error ? error.message : `${options.tool} failed`;
    await prisma.toolRun.update({ where: { id: toolRun.id }, data: { status: "failed", finishedAt: new Date(), durationMs: Date.now() - toolRun.createdAt.getTime(), error: message } });
    throw new Error(message);
  }
}

async function finishTool(toolRunId: string, artifacts: Awaited<ReturnType<typeof createArtifactPaths>>, durationMs: number, parsedCount: number) {
  const compressed = await compressArtifacts(artifacts);
  await prisma.toolRun.update({ where: { id: toolRunId }, data: { status: "success", finishedAt: new Date(), durationMs, parsedCount, stdoutPath: compressed.stdoutPath, stderrPath: compressed.stderrPath } });
}

async function rootTarget(programId: string, target?: string): Promise<string> {
  if (target) return normalizeDomainInput(target);
  const scope = await prisma.programScope.findFirst({ where: { programId, isInScope: true, assetType: { in: ["domain", "subdomain", "wildcard_domain"] } }, orderBy: { createdAt: "asc" } });
  if (!scope) throw new Error("No domain target or compatible in-scope rule is available");
  return normalizeDomainInput(scope.asset.replace(/^\*\./, ""));
}

async function ensureAsset(programId: string, host: string, type: "root_domain" | "subdomain" | "host", status: string, source: ToolName) {
  const normalizedValue = normalizeHostname(host);
  const existing = await prisma.asset.findUnique({ where: { programId_type_normalizedValue: { programId, type, normalizedValue } } });
  const sources = [...new Set([...(existing ? jsonStrings(existing.sourceTools) : []), source])];
  const asset = await prisma.asset.upsert({
    where: { programId_type_normalizedValue: { programId, type, normalizedValue } },
    create: { programId, type, value: host, normalizedValue, scopeStatus: "in_scope", status, confidence: source === "subfinder" ? 70 : 90, sourceTools: sources },
    update: { value: host, scopeStatus: "in_scope", status, lastSeenAt: new Date(), sourceTools: sources },
  });
  if (!existing) await prisma.entityChange.create({ data: { programId, entityType: "asset", entityId: asset.id, type: "asset.discovered", summary: `Discovered ${type} ${host}`, newValue: host, source, importance: "low" } });
  await scoreAsset(asset.id, !existing);
  return { asset, created: !existing };
}

async function runSubfinder(data: ReconQueueJobData, policy: WorkerPolicy, log: Log) {
  const target = await rootTarget(data.programId!, data.target);
  const guard = policy.allows(target, false);
  if (!guard.allowed) throw new Error(`Worker Scope Guard blocked subfinder target: ${guard.reason}`);
  await ensureAsset(data.programId!, target, "root_domain", "new", "subfinder");
  const args = ["-d", target, "-all", "-recursive", "-silent", "-json", "-rl", String(policy.rateLimitRps)];
  const execution = await executeTool({ programId: data.programId!, jobRunId: data.jobRunId, tool: "subfinder", args, timeoutMs: 20 * 60_000, log });
  const parsed = await parseSubfinder(execution.result.stdoutPath);
  let created = 0; let skippedOutOfScope = 0; const hosts: string[] = []; const observations: ObservationCandidate[] = [];
  for (const result of parsed.results) {
    const decision = policy.allows(result.host, false);
    if (!decision.allowed) { skippedOutOfScope++; continue; }
    const saved = await ensureAsset(data.programId!, result.host, "subdomain", "new", "subfinder");
    if (saved.created) created++;
    hosts.push(result.host);
    observations.push({ entityType: "asset", entityId: saved.asset.id, entity: saved.asset as unknown as Record<string, unknown> });
  }
  await finishTool(execution.toolRun.id, execution.artifacts, execution.result.durationMs, hosts.length);
  await log("subfinder completed", "info", { discovered: hosts.length, created, skipped: parsed.skipped, skippedOutOfScope });
  return { hosts: [...new Set(hosts)], discovered: hosts.length, created, skippedOutOfScope, _observations: observations, _snapshotMetadata: { comparisonKey: JSON.stringify({ target }), targetCount: 1, tool: "subfinder", parserCount: parsed.results.length, skippedOutOfScope, effectiveRateLimit: policy.rateLimitRps } };
}

async function dnsTargets(data: ReconQueueJobData): Promise<string[]> {
  const configured = configStrings(data.config, "hosts");
  if (configured.length) return configured;
  if (data.target) return [data.target];
  const assets = await prisma.asset.findMany({ where: { programId: data.programId!, type: { in: ["subdomain", "host"] }, scopeStatus: "in_scope" }, orderBy: { lastSeenAt: "desc" }, take: 2_000 });
  return assets.map((asset) => asset.normalizedValue);
}

async function runDnsx(data: ReconQueueJobData, policy: WorkerPolicy, log: Log, supplied?: string[]) {
  const candidates = supplied ?? await dnsTargets(data);
  const targets = [...new Set(candidates.map(normalizeHostname).filter((host) => policy.allows(host, true).allowed))];
  const skippedOutOfScope = candidates.length - targets.length;
  if (!targets.length) throw new Error("Worker Scope Guard left no in-scope hosts for dnsx");
  const args = ["-silent", "-json", "-a", "-aaaa", "-cname", "-resp", "-rl", String(policy.rateLimitRps)];
  const execution = await executeTool({ programId: data.programId!, jobRunId: data.jobRunId, tool: "dnsx", args, stdinLines: targets, timeoutMs: 15 * 60_000, log });
  const parsed = await parseDnsx(execution.result.stdoutPath);
  let created = 0; const resolvedHosts = new Set<string>(); const observations: ObservationCandidate[] = [];
  for (const result of parsed.results) {
    if (!policy.allows(result.host, true).allowed) continue;
    let asset = await prisma.asset.findFirst({ where: { programId: data.programId!, normalizedValue: result.host, type: { in: ["subdomain", "host"] } } });
    if (!asset) asset = (await ensureAsset(data.programId!, result.host, "host", "resolved", "dnsx")).asset;
    else await prisma.asset.update({ where: { id: asset.id }, data: { status: "resolved", lastSeenAt: new Date(), sourceTools: [...new Set([...jsonStrings(asset.sourceTools), "dnsx"])] } });
    for (const record of result.records) {
      const key = { programId: data.programId!, host: result.host, recordType: record.type, value: record.value };
      const existing = await prisma.dnsRecord.findUnique({ where: { programId_host_recordType_value: key } });
      const saved = await prisma.dnsRecord.upsert({ where: { programId_host_recordType_value: key }, create: { ...key, assetId: asset.id, ttl: record.ttl, resolver: result.resolver }, update: { assetId: asset.id, ttl: record.ttl, resolver: result.resolver, lastSeenAt: new Date() } });
      observations.push({ entityType: "dns_record", entityId: saved.id, entity: saved as unknown as Record<string, unknown> });
      if (!existing) { created++; await prisma.entityChange.create({ data: { programId: data.programId!, entityType: "dns_record", entityId: saved.id, type: "dns_record.discovered", summary: `Discovered ${record.type} record for ${result.host}`, newValue: record.value, source: "dnsx" } }); }
    }
    if (result.records.length) resolvedHosts.add(result.host);
  }
  await finishTool(execution.toolRun.id, execution.artifacts, execution.result.durationMs, parsed.results.reduce((count, item) => count + item.records.length, 0));
  await log("dnsx completed", "info", { dnsRecordsCreated: created, resolvedHosts: resolvedHosts.size, skipped: parsed.skipped, skippedOutOfScope });
  return { hosts: [...resolvedHosts], dnsRecordsCreated: created, skippedOutOfScope, _observations: observations, _snapshotComparable: skippedOutOfScope === 0, _snapshotMetadata: { comparisonKey: JSON.stringify({ targets: [...targets].sort() }), targetCount: targets.length, tool: "dnsx", parserCount: observations.length, skippedOutOfScope, effectiveRateLimit: policy.rateLimitRps } };
}

async function httpTargets(data: ReconQueueJobData): Promise<string[]> {
  const configured = configStrings(data.config, "hosts"); if (configured.length) return configured;
  if (data.target) return [data.target];
  const assets = await prisma.asset.findMany({ where: { programId: data.programId!, status: "resolved", scopeStatus: "in_scope" }, take: 2_000 });
  return assets.map((asset) => asset.normalizedValue);
}

async function runHttpx(data: ReconQueueJobData, policy: WorkerPolicy, log: Log, supplied?: string[]) {
  const candidates = supplied ?? await httpTargets(data);
  const targets = [...new Set(candidates.filter((target) => policy.allows(target, true).allowed))];
  const skippedOutOfScope = candidates.length - targets.length;
  if (!targets.length) throw new Error("Worker Scope Guard left no in-scope targets for httpx");
  const baseArgs = ["-silent", "-json", "-title", "-tech-detect", "-status-code", "-content-length", "-response-time", "-follow-redirects", "-rl", String(policy.rateLimitRps), "-threads", String(policy.maxConcurrency)];
  const args = [...baseArgs]; const storedArgs = [...baseArgs];
  for (const header of policy.requiredHeaders) { args.push("-H", `${header.name}: ${header.value}`); storedArgs.push("-H", `${header.name}: ********`); }
  if (policy.requiredHeaders.length) await log("Injecting required headers into httpx", "info", { headerNames: policy.requiredHeaders.map((header) => header.name) });
  const execution = await executeTool({ programId: data.programId!, jobRunId: data.jobRunId, tool: "httpx", args, storedArgs, stdinLines: targets, timeoutMs: 20 * 60_000, log });
  const parsed = await parseHttpx(execution.result.stdoutPath); let servicesCreated = 0; const observations: ObservationCandidate[] = [];
  for (const result of parsed.results) {
    if (!policy.allows(result.url, true).allowed) continue;
    let asset = await prisma.asset.findFirst({ where: { programId: data.programId!, normalizedValue: result.host, type: { in: ["subdomain", "host"] } } });
    const isNewAsset = !asset;
    if (!asset) asset = (await ensureAsset(data.programId!, result.host, "host", "live", "httpx")).asset;
    const sources = [...new Set([...jsonStrings(asset.sourceTools), "httpx"])] as string[];
    asset = await prisma.asset.update({ where: { id: asset.id }, data: { status: result.failed ? "resolved" : "live", lastSeenAt: new Date(), sourceTools: sources } });
    await scoreAsset(asset.id, isNewAsset);
    const key = { programId_normalizedUrl: { programId: data.programId!, normalizedUrl: normalizeUrl(result.normalizedUrl) } };
    const existing = await prisma.httpService.findUnique({ where: key });
    const fingerprint = fingerprintHttpMetadata({ statusCode: result.statusCode, title: result.title, webserver: result.webserver, technologies: result.technologies, contentLength: result.contentLength });
    const service = await prisma.httpService.upsert({ where: key, create: { programId: data.programId!, assetId: asset.id, url: result.url, normalizedUrl: normalizeUrl(result.normalizedUrl), scheme: result.scheme, host: result.host, port: result.port, statusCode: result.statusCode, title: result.title, webserver: result.webserver, technologies: result.technologies, contentLength: result.contentLength, responseTimeMs: result.responseTimeMs, contentType: result.contentType, location: result.location, cdnName: result.cdnName, failed: result.failed, ...fingerprint }, update: { assetId: asset.id, url: result.url, scheme: result.scheme, host: result.host, port: result.port, statusCode: result.statusCode, title: result.title, webserver: result.webserver, technologies: result.technologies, contentLength: result.contentLength, responseTimeMs: result.responseTimeMs, contentType: result.contentType, location: result.location, cdnName: result.cdnName, failed: result.failed, lastSeenAt: new Date(), ...fingerprint } });
    observations.push({ entityType: "http_service", entityId: service.id, entity: service as unknown as Record<string, unknown> });
    const duplicateFingerprint = Boolean(service.fingerprintHash) && await prisma.httpService.count({ where: { programId: data.programId!, fingerprintHash: service.fingerprintHash, id: { not: service.id } } }) > 0;
    await scoreHttpService(service.id, { isNewAsset, duplicateFingerprint });
    if (!existing) { servicesCreated++; await prisma.entityChange.create({ data: { programId: data.programId!, entityType: "http_service", entityId: service.id, type: "http_service.discovered", summary: `Discovered live HTTP service ${result.url}`, newValue: result.url, source: "httpx", importance: "low" } }); }
  }
  await finishTool(execution.toolRun.id, execution.artifacts, execution.result.durationMs, parsed.results.length);
  await log("httpx completed", "info", { httpServicesDiscovered: parsed.results.length, httpServicesCreated: servicesCreated, skipped: parsed.skipped, skippedOutOfScope });
  return { httpServicesDiscovered: parsed.results.length, httpServicesCreated: servicesCreated, skippedOutOfScope, _observations: observations, _snapshotComparable: skippedOutOfScope === 0, _snapshotMetadata: { comparisonKey: JSON.stringify({ targets: [...targets].sort() }), targetCount: targets.length, tool: "httpx", parserCount: parsed.results.length, skippedOutOfScope, effectiveRateLimit: policy.rateLimitRps } };
}

async function runUrlArchive(data: ReconQueueJobData, policy: WorkerPolicy, log: Log) {
  const target = await rootTarget(data.programId!, data.target ?? (typeof configObject(data.config).domain === "string" ? String(configObject(data.config).domain) : undefined));
  const guard = policy.allows(target, false); if (!guard.allowed) throw new Error(`Worker Scope Guard blocked URL archive target: ${guard.reason}`);
  const configured = configStrings(data.config, "tools").filter((tool): tool is "gau" | "waybackurls" => tool === "gau" || tool === "waybackurls");
  const requested = configured.length ? [...new Set(configured)] : ["gau", "waybackurls"] as const; const limit = configNumber(data.config, "limit", 5_000, 1, 20_000);
  const candidates = new Map<string, UrlArchiveResult[]>(); const toolsRun: string[] = []; const toolsFailed: string[] = []; let parsedCount = 0;
  for (const tool of requested) {
    try {
      const args = tool === "gau" ? ["--subs", "--threads", String(policy.maxConcurrency), target] : [];
      const execution = await executeTool({ programId: data.programId!, jobRunId: data.jobRunId, tool, args, stdinLines: tool === "waybackurls" ? [target] : undefined, timeoutMs: 20 * 60_000, log });
      const parsed = tool === "gau" ? await parseGau(execution.result.stdoutPath) : await parseWaybackurls(execution.result.stdoutPath);
      parsedCount += parsed.parsedCount;
      for (const item of parsed.results) {
        const existing = candidates.get(item.normalizedUrl);
        if (existing) { if (!existing.some((candidate) => candidate.sourceTool === item.sourceTool)) existing.push(item); }
        else if (candidates.size < limit) candidates.set(item.normalizedUrl, [item]);
      }
      await finishTool(execution.toolRun.id, execution.artifacts, execution.result.durationMs, parsed.parsedCount); toolsRun.push(tool);
      await log(`${tool} completed`, "info", { parsed: parsed.parsedCount, skipped: parsed.skippedCount });
    } catch (error) { toolsFailed.push(tool); await log(`${tool} unavailable or failed; continuing with remaining archive tools`, "warn", { error: error instanceof Error ? error.message : `${tool} failed` }); }
  }
  if (!toolsRun.length) throw new Error(`All requested URL archive tools failed or were missing: ${toolsFailed.join(", ")}`);
  let urlsCreated = 0; let urlsUpdated = 0; let skippedOutOfScope = 0; const observations: ObservationCandidate[] = [];
  for (const sources of candidates.values()) {
    const candidate = sources[0]!;
    if (!policy.allows(candidate.url, false).allowed) { skippedOutOfScope++; continue; }
    const saved = await upsertReconUrl(data.programId!, candidate); if (saved.created) urlsCreated++; else urlsUpdated++;
    for (const additional of sources.slice(1)) await upsertReconUrl(data.programId!, additional);
    const current = await prisma.url.findUniqueOrThrow({ where: { id: saved.item.id } }); observations.push({ entityType: "url", entityId: current.id, entity: current as unknown as Record<string, unknown> });
  }
  await log("Historical URL collection completed", "info", { urlsParsed: parsedCount, urlsCreated, urlsUpdated, skippedOutOfScope, toolsRun, toolsFailed });
  return { urlsParsed: parsedCount, urlsCreated, urlsUpdated, skippedOutOfScope, toolsRun, toolsFailed, _observations: observations, _snapshotComparable: toolsFailed.length === 0, _snapshotStatus: toolsFailed.length ? "partial" as const : "success" as const, _snapshotMetadata: { comparisonKey: JSON.stringify({ target, tools: [...requested].sort() }), targetCount: 1, toolsRun, toolsFailed, parserCount: parsedCount, skippedOutOfScope, effectiveRateLimit: policy.rateLimitRps } };
}

async function activeTargets(data: ReconQueueJobData, supplied?: string[]): Promise<string[]> {
  const configured = configStrings(data.config, "targets"); if (supplied?.length) return supplied; if (configured.length) return configured; if (data.target) return [data.target];
  const [urls, services] = await Promise.all([prisma.url.findMany({ where: { programId: data.programId!, scopeStatus: "in_scope" }, orderBy: { finalScore: "desc" }, take: 100, select: { url: true } }), prisma.httpService.findMany({ where: { programId: data.programId!, failed: false }, orderBy: { lastSeenAt: "desc" }, take: 100, select: { url: true } })]);
  return [...new Set([...urls.map((item) => item.url), ...services.map((item) => item.url)])];
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function exactHostScope(targets: string[]): string[] { return [...new Set(targets.map((target) => parseNormalizedUrl(target.includes("://") ? target : `https://${target}`).host).filter(Boolean))].map((host) => `^https?://${escapeRegex(host)}(?::\\d+)?(?:/|$)`); }

async function runKatana(data: ReconQueueJobData, policy: WorkerPolicy, log: Log, supplied?: string[]) {
  const candidates = await activeTargets(data, supplied); const targets = [...new Set(candidates.filter((target) => policy.allows(target, true).allowed))]; const skippedInitial = candidates.length - targets.length;
  if (!targets.length) throw new Error("Worker Scope Guard left no in-scope targets for katana");
  const maxDepth = configNumber(data.config, "maxDepth", 2, 1, 5); const maxUrls = configNumber(data.config, "maxUrls", 200, 1, 2_000);
  const baseArgs = ["-silent", "-jsonl", "-d", String(maxDepth), "-c", String(policy.maxConcurrency), "-rl", String(policy.rateLimitRps)]; const args = [...baseArgs]; const storedArgs = [...baseArgs];
  for (const expression of exactHostScope(targets)) { args.push("-cs", expression); storedArgs.push("-cs", expression); }
  for (const expression of policy.outOfScopeRegexes) { args.push("-cos", expression); storedArgs.push("-cos", expression); }
  for (const header of policy.requiredHeaders) { args.push("-H", `${header.name}: ${header.value}`); storedArgs.push("-H", `${header.name}: ********`); }
  if (policy.requiredHeaders.length) await log("Injecting required headers into katana", "info", { headerNames: policy.requiredHeaders.map((header) => header.name) });
  const execution = await executeTool({ programId: data.programId!, jobRunId: data.jobRunId, tool: "katana", args, storedArgs, stdinLines: targets, timeoutMs: 30 * 60_000, log });
  const parsed = await parseKatana(execution.result.stdoutPath); let urlsCreated = 0; let urlsUpdated = 0; let endpointsCreated = 0; let parametersCreated = 0; let skippedOutOfScope = skippedInitial; const permittedUrls = parsed.urls.slice(0, maxUrls); const observations: ObservationCandidate[] = [];
  for (const candidate of permittedUrls) { if (!policy.allows(candidate.url, true).allowed) { skippedOutOfScope++; continue; } const saved = await upsertReconUrl(data.programId!, candidate); if (saved.created) urlsCreated++; else urlsUpdated++; const current = await prisma.url.findUniqueOrThrow({ where: { id: saved.item.id } }); observations.push({ entityType: "url", entityId: current.id, entity: current as unknown as Record<string, unknown> }); }
  for (const endpoint of parsed.endpoints.filter((item) => permittedUrls.some((url) => url.normalizedUrl === item.normalizedFullUrl))) { if (!policy.allows(endpoint.fullUrl, true).allowed) { skippedOutOfScope++; continue; } const saved = await upsertReconEndpoint(data.programId!, endpoint); if (saved.created) endpointsCreated++; parametersCreated += saved.parametersCreated; const current = await prisma.apiEndpoint.findUniqueOrThrow({ where: { id: saved.item.id }, include: { parameters: true } }); observations.push({ entityType: "endpoint", entityId: current.id, entity: { ...current, parameters: current.parameters.map((item) => `${item.location}:${item.name}`) } }); }
  await finishTool(execution.toolRun.id, execution.artifacts, execution.result.durationMs, permittedUrls.length + parsed.endpoints.length);
  await log("katana standard crawl completed", "info", { urlsParsed: parsed.urls.length, urlsCreated, endpointsCreated, parametersCreated, skippedOutOfScope, maxDepth, maxUrls, headless: false });
  return { urlsParsed: parsed.urls.length, urlsCreated, urlsUpdated, endpointsCreated, parametersCreated, skippedOutOfScope, maxDepth, maxUrls, parserWarnings: parsed.warnings.length, _observations: observations, _snapshotComparable: skippedOutOfScope === 0, _snapshotMetadata: { comparisonKey: JSON.stringify({ targets: [...targets].sort(), maxDepth, maxUrls }), targetCount: targets.length, tool: "katana", parserCount: observations.length, skippedOutOfScope, effectiveRateLimit: policy.rateLimitRps } };
}

async function runNucleiSafe(data: ReconQueueJobData, policy: WorkerPolicy, log: Log, supplied?: string[]) {
  const candidates = await activeTargets(data, supplied); const targets = [...new Set(candidates.filter((target) => policy.allows(target, true).allowed))]; const skippedInitial = candidates.length - targets.length;
  if (!targets.length) throw new Error("Worker Scope Guard left no in-scope targets for nuclei safe scan");
  const requestedTags = configStrings(data.config, "tags"); const safeTags = requestedTags.length ? requestedTags.filter((tag) => (NUCLEI_SAFE_ALLOWED_TAGS as readonly string[]).includes(tag)) : [...NUCLEI_SAFE_ALLOWED_TAGS];
  if (!safeTags.length) throw new Error("No requested nuclei tags are allowed by the Phase 10 safe profile");
  const requestedSeverity = configStrings(data.config, "severity"); const severity = requestedSeverity.length ? requestedSeverity.filter((item) => (NUCLEI_SAFE_ALLOWED_SEVERITIES as readonly string[]).includes(item)) : [...NUCLEI_SAFE_ALLOWED_SEVERITIES];
  if (!severity.length) throw new Error("No requested nuclei severities are allowed by the Phase 10 safe profile");
  const baseArgs = ["-silent", "-jsonl", "-duc", "-ni", "-tags", safeTags.join(","), "-etags", NUCLEI_SAFE_BLOCKED_TAGS.join(","), "-severity", severity.join(","), "-rl", String(policy.rateLimitRps), "-c", String(policy.maxConcurrency)]; const args = [...baseArgs]; const storedArgs = [...baseArgs];
  for (const header of policy.requiredHeaders) { args.push("-H", `${header.name}: ${header.value}`); storedArgs.push("-H", `${header.name}: ********`); }
  if (policy.requiredHeaders.length) await log("Injecting required headers into nuclei", "info", { headerNames: policy.requiredHeaders.map((header) => header.name) });
  const execution = await executeTool({ programId: data.programId!, jobRunId: data.jobRunId, tool: "nuclei", args, storedArgs, stdinLines: targets, timeoutMs: 45 * 60_000, log });
  const parsed = await parseNuclei(execution.result.stdoutPath); let findingsCreated = 0; let findingsUpdated = 0; let skippedOutOfScope = skippedInitial; const observations: ObservationCandidate[] = [];
  for (const finding of parsed.results) { if (!policy.allows(finding.matchedUrl, true).allowed) { skippedOutOfScope++; continue; } const saved = await upsertNucleiFinding(data.programId!, finding); if (saved.created) findingsCreated++; else findingsUpdated++; observations.push({ entityType: "scanner_finding", entityId: saved.item.id, entity: saved.item as unknown as Record<string, unknown> }); }
  await finishTool(execution.toolRun.id, execution.artifacts, execution.result.durationMs, parsed.parsedCount);
  await log("nuclei safe scan completed", "info", { findingsParsed: parsed.parsedCount, findingsCreated, findingsUpdated, skippedOutOfScope, safeTags, excludedTags: NUCLEI_SAFE_BLOCKED_TAGS });
  return { findingsParsed: parsed.parsedCount, findingsCreated, findingsUpdated, skippedOutOfScope, safeTags, excludedTags: [...NUCLEI_SAFE_BLOCKED_TAGS], _observations: observations, _snapshotComparable: skippedOutOfScope === 0, _snapshotMetadata: { comparisonKey: JSON.stringify({ targets: [...targets].sort(), safeTags: [...safeTags].sort(), severity: [...severity].sort() }), targetCount: targets.length, tool: "nuclei", parserCount: parsed.parsedCount, skippedOutOfScope, effectiveRateLimit: policy.rateLimitRps } };
}

async function runSnapshottedStage(data: ReconQueueJobData, stage: string, operation: () => Promise<StageResult>): Promise<Record<string, unknown>> {
  const snapshot = await beginSnapshot({ programId: data.programId!, jobId: data.jobId, jobRunId: data.jobRunId, stage, metadata: { comparisonKey: JSON.stringify({ target: data.target ?? null, config: data.config ?? null }) } });
  try {
    const result = await operation(); const observations = result._observations ?? []; const metadata = result._snapshotMetadata; const comparable = result._snapshotComparable !== false; const status = result._snapshotStatus ?? "success";
    await completeSnapshot(snapshot.id, { status, comparable: comparable && status === "success", observations, metadata });
    const { _observations, _snapshotMetadata, _snapshotComparable, _snapshotStatus, ...summary } = result; return { ...summary, snapshotId: snapshot.id };
  } catch (error) { await failSnapshot(snapshot.id, error); throw error; }
}

export async function executeReconMvp(data: ReconQueueJobData, log: Log): Promise<Record<string, unknown> | null> {
  if (!data.programId) throw new Error("Recon MVP jobs require programId");
  if (!["subdomain_enum", "dns_resolve", "http_probe", "url_archive", "crawl", "nuclei_safe", "full_deep_recon"].includes(data.type)) return null;
  const policy = await loadWorkerPolicy(data.programId);
  if (data.type === "subdomain_enum") return { simulated: false, ...(await runSnapshottedStage(data, "subdomain_enum", () => runSubfinder(data, policy, log))) };
  if (data.type === "dns_resolve") return { simulated: false, ...(await runSnapshottedStage(data, "dns_resolve", () => runDnsx(data, policy, log))) };
  if (data.type === "http_probe") return { simulated: false, ...(await runSnapshottedStage(data, "http_probe", () => runHttpx(data, policy, log))) };
  if (data.type === "url_archive") return { simulated: false, ...(await runSnapshottedStage(data, "url_archive", () => runUrlArchive(data, policy, log))) };
  if (data.type === "crawl") return { simulated: false, ...(await runSnapshottedStage(data, "crawl", () => runKatana(data, policy, log))) };
  if (data.type === "nuclei_safe") return { simulated: false, ...(await runSnapshottedStage(data, "nuclei_safe", () => runNucleiSafe(data, policy, log))) };

  type StageRecord = { status: "success" | "failed" | "not_installed" | "skipped"; result?: Record<string, unknown>; error?: string };
  const stages: Record<string, StageRecord> = {};
  const runStage = async (name: string, operation: () => Promise<Record<string, unknown>>): Promise<Record<string, unknown> | null> => {
    try {
      const result = await operation(); stages[name] = { status: "success", result }; return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : `${name} failed`;
      stages[name] = { status: /not found in PATH|missing/i.test(message) ? "not_installed" : "failed", error: message };
      await log(`Full deep recon stage ${name} did not complete`, "warn", { status: stages[name]!.status, error: message });
      return null;
    }
  };

  const subdomains = await runStage("subdomain_enum", () => runSnapshottedStage(data, "subdomain_enum", () => runSubfinder(data, policy, log)));
  const discoveredHosts = Array.isArray(subdomains?.hosts) ? subdomains.hosts.filter((value): value is string => typeof value === "string") : [];
  const dns = discoveredHosts.length
    ? await runStage("dns_resolve", () => runSnapshottedStage(data, "dns_resolve", () => runDnsx(data, policy, log, discoveredHosts)))
    : (stages.dns_resolve = { status: "skipped", error: "No discovered hosts were available" }, null);
  const resolvedHosts = Array.isArray(dns?.hosts) ? dns.hosts.filter((value): value is string => typeof value === "string") : [];
  if (resolvedHosts.length) await runStage("http_probe", () => runSnapshottedStage(data, "http_probe", () => runHttpx(data, policy, log, resolvedHosts)));
  else stages.http_probe = { status: "skipped", error: "No resolved hosts were available" };

  await runStage("url_archive", () => runSnapshottedStage(data, "url_archive", () => runUrlArchive(data, policy, log)));
  await runStage("crawl", () => runSnapshottedStage(data, "crawl", () => runKatana(data, policy, log)));
  await runStage("nuclei_safe", () => runSnapshottedStage(data, "nuclei_safe", () => runNucleiSafe(data, policy, log)));

  const skippedFutureStages = ["tls_enrichment", "port_discovery", "ffuf", "secret_scan", "naabu"];
  for (const stage of skippedFutureStages) stages[stage] = { status: "skipped", error: "Not implemented in Phase 10" };
  for (const stage of skippedFutureStages) await log(`Skipped future stage: ${stage}`, "info", { implemented: false });
  if (!Object.values(stages).some((stage) => stage.status === "success")) throw new Error("No full deep recon stage could complete; check installed tools and scope policy");
  return { simulated: false, phase: 10, stages, skippedFutureStages };
}
