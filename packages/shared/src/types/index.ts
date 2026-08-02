export type AssetStatus =
  | "new"
  | "resolved"
  | "live"
  | "triaged"
  | "promising"
  | "manual_started"
  | "manual_done"
  | "potential_bug"
  | "reported"
  | "duplicate"
  | "ignored"
  | "monitor"
  | "out_of_scope";

export type Priority = "P1" | "P2" | "Monitor" | "Low";

export type Platform = "hackerone" | "bugcrowd" | "yeswehack" | "custom";

export type ProgramStatus = "active" | "paused" | "archived";

export type HuntingStatus = "ongoing" | "not_hunting";

export type ScopeAssetType =
  | "wildcard_domain"
  | "domain"
  | "subdomain"
  | "url"
  | "api"
  | "cidr"
  | "mobile"
  | "other";

export type AutomationAllowed = "yes" | "no" | "limited" | "unknown";

export type ReconStage =
  | "passive"
  | "active_light"
  | "active_medium"
  | "active_deep"
  | "manual_approval"
  | "blocked";

export type ReconJobType =
  | "program_sync"
  | "subdomain_enum"
  | "dns_resolve"
  | "http_probe"
  | "tls_enrichment"
  | "port_discovery"
  | "url_archive"
  | "crawl"
  | "crawl_headless"
  | "nuclei_safe"
  | "nuclei_advanced"
  | "ffuf_small"
  | "ffuf_deep"
  | "alterx_permutation"
  | "secret_scan"
  | "nmap_verification"
  | "interactsh_oob"
  | "full_deep_recon";

export type ScopeGuardDecision = "allowed" | "blocked" | "limited";

export interface ScopeGuardNormalizedTarget {
  input: string;
  normalized: string;
  host: string | null;
  scheme: string | null;
  port: number | null;
  path: string | null;
  type: "url" | "host" | "host_port" | "ipv4" | "cidr" | "wildcard_domain" | "other";
}

export interface ScopeGuardHeader {
  name: string;
  value: string;
  isRequired: boolean;
}

export interface ScopeGuardPreflightInput {
  programId: string;
  target: string;
  jobType: ReconJobType;
  stage?: ReconStage;
  manualApproved?: boolean;
}

export interface ScopeGuardPreflightResult {
  decision: ScopeGuardDecision;
  allowed: boolean;
  programId: string;
  target: string;
  normalizedTarget: ScopeGuardNormalizedTarget;
  jobType: ReconJobType;
  stage: ReconStage;
  matchedInScope: boolean;
  matchedInScopeScopeId: string | null;
  matchedOutOfScope: boolean;
  matchedOutOfScopeScopeId: string | null;
  scopeReasons: string[];
  automationAllowed: AutomationAllowed;
  manualApprovalRequired: boolean;
  effectiveRateLimitRps: number;
  effectiveMaxConcurrency: number;
  requiredHeaders: ScopeGuardHeader[];
  effectiveHeaders: ScopeGuardHeader[];
  allowedStages: ReconStage[];
  blockedStages: ReconStage[];
  reasons: string[];
}

export interface ScopeGuardSummary {
  programId: string;
  programStatus: ProgramStatus;
  huntingStatus: HuntingStatus;
  automationAllowed: AutomationAllowed;
  aggressiveAllowed: boolean;
  rateLimitRps: number;
  maxConcurrency: number;
  inScopeCount: number;
  outOfScopeCount: number;
  requiredHeadersCount: number;
  forbiddenActions: string[];
  defaultAllowedStages: ReconStage[];
  defaultBlockedStages: ReconStage[];
  warnings: string[];
}

export type JobStatus = "queued" | "running" | "success" | "failed" | "cancelled" | "blocked";
export type JobRunStatus = JobStatus;
export type ToolRunStatus = "queued" | "running" | "success" | "failed" | "skipped";

export interface JobLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  meta?: Record<string, unknown>;
}

export interface ReconQueueJobData {
  jobId: string;
  jobRunId: string;
  programId?: string;
  type: ReconJobType;
  stage?: ReconStage;
  target?: string;
  config?: unknown;
  manualApproved?: boolean;
}

export interface CreateJobRequest {
  programId: string;
  type: ReconJobType;
  target?: string;
  config?: unknown;
  manualApproved?: boolean;
}

export interface ToolRunDto {
  id: string;
  jobRunId: string;
  toolName: string;
  command: string | null;
  args: unknown;
  status: ToolRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  stdoutPath: string | null;
  stderrPath: string | null;
  parsedCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRunDto {
  id: string;
  jobId: string;
  programId: string | null;
  type: ReconJobType;
  status: JobRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  logs: JobLogEntry[] | null;
  resultSummary: unknown;
  createdAt: string;
  updatedAt: string;
  toolRuns?: ToolRunDto[];
}

export interface JobDto {
  id: string;
  programId: string | null;
  type: ReconJobType;
  status: JobStatus;
  stage: ReconStage | null;
  target: string | null;
  config: unknown;
  requestedByUserId: string | null;
  manualApproved: boolean;
  scopeGuardDecision: ScopeGuardPreflightResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  runs?: JobRunDto[];
  latestRun?: JobRunDto | null;
}

export interface JobLogsDto {
  jobId: string;
  jobRunId: string | null;
  logs: JobLogEntry[];
}

export interface JobQueueHealthDto {
  queueName: string;
  redis: "ok" | "error";
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  timestamp: string;
}

export type ScopeStatus = "in_scope" | "out_of_scope" | "unknown";
export type AssetType = "root_domain" | "subdomain" | "host" | "ip" | "service";
export type ToolName = "subfinder" | "dnsx" | "httpx";
export type EntityType = "asset" | "http_service" | "url" | "endpoint" | "scanner_finding" | "js_file" | "secret_candidate" | "job";
export type Category = "login" | "auth" | "admin_dashboard" | "api" | "swagger_openapi" | "graphql" | "upload" | "download_export" | "billing_payment" | "team_invite_role" | "staging_dev" | "debug_error" | "storage_bucket" | "static_cdn" | "parked" | "unknown";
export type ReasonTag = "new_asset" | "live_host" | "api_host" | "graphql_detected" | "swagger_detected" | "admin_detected" | "login_detected" | "auth_detected" | "upload_detected" | "download_export_detected" | "billing_payment_detected" | "staging_keyword" | "debug_error_detected" | "storage_bucket_detected" | "interesting_403" | "server_error" | "unusual_port" | "sensitive_path" | "dev_tech_detected" | "duplicate_fingerprint" | "parked_detected" | "static_cdn";

export interface ScoringRuleMatch {
  hostKeywords?: string[];
  pathKeywords?: string[];
  titleKeywords?: string[];
  techKeywords?: string[];
  statusCodes?: number[];
  ports?: number[];
  contentTypeKeywords?: string[];
  urlRegex?: string;
}

export interface ScoringRuleDto {
  id: string;
  name: string;
  enabled: boolean;
  entityTypes: EntityType[];
  category: Category;
  reasonTag: ReasonTag;
  scoreDelta: number;
  confidence: number;
  match: ScoringRuleMatch;
  notes?: string;
}

export interface ScoringConfigDto {
  version: number;
  priorityThresholds: { P1: number; P2: number; Monitor: number };
  rules: ScoringRuleDto[];
  rawYaml?: string;
}

export interface ScoringPreviewRequest {
  entityType: EntityType;
  host?: string;
  url?: string;
  path?: string;
  title?: string;
  statusCode?: number;
  port?: number;
  technologies?: string[];
  contentType?: string;
  isNew?: boolean;
  duplicateFingerprint?: boolean;
}

export interface ScoreEventDto {
  id?: string;
  ruleId: string | null;
  ruleName: string | null;
  reasonTag: ReasonTag;
  scoreDelta: number;
  matched: boolean;
  evidence: Record<string, unknown> | null;
  source?: string;
  createdAt?: string;
}

export interface EntityClassificationDto {
  id: string;
  programId: string;
  entityType: EntityType;
  entityId: string;
  category: Category;
  confidence: number;
  source: string;
  evidence: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScoringPreviewResponse {
  categories: Category[];
  reasonTags: ReasonTag[];
  scoreEvents: ScoreEventDto[];
  autoScore: number;
  priority: Priority;
  confidence: number;
}

export interface ScoreExplanationDto {
  entityType: "asset";
  entityId: string;
  autoScore: number;
  manualScore: number | null;
  finalScore: number;
  priority: Priority;
  confidence: number;
  categories: Category[];
  reasonTags: ReasonTag[];
  events: ScoreEventDto[];
}

export interface ManualScoreOverrideRequest { manualScore: number | null }

export interface SubfinderResult {
  host: string;
  source?: string;
}

export interface DnsxResult {
  host: string;
  records: Array<{ type: "A" | "AAAA" | "CNAME"; value: string; ttl?: number }>;
  resolver?: string;
}

export interface HttpxResult {
  url: string;
  normalizedUrl: string;
  host: string;
  scheme?: string;
  port?: number;
  statusCode?: number;
  title?: string;
  webserver?: string;
  technologies: string[];
  contentLength?: number;
  responseTimeMs?: number;
  contentType?: string;
  location?: string;
  cdnName?: string;
  failed: boolean;
}

export interface AssetDto {
  id: string;
  programId: string;
  type: AssetType;
  value: string;
  normalizedValue: string;
  parentAssetId: string | null;
  scopeStatus: ScopeStatus;
  status: AssetStatus;
  autoScore: number;
  manualScore: number | null;
  finalScore: number;
  priority: Priority;
  confidence: number;
  categories: string[] | null;
  reasonTags: string[] | null;
  sourceTools: ToolName[] | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DnsRecordDto {
  id: string;
  programId: string;
  assetId: string | null;
  host: string;
  recordType: string;
  value: string;
  ttl: number | null;
  resolver: string | null;
  sourceTool: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface HttpServiceDto {
  id: string;
  programId: string;
  assetId: string | null;
  url: string;
  normalizedUrl: string;
  scheme: string | null;
  host: string;
  port: number | null;
  statusCode: number | null;
  title: string | null;
  webserver: string | null;
  technologies: string[] | null;
  contentLength: number | null;
  responseTimeMs: number | null;
  contentType: string | null;
  location: string | null;
  cdnName: string | null;
  titleHash?: string | null;
  fingerprintHash?: string | null;
  failed: boolean;
  sourceTool: string;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  asset?: AssetDto | null;
}

export interface AssetInventoryFilters {
  programId?: string;
  type?: AssetType;
  status?: AssetStatus;
  scopeStatus?: ScopeStatus;
  search?: string;
  minScore?: number;
  category?: Category;
  reasonTag?: ReasonTag;
  priority?: Priority;
  hasManualScore?: boolean;
  limit?: number;
}

export interface LiveHostFilters {
  programId?: string;
  host?: string;
  statusCode?: number;
  search?: string;
  minScore?: number;
  limit?: number;
}

export interface ApiResponse<T> {
  data: T;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface ProgramScopeDto {
  id: string;
  programId: string;
  asset: string;
  normalizedAsset: string;
  assetType: ScopeAssetType;
  isInScope: boolean;
  bountyEligible: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramRulesDto {
  id: string;
  programId: string;
  automationAllowed: AutomationAllowed;
  aggressiveAllowed: boolean;
  rateLimitRps: number | null;
  maxConcurrency: number | null;
  forbiddenActions: unknown[] | null;
  authTestingAllowed: boolean;
  dosTestingAllowed: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramHeaderDto {
  id: string;
  programId: string;
  name: string;
  value: string;
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramDto {
  id: string;
  platform: Platform;
  name: string;
  handle: string | null;
  programUrl: string | null;
  status: ProgramStatus;
  huntingStatus: HuntingStatus;
  intakeSource: string | null;
  rawPolicyText: string | null;
  policyHash: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  scopesCount?: number;
  headersCount?: number;
  hasRules?: boolean;
  scopes?: ProgramScopeDto[];
  rules?: ProgramRulesDto | null;
  headers?: ProgramHeaderDto[];
}
