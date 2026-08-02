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

export type JobStatus = "queued" | "running" | "success" | "failed" | "cancelled";

export type ScopeStatus = "in_scope" | "out_of_scope" | "unknown";

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
