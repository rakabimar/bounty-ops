import { Prisma, prisma } from "@bountyops/db";
import type { DnsxResult, HttpxResult, JobLogEntry, ReconQueueJobData, ToolName } from "@bountyops/shared";
import { compressArtifacts, createArtifactPaths } from "./artifact.service.js";
import { loadWorkerPolicy, type WorkerPolicy } from "./worker-scope-guard.service.js";
import { runCommand, ToolMissingError } from "../tools/command-runner.js";
import { normalizeDomainInput, normalizeHostname, normalizeUrl } from "../tools/normalization.js";
import { parseDnsx } from "../tools/parsers/dnsx.parser.js";
import { parseHttpx } from "../tools/parsers/httpx.parser.js";
import { parseSubfinder } from "../tools/parsers/subfinder.parser.js";
import { TOOL_REGISTRY } from "../tools/tool-registry.js";
import { fingerprintHttpMetadata, scoreAsset, scoreHttpService } from "./scoring.service.js";

type Log = (message: string, level?: JobLogEntry["level"], meta?: Record<string, unknown>) => Promise<void>;
type JsonObject = Record<string, unknown>;

function configObject(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function configStrings(config: unknown, key: string): string[] { const value = configObject(config)[key]; return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : []; }
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
  let created = 0; let skippedOutOfScope = 0; const hosts: string[] = [];
  for (const result of parsed.results) {
    const decision = policy.allows(result.host, false);
    if (!decision.allowed) { skippedOutOfScope++; continue; }
    const saved = await ensureAsset(data.programId!, result.host, "subdomain", "new", "subfinder");
    if (saved.created) created++;
    hosts.push(result.host);
  }
  await finishTool(execution.toolRun.id, execution.artifacts, execution.result.durationMs, hosts.length);
  await log("subfinder completed", "info", { discovered: hosts.length, created, skipped: parsed.skipped, skippedOutOfScope });
  return { hosts: [...new Set(hosts)], discovered: hosts.length, created, skippedOutOfScope };
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
  let created = 0; const resolvedHosts = new Set<string>();
  for (const result of parsed.results) {
    if (!policy.allows(result.host, true).allowed) continue;
    let asset = await prisma.asset.findFirst({ where: { programId: data.programId!, normalizedValue: result.host, type: { in: ["subdomain", "host"] } } });
    if (!asset) asset = (await ensureAsset(data.programId!, result.host, "host", "resolved", "dnsx")).asset;
    else await prisma.asset.update({ where: { id: asset.id }, data: { status: "resolved", lastSeenAt: new Date(), sourceTools: [...new Set([...jsonStrings(asset.sourceTools), "dnsx"])] } });
    for (const record of result.records) {
      const key = { programId: data.programId!, host: result.host, recordType: record.type, value: record.value };
      const existing = await prisma.dnsRecord.findUnique({ where: { programId_host_recordType_value: key } });
      const saved = await prisma.dnsRecord.upsert({ where: { programId_host_recordType_value: key }, create: { ...key, assetId: asset.id, ttl: record.ttl, resolver: result.resolver }, update: { assetId: asset.id, ttl: record.ttl, resolver: result.resolver, lastSeenAt: new Date() } });
      if (!existing) { created++; await prisma.entityChange.create({ data: { programId: data.programId!, entityType: "dns_record", entityId: saved.id, type: "dns_record.discovered", summary: `Discovered ${record.type} record for ${result.host}`, newValue: record.value, source: "dnsx" } }); }
    }
    if (result.records.length) resolvedHosts.add(result.host);
  }
  await finishTool(execution.toolRun.id, execution.artifacts, execution.result.durationMs, parsed.results.reduce((count, item) => count + item.records.length, 0));
  await log("dnsx completed", "info", { dnsRecordsCreated: created, resolvedHosts: resolvedHosts.size, skipped: parsed.skipped, skippedOutOfScope });
  return { hosts: [...resolvedHosts], dnsRecordsCreated: created, skippedOutOfScope };
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
  const parsed = await parseHttpx(execution.result.stdoutPath); let servicesCreated = 0;
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
    const duplicateFingerprint = Boolean(service.fingerprintHash) && await prisma.httpService.count({ where: { programId: data.programId!, fingerprintHash: service.fingerprintHash, id: { not: service.id } } }) > 0;
    await scoreHttpService(service.id, { isNewAsset, duplicateFingerprint });
    if (!existing) { servicesCreated++; await prisma.entityChange.create({ data: { programId: data.programId!, entityType: "http_service", entityId: service.id, type: "http_service.discovered", summary: `Discovered live HTTP service ${result.url}`, newValue: result.url, source: "httpx", importance: "low" } }); }
  }
  await finishTool(execution.toolRun.id, execution.artifacts, execution.result.durationMs, parsed.results.length);
  await log("httpx completed", "info", { httpServicesDiscovered: parsed.results.length, httpServicesCreated: servicesCreated, skipped: parsed.skipped, skippedOutOfScope });
  return { httpServicesDiscovered: parsed.results.length, httpServicesCreated: servicesCreated, skippedOutOfScope };
}

export async function executeReconMvp(data: ReconQueueJobData, log: Log): Promise<Record<string, unknown> | null> {
  if (!data.programId) throw new Error("Recon MVP jobs require programId");
  if (!["subdomain_enum", "dns_resolve", "http_probe", "full_deep_recon"].includes(data.type)) return null;
  const policy = await loadWorkerPolicy(data.programId);
  if (data.type === "subdomain_enum") return { simulated: false, ...(await runSubfinder(data, policy, log)) };
  if (data.type === "dns_resolve") return { simulated: false, ...(await runDnsx(data, policy, log)) };
  if (data.type === "http_probe") return { simulated: false, ...(await runHttpx(data, policy, log)) };
  const subdomains = await runSubfinder(data, policy, log);
  const dns = subdomains.hosts.length ? await runDnsx(data, policy, log, subdomains.hosts) : { hosts: [], dnsRecordsCreated: 0, skippedOutOfScope: 0 };
  const http = dns.hosts.length ? await runHttpx(data, policy, log, dns.hosts) : { httpServicesDiscovered: 0, httpServicesCreated: 0, skippedOutOfScope: 0 };
  const skippedFutureStages = ["tls_enrichment", "port_discovery", "url_archive", "crawl", "nuclei_safe", "secret_scan"];
  for (const stage of skippedFutureStages) await log(`Skipped future stage: ${stage}`, "info", { implemented: false });
  return { simulated: false, subdomainsDiscovered: subdomains.discovered, dnsRecordsCreated: dns.dnsRecordsCreated, httpServicesDiscovered: http.httpServicesDiscovered, skippedOutOfScope: subdomains.skippedOutOfScope + dns.skippedOutOfScope + http.skippedOutOfScope, skippedFutureStages };
}
