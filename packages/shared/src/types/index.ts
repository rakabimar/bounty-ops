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
export type ToolName = "subfinder" | "dnsx" | "httpx" | "gau" | "waybackurls" | "katana" | "nuclei";
export type EntityType = "asset" | "http_service" | "dns_record" | "url" | "endpoint" | "scanner_finding" | "js_file" | "secret_candidate" | "job";
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
  entityType: EntityType;
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

export interface UrlArchiveResult {
  url: string;
  normalizedUrl: string;
  scheme: string | null;
  host: string;
  port: number | null;
  path: string;
  queryParamKeys: string[];
  sourceTool: "gau" | "waybackurls";
}

export interface KatanaEndpointResult {
  method: EndpointMethod;
  path: string;
  fullUrl: string;
  normalizedFullUrl: string;
  statusCode?: number;
  contentType?: string;
  parameters: Array<{ name: string; location: "query"; source: "katana" }>;
}

export interface KatanaResult {
  urls: Array<Omit<UrlArchiveResult, "sourceTool"> & { sourceTool: "katana"; title?: string; statusCode?: number; contentType?: string; contentLength?: number; technologies?: string[] }>;
  endpoints: KatanaEndpointResult[];
  skippedCount: number;
  warnings: string[];
}

export interface NucleiFindingResult {
  templateId?: string;
  name: string;
  severity: ScannerFindingSeverity;
  description?: string;
  matcher?: string;
  matchedUrl: string;
  evidenceSnippet?: string;
  extractedResults: string[];
}

export interface UrlUpsertResult { id: string; created: boolean; updated: boolean }
export interface EndpointUpsertResult { id: string; created: boolean; updated: boolean; parametersCreated: number }
export interface ScannerFindingUpsertResult { id: string; created: boolean; updated: boolean }

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
  workspaceSummary?: { notesCount: number; checklistDone: number; checklistTotal: number; evidenceCount: number; interestingRequestsCount: number };
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

export type UrlStatus = AssetStatus;
export type EndpointMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "UNKNOWN";
export type AuthRequired = "yes" | "no" | "unknown";
export type EndpointParameterLocation = "query" | "body" | "path" | "header" | "cookie";
export type ScannerFindingSeverity = "info" | "low" | "medium" | "high" | "critical";
export type ScannerFindingStatus = "new" | "reviewed" | "interesting" | "false_positive" | "potential_bug" | "ignored";
export type ScannerTool = "nuclei" | "custom" | "manual";

export interface UrlDto {
  id: string; programId: string; assetId: string | null; httpServiceId: string | null;
  url: string; normalizedUrl: string; scheme: string | null; host: string; port: number | null;
  path: string | null; queryParamKeys: string[] | null; title: string | null; statusCode: number | null;
  contentType: string | null; contentLength: number | null; responseTimeMs: number | null;
  redirectLocation: string | null; technologies: string[] | null; server: string | null;
  categories: Category[] | null; reasonTags: ReasonTag[] | null; sourceTools: string[] | null;
  scopeStatus: ScopeStatus; status: UrlStatus; autoScore: number; manualScore: number | null;
  finalScore: number; priority: Priority; confidence: number; firstSeenAt: string; lastSeenAt: string;
  lastReviewedAt: string | null; createdAt: string; updatedAt: string;
}

export interface EndpointParameterDto {
  id: string; endpointId: string; name: string; location: EndpointParameterLocation;
  exampleValue: string | null; source: string | null; interesting: boolean; frequency: number | null;
  createdAt: string; updatedAt: string;
}

export interface ApiEndpointDto {
  id: string; programId: string; assetId: string | null; urlId: string | null; method: EndpointMethod;
  path: string; fullUrl: string; normalizedFullUrl: string; statusCode: number | null; contentType: string | null;
  authRequired: AuthRequired; source: string; status: UrlStatus; categories: Category[] | null;
  reasonTags: ReasonTag[] | null; autoScore: number; manualScore: number | null; finalScore: number;
  priority: Priority; confidence: number; notesCount: number; firstSeenAt: string; lastSeenAt: string;
  createdAt: string; updatedAt: string; parametersCount?: number; scannerFindingsCount?: number;
  parameters?: EndpointParameterDto[];
}

export interface ScannerFindingDto {
  id: string; programId: string; assetId: string | null; urlId: string | null; endpointId: string | null;
  tool: ScannerTool; severity: ScannerFindingSeverity; templateId: string | null; name: string;
  description: string | null; matcher: string | null; matchedUrl: string | null; evidenceSnippet: string | null;
  extractedResults: unknown[] | null; status: ScannerFindingStatus; firstSeenAt: string; lastSeenAt: string;
  createdAt: string; updatedAt: string;
}

export interface EntityChangeDto {
  id: string; programId: string; entityType: string; entityId: string; type: string; summary: string;
  oldValue: string | null; newValue: string | null; source: string; importance: string; createdAt: string;
}

export interface UrlDetailDto { url: UrlDto; asset: AssetDto | null; httpService: HttpServiceDto | null; endpoints: ApiEndpointDto[]; scannerFindings: ScannerFindingDto[]; parameters: EndpointParameterDto[]; changes: EntityChangeDto[]; scoreExplanation: ScoreExplanationDto; }
export interface ApiEndpointDetailDto { endpoint: ApiEndpointDto; asset: AssetDto | null; url: UrlDto | null; parameters: EndpointParameterDto[]; scannerFindings: ScannerFindingDto[]; changes: EntityChangeDto[]; scoreExplanation: ScoreExplanationDto; }
export interface ScannerFindingDetailDto { finding: ScannerFindingDto; asset: AssetDto | null; url: UrlDto | null; endpoint: ApiEndpointDto | null; changes: EntityChangeDto[]; relatedScoreEvents: ScoreEventDto[]; }
export interface AssetDetailDto { asset: AssetDto; dnsRecords: DnsRecordDto[]; httpServices: HttpServiceDto[]; urlsCount: number; endpointsCount: number; scannerFindingsCount: number; changes: EntityChangeDto[]; scoreExplanation?: ScoreExplanationDto; }

export interface UrlFilters { programId?: string; assetId?: string; host?: string; statusCode?: number; category?: Category; reasonTag?: ReasonTag; minScore?: number; search?: string; limit?: number; }
export interface EndpointFilters { programId?: string; assetId?: string; urlId?: string; method?: EndpointMethod; statusCode?: number; category?: Category; authRequired?: AuthRequired; minScore?: number; search?: string; limit?: number; }
export interface ScannerFindingFilters { programId?: string; assetId?: string; urlId?: string; endpointId?: string; severity?: ScannerFindingSeverity; status?: ScannerFindingStatus; tool?: ScannerTool; search?: string; limit?: number; }

export type WorkspaceEntityType = "asset" | "url" | "endpoint" | "scanner_finding" | "http_service" | "dns_record" | "job";
export type ChecklistItemStatus = "todo" | "in_progress" | "done" | "skipped" | "not_applicable";
export type ChecklistPriority = "low" | "medium" | "high";
export type ChecklistSource = "manual" | "auto" | "template";
export type EvidenceType = "text" | "request_response" | "screenshot_reference" | "file_reference" | "command_output" | "observation";

export interface ResearchNoteDto {
  id: string; programId: string; entityType: WorkspaceEntityType; entityId: string; title: string | null;
  body: string; tags: string[] | null; pinned: boolean; createdByUserId: string | null;
  updatedByUserId: string | null; createdAt: string; updatedAt: string;
}

export interface ChecklistItemDto {
  id: string; checklistId: string; title: string; description: string | null; category: string | null;
  status: ChecklistItemStatus; priority: ChecklistPriority; order: number; source: ChecklistSource;
  evidenceRef: string | null; completedAt: string | null; completedByUserId: string | null;
  createdAt: string; updatedAt: string;
}

export interface ManualChecklistDto {
  id: string; programId: string; entityType: WorkspaceEntityType; entityId: string; title: string;
  source: ChecklistSource; createdAt: string; updatedAt: string; items: ChecklistItemDto[];
}

export interface InterestingRequestDto {
  id: string; programId: string; entityType: WorkspaceEntityType; entityId: string; method: string | null;
  url: string | null; requestHeaders: Record<string, unknown> | null; requestBody: string | null;
  responseStatus: number | null; responseHeaders: Record<string, unknown> | null; responseBodySnippet: string | null;
  notes: string | null; tags: string[] | null; source: string; createdByUserId: string | null;
  createdAt: string; updatedAt: string;
}

export interface EvidenceItemDto {
  id: string; programId: string; entityType: WorkspaceEntityType; entityId: string; title: string;
  evidenceType: EvidenceType; content: string | null; filePath: string | null; url: string | null;
  notes: string | null; tags: string[] | null; createdByUserId: string | null; createdAt: string; updatedAt: string;
}

export interface EntityStatusTransitionDto {
  id: string; programId: string; entityType: WorkspaceEntityType; entityId: string; oldStatus: string | null;
  newStatus: string; reason: string | null; createdByUserId: string | null; createdAt: string;
}

export interface EntityWorkspaceSummaryDto {
  entityType: WorkspaceEntityType; entityId: string; programId: string; status: string | null;
  notesCount: number; checklist: { total: number; done: number; todo: number; inProgress: number; skipped: number };
  evidenceCount: number; interestingRequestsCount: number; latestStatusTransition: EntityStatusTransitionDto | null;
}

export interface CreateResearchNoteRequest { title?: string | null; body: string; tags?: string[]; pinned?: boolean }
export interface UpdateResearchNoteRequest { title?: string | null; body?: string; tags?: string[]; pinned?: boolean }
export interface CreateChecklistRequest { title: string; source?: ChecklistSource }
export interface CreateChecklistItemRequest { title: string; description?: string | null; category?: string | null; priority?: ChecklistPriority; order?: number; source?: ChecklistSource; evidenceRef?: string | null }
export interface UpdateChecklistItemRequest extends Partial<CreateChecklistItemRequest> { status?: ChecklistItemStatus }
export interface CreateInterestingRequestRequest { method?: string | null; url?: string | null; requestHeaders?: Record<string, unknown> | null; requestBody?: string | null; responseStatus?: number | null; responseHeaders?: Record<string, unknown> | null; responseBodySnippet?: string | null; notes?: string | null; tags?: string[]; source?: string }
export interface CreateEvidenceItemRequest { title: string; evidenceType: EvidenceType; content?: string | null; filePath?: string | null; url?: string | null; notes?: string | null; tags?: string[] }
export interface UpdateEntityStatusRequest { status: string; reason?: string | null }

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

export type ReconSnapshotStatus = "running" | "success" | "partial" | "failed" | "skipped";
export type ReconDiffType = "added" | "changed" | "removed" | "reappeared";
export type ChangeImportance = "low" | "medium" | "high" | "critical";
export type NotificationEventStatus = "pending" | "delivered" | "ignored" | "failed" | "suppressed";
export type NotificationChannel = "telegram";
export type NotificationDeliveryStatus = "queued" | "sending" | "delivered" | "failed" | "suppressed";
export type NotificationImportance = "low" | "medium" | "high" | "critical";
export type NotificationEligibilityReason = "eligible" | "notifications_disabled" | "telegram_disabled" | "global_telegram_disabled" | "event_type_disabled" | "importance_below_threshold" | "event_not_pending" | "already_delivered" | "missing_configuration";
export type ReconScheduleFrequency = "daily" | "every_3_days" | "weekly" | "manual";
export type ReconObservationEntityType = "asset" | "dns_record" | "http_service" | "url" | "endpoint" | "scanner_finding";

export interface ReconObservationDto { id: string; snapshotId: string; programId: string; entityType: ReconObservationEntityType; entityId: string | null; stableKey: string; fingerprint: string | null; metadata: Record<string, unknown> | null; createdAt: string }
export interface ReconSnapshotDto { id: string; programId: string; jobId: string | null; jobRunId: string | null; stage: string; status: ReconSnapshotStatus; startedAt: string; completedAt: string | null; observedCount: number; comparable: boolean; metadata: Record<string, unknown> | null; createdAt: string; observations?: ReconObservationDto[] }
export interface ReconDiffBatchDto { id: string; programId: string; stage: string; previousSnapshotId: string | null; currentSnapshotId: string; addedCount: number; changedCount: number; removedCount: number; importance: ChangeImportance; summary: Record<string, unknown> | null; createdAt: string; changes?: EntityChangeRecordDto[] }
export interface NotificationEventDto { id: string; programId: string | null; eventType: string; entityType: string | null; entityId: string | null; importance: ChangeImportance; title: string; message: string; metadata: Record<string, unknown> | null; status: NotificationEventStatus; createdAt: string; deliveredAt: string | null }
export interface ProgramNotificationPreferenceDto { id: string | null; programId: string; enabled: boolean; telegramEnabled: boolean; minImportance: NotificationImportance; eventTypes: string[]; createdAt: string | null; updatedAt: string | null }
export interface NotificationDeliveryDto { id: string; notificationEventId: string; channel: NotificationChannel; status: NotificationDeliveryStatus; attemptCount: number; providerMessageId: string | null; lastError: string | null; queuedAt: string | null; startedAt: string | null; deliveredAt: string | null; failedAt: string | null; nextRetryAt: string | null; createdAt: string; updatedAt: string }
export interface TelegramDeliveryPayload { notificationEventId: string; notificationDeliveryId: string; channel: "telegram" }
export interface NotificationEligibilityResult { eligible: boolean; reason: NotificationEligibilityReason }
export interface ReconScheduleDto { id: string; programId: string; name: string; jobType: ReconJobType; enabled: boolean; frequency: ReconScheduleFrequency; timeOfDay: string | null; timezone: string; config: Record<string, unknown> | null; lastTriggeredAt: string | null; nextRunAt: string | null; createdAt: string; updatedAt: string }
export interface EntityChangeRecordDto { id: string; programId: string; entityType: string; entityId: string; type: string; summary: string; oldValue: string | null; newValue: string | null; source: string; importance: ChangeImportance; createdAt: string }
export interface ReconHistoryDto { jobs: JobRunDto[]; snapshots: ReconSnapshotDto[]; diffBatches: ReconDiffBatchDto[]; changeCounts: Record<string, number> }
export interface ProgramChangeSummaryDto { totalChanges: number; highImportance: number; criticalImportance: number; newAssets: number; newUrls: number; newEndpoints: number; scannerFindingsAppeared: number; scannerFindingsResolved: number; priorityPromotions: number; groupedByType: Record<string, number> }
