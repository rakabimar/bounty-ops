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
