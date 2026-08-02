import type {
  AuthUser,
  AutomationAllowed,
  HuntingStatus,
  Platform,
  ProgramDto,
  ProgramHeaderDto,
  ProgramRulesDto,
  ProgramScopeDto,
  ProgramStatus,
  ScopeAssetType,
  ScopeGuardPreflightInput,
  ScopeGuardPreflightResult,
  ScopeGuardSummary,
  CreateJobRequest,
  JobDto,
  JobLogsDto,
  JobQueueHealthDto,
  JobStatus,
  ReconJobType,
  AssetDto,
  AssetInventoryFilters,
  DnsRecordDto,
  HttpServiceDto,
  LiveHostFilters,
  ScoreEventDto,
  ScoreExplanationDto,
  ScoringConfigDto,
  ScoringPreviewRequest,
  ScoringPreviewResponse,
  EntityClassificationDto,
} from "@bountyops/shared";

export type {
  AuthUser,
  AutomationAllowed,
  HuntingStatus,
  Platform,
  ProgramDto,
  ProgramHeaderDto,
  ProgramRulesDto,
  ProgramScopeDto,
  ProgramStatus,
  ScopeAssetType,
  ScopeGuardPreflightInput,
  ScopeGuardPreflightResult,
  ScopeGuardSummary,
  CreateJobRequest,
  JobDto,
  JobLogsDto,
  JobQueueHealthDto,
  ScoreEventDto,
  ScoreExplanationDto,
  ScoringConfigDto,
  ScoringPreviewRequest,
  ScoringPreviewResponse,
  JobStatus,
  ReconJobType,
  AssetDto,
  AssetInventoryFilters,
  DnsRecordDto,
  HttpServiceDto,
  LiveHostFilters,
};

export interface BulkScopeGuardPreflightInput {
  targets: string[];
  jobType: ScopeGuardPreflightInput["jobType"];
  stage?: ScopeGuardPreflightInput["stage"];
  manualApproved?: boolean;
}

export interface ProgramDetailDto extends ProgramDto {
  scopes: ProgramScopeDto[];
  rules: ProgramRulesDto | null;
  headers: ProgramHeaderDto[];
}

export interface ProgramFilters {
  status?: ProgramStatus;
  platform?: Platform;
  huntingStatus?: HuntingStatus;
  search?: string;
}

export interface CreateProgramInput {
  platform: Platform;
  name: string;
  handle?: string;
  programUrl?: string;
  status?: ProgramStatus;
  huntingStatus?: HuntingStatus;
  rawPolicyText?: string;
}

export type UpdateProgramInput = Partial<Omit<CreateProgramInput, "platform">>;

export interface CreateScopeInput {
  asset: string;
  assetType: ScopeAssetType;
  isInScope: boolean;
  bountyEligible: boolean;
  notes?: string | null;
}

export type UpdateScopeInput = Partial<CreateScopeInput>;

export interface UpdateRulesInput {
  automationAllowed: AutomationAllowed;
  aggressiveAllowed: boolean;
  rateLimitRps?: number | null;
  maxConcurrency?: number | null;
  forbiddenActions?: string[];
  authTestingAllowed: boolean;
  dosTestingAllowed: boolean;
  notes?: string | null;
}

export interface CreateHeaderInput {
  name: string;
  value: string;
  isRequired: boolean;
}

export type UpdateHeaderInput = Partial<CreateHeaderInput>;
export type AppSettingsDto = Record<string, unknown>;

export interface AuditLogDto {
  id: string;
  userId: string | null;
  programId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AuditFilters {
  programId?: string;
  action?: string;
  limit?: number;
}

export interface JobFilters {
  programId?: string;
  status?: JobStatus;
  type?: ReconJobType;
  limit?: number;
}

export interface RetryJobInput {
  target?: string;
  manualApproved?: boolean;
}

export interface EntityChangeDto {
  id: string;
  programId: string;
  entityType: string;
  entityId: string;
  type: string;
  summary: string;
  oldValue: string | null;
  newValue: string | null;
  source: string;
  importance: string;
  createdAt: string;
}

export interface AssetDetailResponse {
  asset: AssetDto;
  dnsRecords: DnsRecordDto[];
  httpServices: HttpServiceDto[];
  changes: EntityChangeDto[];
  scoreEvents?: ScoreEventDto[];
  classifications?: EntityClassificationDto[];
}

export interface ToolHealthDto {
  name: "subfinder" | "dnsx" | "httpx";
  available: boolean;
  version: string | null;
  error: string | null;
}
