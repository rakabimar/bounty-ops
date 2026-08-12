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
  UrlDto,
  UrlDetailDto,
  UrlFilters,
  ApiEndpointDto,
  ApiEndpointDetailDto,
  EndpointFilters,
  EndpointMethod,
  EndpointParameterLocation,
  AuthRequired,
  ScannerFindingDto,
  ScannerFindingDetailDto,
  ScannerFindingFilters,
  ScannerFindingSeverity,
  ScannerFindingStatus,
  ScannerTool,
  WorkspaceEntityType,
  ResearchNoteDto,
  ManualChecklistDto,
  ChecklistItemDto,
  InterestingRequestDto,
  EvidenceItemDto,
  EntityWorkspaceSummaryDto,
  CreateResearchNoteRequest,
  UpdateResearchNoteRequest,
  CreateChecklistRequest,
  CreateChecklistItemRequest,
  UpdateChecklistItemRequest,
  CreateInterestingRequestRequest,
  CreateEvidenceItemRequest,
  UpdateEntityStatusRequest,
  EvidenceType,
  ReconScheduleDto,
  ReconScheduleFrequency,
  ReconHistoryDto,
  ReconDiffBatchDto,
  NotificationEventDto,
  NotificationEventStatus,
  ChangeImportance,
  ProgramChangeSummaryDto,
  EntityChangeRecordDto,
  ProgramNotificationPreferenceDto,
  NotificationDeliveryDto,
  NotificationDeliveryStatus,
  NotificationChannel,
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
  UrlDto,
  UrlDetailDto,
  UrlFilters,
  ApiEndpointDto,
  ApiEndpointDetailDto,
  EndpointFilters,
  EndpointMethod,
  EndpointParameterLocation,
  AuthRequired,
  ScannerFindingDto,
  ScannerFindingDetailDto,
  ScannerFindingFilters,
  ScannerFindingSeverity,
  ScannerFindingStatus,
  ScannerTool,
  WorkspaceEntityType,
  ResearchNoteDto,
  ManualChecklistDto,
  ChecklistItemDto,
  InterestingRequestDto,
  EvidenceItemDto,
  EntityWorkspaceSummaryDto,
  CreateResearchNoteRequest,
  UpdateResearchNoteRequest,
  CreateChecklistRequest,
  CreateChecklistItemRequest,
  UpdateChecklistItemRequest,
  CreateInterestingRequestRequest,
  CreateEvidenceItemRequest,
  UpdateEntityStatusRequest,
  EvidenceType,
  ReconScheduleDto,
  ReconScheduleFrequency,
  ReconHistoryDto,
  ReconDiffBatchDto,
  NotificationEventDto,
  NotificationEventStatus,
  ChangeImportance,
  ProgramChangeSummaryDto,
  EntityChangeRecordDto,
  ProgramNotificationPreferenceDto,
  NotificationDeliveryDto,
  NotificationDeliveryStatus,
  NotificationChannel,
};

export interface CreateReconScheduleInput {
  name: string;
  jobType?: "full_deep_recon";
  enabled?: boolean;
  frequency: ReconScheduleFrequency;
  timeOfDay?: string | null;
  timezone?: string;
  config?: Record<string, unknown>;
}
export type UpdateReconScheduleInput = Partial<CreateReconScheduleInput>;
export interface ChangeFilters {
  programId?: string;
  entityType?: string;
  entityId?: string;
  type?: string;
  importance?: ChangeImportance;
  from?: string;
  to?: string;
  limit?: number;
}
export interface ReconDiffFilters {
  programId?: string;
  stage?: string;
  limit?: number;
}
export interface ReconHistoryFilters {
  stage?: string;
  from?: string;
  to?: string;
  limit?: number;
}
export interface NotificationEventFilters {
  programId?: string;
  eventType?: string;
  importance?: ChangeImportance;
  status?: NotificationEventStatus;
  limit?: number;
}

export interface NotificationDeliveryFilters {
  programId?: string;
  status?: NotificationDeliveryStatus;
  eventType?: string;
  importance?: ChangeImportance;
  channel?: NotificationChannel;
  limit?: number;
}

export interface NotificationDeliveryListItem extends NotificationDeliveryDto {
  event: NotificationEventDto;
  program: { id: string; name: string } | null;
}

export interface TelegramConfigStatusDto {
  enabled: boolean;
  tokenConfigured: boolean;
  chatIdConfigured: boolean;
  transport: "telegram" | "mock";
}

export interface NotificationQueueHealthDto {
  queueName: "notification-delivery";
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
  urlsCount: number;
  endpointsCount: number;
  scannerFindingsCount: number;
  scoreExplanation?: ScoreExplanationDto;
}

export interface CreateUrlInput {
  programId: string;
  assetId?: string;
  httpServiceId?: string;
  url: string;
  sourceTools?: string[];
  title?: string;
  statusCode?: number;
  contentType?: string;
  technologies?: string[];
}
export interface CreateEndpointInput {
  programId: string;
  assetId?: string;
  urlId?: string;
  method: EndpointMethod;
  path: string;
  fullUrl: string;
  statusCode?: number;
  contentType?: string;
  authRequired?: AuthRequired;
  source?: string;
  parameters?: Array<{
    name: string;
    location: EndpointParameterLocation;
    exampleValue?: string;
    source?: string;
    interesting?: boolean;
    frequency?: number;
  }>;
}
export interface CreateScannerFindingInput {
  programId: string;
  assetId?: string;
  urlId?: string;
  endpointId?: string;
  tool?: ScannerTool;
  severity?: ScannerFindingSeverity;
  templateId?: string;
  name: string;
  description?: string;
  matcher?: string;
  matchedUrl?: string;
  evidenceSnippet?: string;
  extractedResults?: unknown[];
}

export interface ToolHealthDto {
  name:
    | "subfinder"
    | "dnsx"
    | "httpx"
    | "gau"
    | "waybackurls"
    | "katana"
    | "nuclei";
  available: boolean;
  version: string | null;
  error: string | null;
}
