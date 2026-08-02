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
