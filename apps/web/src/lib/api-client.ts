import { seedDb } from "./mock-data";
import { priorityFromScore } from "./bounty-types";
import { API_BASE_URL, API_MODE } from "./api-config";
import {
  DEFAULT_PROGRAM_NOTIFICATION_EVENT_TYPES,
  RECON_JOB_DEFAULT_STAGES,
} from "@bountyops/shared";
import type {
  AppSettings,
  Asset,
  AssetStatus,
  ChecklistItem,
  DiscoveredEndpoint,
  EntityType,
  EvidenceRequest,
  IntakeInput,
  IntakePreview,
  InterestingRequest,
  MockDb,
  Note,
  NotificationSettings,
  Program,
  ReconJob,
  ResearchNote,
  Rules,
  ScannerFinding,
  ScannerFindingStatus,
  ScopeAsset,
  ScoringRule,
} from "./bounty-types";
import type {
  ApiEndpointDetailDto,
  ApiEndpointDto,
  AssetDetailResponse,
  AssetDto,
  AssetInventoryFilters,
  AuditFilters,
  AuditLogDto,
  AuthUser,
  BulkScopeGuardPreflightInput,
  ChangeFilters,
  ChecklistItemDto,
  CreateChecklistItemRequest,
  CreateChecklistRequest,
  CreateEndpointInput,
  CreateEvidenceItemRequest,
  CreateHeaderInput,
  CreateInterestingRequestRequest,
  CreateJobRequest,
  CreateProgramInput,
  CreateReconScheduleInput,
  CreateResearchNoteRequest,
  CreateScannerFindingInput,
  CreateScopeInput,
  CreateUrlInput,
  DnsRecordDto,
  EndpointFilters,
  EntityChangeDto,
  EntityChangeRecordDto,
  EntityWorkspaceSummaryDto,
  EvidenceItemDto,
  HttpServiceDto,
  InterestingRequestDto,
  JobDto,
  JobFilters,
  JobLogsDto,
  JobQueueHealthDto,
  LiveHostFilters,
  ManualChecklistDto,
  NotificationEventDto,
  NotificationEventFilters,
  NotificationDeliveryDto,
  NotificationDeliveryFilters,
  NotificationDeliveryListItem,
  NotificationQueueHealthDto,
  ProgramNotificationPreferenceDto,
  TelegramConfigStatusDto,
  ProgramChangeSummaryDto,
  ProgramDetailDto,
  ProgramDto,
  ProgramFilters,
  ProgramHeaderDto,
  ProgramRulesDto,
  ProgramScopeDto,
  ReconDiffBatchDto,
  ReconDiffFilters,
  ReconHistoryDto,
  ReconHistoryFilters,
  ReconScheduleDto,
  ResearchNoteDto,
  RetryJobInput,
  ScannerFindingDetailDto,
  ScannerFindingDto,
  ScannerFindingFilters,
  ScannerFindingStatus as CoreScannerFindingStatus,
  ScopeGuardPreflightInput,
  ScopeGuardPreflightResult,
  ScopeGuardSummary,
  ScoreExplanationDto,
  ScoringConfigDto,
  ScoringPreviewRequest,
  ScoringPreviewResponse,
  ToolHealthDto,
  UpdateChecklistItemRequest,
  UpdateHeaderInput,
  UpdateProgramInput,
  UpdateReconScheduleInput,
  UpdateResearchNoteRequest,
  UpdateRulesInput,
  UpdateScopeInput,
  UrlDetailDto,
  UrlDto,
  UrlFilters,
  WorkspaceEntityType,
  AiHealthDto,
  ProgramIntakePreviewRequest,
  ProgramIntakePreviewResponse,
  ProgramIntakeRunDetail,
  ProgramIntakeStructuredResult,
  ProgramIntakeSyncApplyInput,
  ProgramIntakeSyncPreview,
} from "./api-types";

const DB_KEY = "bountyops.mock.db.v2";
const AUTH_KEY = "bountyops.auth";
const wait = () => new Promise((resolve) => setTimeout(resolve, 180));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function readDb(): MockDb {
  if (typeof window === "undefined") return clone(seedDb);
  const value = window.localStorage.getItem(DB_KEY);
  if (!value) {
    window.localStorage.setItem(DB_KEY, JSON.stringify(seedDb));
    return clone(seedDb);
  }
  try {
    return JSON.parse(value) as MockDb;
  } catch {
    return clone(seedDb);
  }
}
function writeDb(db: MockDb) {
  if (typeof window !== "undefined")
    window.localStorage.setItem(DB_KEY, JSON.stringify(db));
}
async function mutate<T>(fn: (db: MockDb) => T) {
  await wait();
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return clone(result);
}

export { API_MODE } from "./api-config";
export const endpoints = {
  login: "/auth/login",
  logout: "/auth/logout",
  me: "/me",
  programs: "/programs",
  program: "/programs/:id",
  intake: "/programs/:id/intake",
  sync: "/programs/:id/sync",
  archive: "/programs/:id/archive",
  scopes: "/programs/:id/scopes",
  rules: "/programs/:id/rules",
  jobs: "/programs/:id/jobs",
  jobLogs: "/jobs/:id/logs",
  assets: "/assets",
  asset: "/assets/:id",
  urls: "/urls",
  services: "/http-services",
  apiEndpoints: "/api-endpoints",
  jsFiles: "/js-files",
  scoring: "/scoring-rules",
  scoringPreview: "/scoring-rules/preview",
  settings: "/settings",
  tools: "/tools/health",
  telegram: "/notifications/test-telegram",
} as const;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      `Unable to reach the BountyOps API at ${API_BASE_URL}.`,
    );
  }
  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }
  if (!response.ok) {
    const error =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { code?: string; message?: string } }).error
        : undefined;
    const message =
      error?.message ||
      (response.status >= 500
        ? "The BountyOps API could not complete the request."
        : `Request failed (${response.status}).`);
    if (
      response.status === 401 &&
      path !== "/me" &&
      path !== "/auth/login" &&
      typeof window !== "undefined"
    ) {
      window.location.assign(
        `/login?redirect=${encodeURIComponent(window.location.pathname)}`,
      );
    }
    throw new ApiError(
      response.status,
      error?.code || "REQUEST_FAILED",
      message,
    );
  }
  return body as T;
}

const mockUser: AuthUser = {
  id: "mock-admin",
  email: "hunter@example.com",
  role: "admin",
};
export const authStore = {
  isAuthenticated: () =>
    API_MODE === "mock" &&
    typeof window !== "undefined" &&
    window.localStorage.getItem(AUTH_KEY) === "true",
  login: async (email: string, password: string): Promise<AuthUser> => {
    if (API_MODE === "http")
      return (
        await request<{ user: AuthUser }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        })
      ).user;
    await wait();
    if (!email.includes("@") || password.length < 6)
      throw new ApiError(
        401,
        "UNAUTHORIZED",
        "Enter a valid email and a password of at least 6 characters.",
      );
    window.localStorage.setItem(AUTH_KEY, "true");
    return { ...mockUser, email };
  },
  me: async (): Promise<AuthUser> => {
    if (API_MODE === "http")
      return (await request<{ user: AuthUser }>("/me")).user;
    await wait();
    if (!authStore.isAuthenticated())
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    return mockUser;
  },
  logout: async () => {
    if (API_MODE === "http")
      await request<{ success: boolean }>("/auth/logout", { method: "POST" });
    else if (typeof window !== "undefined")
      window.localStorage.removeItem(AUTH_KEY);
  },
};

export const api = {
  mode: API_MODE,
  endpoints,
  dashboard: async (programId?: string) => {
    await wait();
    const db = readDb();
    if (!programId || API_MODE === "http") return db;
    return {
      ...db,
      programs: db.programs.filter((x) => x.id === programId),
      scopes: db.scopes.filter((x) => x.programId === programId),
      rules: db.rules.filter((x) => x.programId === programId),
      jobs: db.jobs.filter((x) => x.programId === programId),
      assets: db.assets.filter((x) => x.programId === programId),
      urls: db.urls.filter((x) => x.programId === programId),
      services: db.services.filter((x) => x.programId === programId),
      endpoints: db.endpoints.filter((x) => x.programId === programId),
      jsFiles: db.jsFiles.filter((x) => x.programId === programId),
      notes: db.notes.filter((x) => x.programId === programId),
      changes: db.changes.filter((x) => x.programId === programId),
    };
  },
  programs: async () => {
    await wait();
    return readDb().programs;
  },
  program: async (id: string) => {
    await wait();
    const db = readDb();
    return {
      program: db.programs.find((x) => x.id === id),
      scopes: db.scopes.filter((x) => x.programId === id),
      rules: db.rules.find((x) => x.programId === id),
      jobs: db.jobs.filter((x) => x.programId === id),
      assets: db.assets.filter((x) => x.programId === id),
      notes: db.notes.filter((x) => x.programId === id),
      changes: db.changes.filter((x) => x.programId === id),
      schedules: db.schedules.filter((x) => x.programId === id),
    };
  },
  intakePreview: async (input: IntakeInput): Promise<IntakePreview> => {
    await wait();
    const host = input.programUrl
      ? new URL(input.programUrl).hostname.replace("www.", "")
      : input.apiHandle || "custom-program";
    const name = host
      .split(".")[0]
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      name,
      platform: input.platform,
      url: input.programUrl,
      inScope: [`*.${host}`],
      outOfScope: [`status.${host}`],
      source: input.method,
      rawPolicyText: input.rawPolicyText,
      policyHash: `sha256:${btoa(input.rawPolicyText || host).slice(0, 10)}`,
      confidence:
        input.method === "api" ? 98 : input.method === "url_parser" ? 88 : 72,
      needsManualReview: input.method === "manual_paste",
      rules: {
        programId: "preview",
        automation: "limited",
        aggressive: false,
        rateLimit: 5,
        concurrency: 3,
        headers: [],
        forbidden: ["DoS", "Social engineering"],
        authTesting: "unknown",
        dosTesting: false,
        notes: "Parsed from intake source.",
        validated: false,
      },
    };
  },
  approveIntake: (preview: IntakePreview, draft = false) =>
    mutate((db) => {
      const id = `p${Date.now()}`;
      const item: Program = {
        id,
        name: preview.name,
        platform: preview.platform,
        status: draft ? "paused" : "active",
        hunting: draft ? "not_hunting" : "ongoing",
        scopeCount: preview.inScope.length + preview.outOfScope.length,
        schedules: 0,
        lastSync: "Just now",
        lastRecon: "Never",
        url: preview.url,
        intakeSource: preview.source,
        rawPolicyText: preview.rawPolicyText,
        policyHash: preview.policyHash,
        lastSyncedAt: new Date().toISOString(),
        needsManualReview: preview.needsManualReview,
        confidence: preview.confidence,
        draft,
      };
      db.programs.unshift(item);
      db.rules.push({
        ...preview.rules,
        programId: id,
        validated: !draft && !preview.needsManualReview,
      });
      [...preview.inScope, ...preview.outOfScope].forEach((asset, index) =>
        db.scopes.push({
          id: `s${Date.now()}${index}`,
          programId: id,
          asset,
          normalized: asset.replace("*.", ""),
          type: asset.startsWith("*.") ? "wildcard" : "domain",
          scope: index < preview.inScope.length ? "in_scope" : "out_of_scope",
          bountyEligible: index < preview.inScope.length,
          notes: "Imported during intake",
        }),
      );
      return item;
    }),
  updateProgram: (id: string, data: Partial<Program>) =>
    mutate((db) =>
      Object.assign(db.programs.find((x) => x.id === id) ?? {}, data),
    ),
  scopes: async (programId?: string) => {
    await wait();
    return readDb().scopes.filter(
      (x) => !programId || x.programId === programId,
    );
  },
  saveScope: (item: ScopeAsset) =>
    mutate((db) => {
      const i = db.scopes.findIndex((x) => x.id === item.id);
      if (i >= 0) db.scopes[i] = item;
      else db.scopes.unshift(item);
      return item;
    }),
  deleteScope: (id: string) =>
    mutate((db) => {
      db.scopes = db.scopes.filter((x) => x.id !== id);
      return id;
    }),
  rules: async (programId: string) => {
    await wait();
    return readDb().rules.find((x) => x.programId === programId);
  },
  saveRules: (rules: Rules) =>
    mutate((db) => {
      const i = db.rules.findIndex((x) => x.programId === rules.programId);
      if (i >= 0) db.rules[i] = rules;
      else db.rules.push(rules);
      return rules;
    }),
  jobs: async (programId?: string) => {
    await wait();
    return readDb().jobs.filter(
      (x) => API_MODE === "http" || !programId || x.programId === programId,
    );
  },
  runJob: (type: string, programId: string) =>
    mutate((db) => {
      const job: ReconJob = {
        id: `j${Date.now()}`,
        type,
        programId,
        status: "queued",
        createdAt: "Just now",
        duration: "—",
        tool: type === "Full recon" ? "pipeline" : type.toLowerCase(),
        logs: ["Job queued after policy validation"],
      };
      db.jobs.unshift(job);
      return job;
    }),
  cancelJob: (id: string) =>
    mutate((db) => {
      const job = db.jobs.find((x) => x.id === id);
      if (job) job.status = "cancelled";
      return job;
    }),
  pipeline: async (programId: string) => {
    await wait();
    return readDb().pipeline[programId] ?? [];
  },
  assets: async (programId?: string) => {
    await wait();
    return readDb().assets.filter(
      (x) => API_MODE === "http" || !programId || x.programId === programId,
    );
  },
  updateAsset: (id: string, data: Partial<Asset>) =>
    mutate((db) => {
      const asset = db.assets.find((x) => x.id === id);
      if (asset) {
        Object.assign(asset, data);
        asset.finalScore = asset.manualScore ?? asset.autoScore;
      }
      return asset;
    }),
  setAssetStatus: (id: string, status: AssetStatus) =>
    mutate((db) => {
      const asset = db.assets.find((x) => x.id === id);
      if (asset) {
        asset.status = status;
        asset.lastReviewed = "Just now";
      }
      return asset;
    }),
  urls: async (programId?: string) => {
    await wait();
    return readDb().urls.filter(
      (x) => API_MODE === "http" || !programId || x.programId === programId,
    );
  },
  services: async (programId?: string) => {
    await wait();
    return readDb().services.filter(
      (x) => API_MODE === "http" || !programId || x.programId === programId,
    );
  },
  apiEndpoints: async (programId?: string) => {
    await wait();
    return readDb().endpoints.filter(
      (x) => API_MODE === "http" || !programId || x.programId === programId,
    );
  },
  jsFiles: async (programId?: string) => {
    await wait();
    return readDb().jsFiles.filter(
      (x) => API_MODE === "http" || !programId || x.programId === programId,
    );
  },
  notes: async (programId?: string) => {
    await wait();
    return readDb().notes.filter(
      (x) => API_MODE === "http" || !programId || x.programId === programId,
    );
  },
  addNote: (
    title: string,
    body: string,
    programId: string,
    assetId?: string,
    tags: string[] = [],
  ) =>
    mutate((db) => {
      const note: Note = {
        id: `n${Date.now()}`,
        title,
        body,
        programId,
        assetId,
        tags,
        updatedAt: "Just now",
      };
      db.notes.unshift(note);
      return note;
    }),
  updateNote: (id: string, data: Partial<Note>) =>
    mutate((db) => {
      const note = db.notes.find((x) => x.id === id);
      if (note) Object.assign(note, data, { updatedAt: "Just now" });
      return note;
    }),
  deleteNote: (id: string) =>
    mutate((db) => {
      db.notes = db.notes.filter((x) => x.id !== id);
      return id;
    }),
  changes: async (programId?: string) => {
    await wait();
    return readDb().changes.filter(
      (x) => API_MODE === "http" || !programId || x.programId === programId,
    );
  },
  schedules: async (programId: string) => {
    await wait();
    return readDb().schedules.filter((x) => x.programId === programId);
  },
  saveSchedule: (id: string, data: Record<string, unknown>) =>
    mutate((db) => {
      const item = db.schedules.find((x) => x.id === id);
      if (item) Object.assign(item, data);
      return item;
    }),
  nucleiFindings: async (assetId: string) => {
    await wait();
    return readDb().nucleiFindings.filter((x) => x.assetId === assetId);
  },
  interestingRequests: async (assetId: string) => {
    await wait();
    return readDb().interestingRequests.filter((x) => x.assetId === assetId);
  },
  addInterestingRequest: (item: Omit<InterestingRequest, "id">) =>
    mutate((db) => {
      const saved = { ...item, id: `ir${Date.now()}` };
      db.interestingRequests.push(saved);
      return saved;
    }),
  tools: async () => {
    await wait();
    const db = readDb();
    return { tools: db.tools, workerHealth: db.workerHealth };
  },
  scoring: async () => {
    await wait();
    return readDb().scoring;
  },
  saveScoring: (rules: ScoringRule[]) =>
    mutate((db) => {
      db.scoring = rules;
      return rules;
    }),
  notifications: async () => {
    await wait();
    return readDb().notifications;
  },
  saveNotifications: (value: NotificationSettings) =>
    mutate((db) => {
      db.notifications = value;
      return value;
    }),
  testTelegram: async () => {
    await wait();
    return { ok: true, message: "Test notification delivered" };
  },
  settings: async () => {
    await wait();
    return readDb().settings;
  },
  saveSettings: (value: AppSettings) =>
    mutate((db) => {
      db.settings = value;
      return value;
    }),
  checklist: async (id: string) => {
    await wait();
    return readDb().checklist[id] ?? [];
  },
  saveChecklist: (id: string, items: string[]) =>
    mutate((db) => {
      db.checklist[id] = items;
      return items;
    }),
  reset: () => {
    if (typeof window !== "undefined")
      window.localStorage.setItem(DB_KEY, JSON.stringify(seedDb));
  },

  // ============ Detail / entity APIs ============
  assetDetail: async (assetId: string) => {
    await wait();
    const db = readDb();
    const asset = db.assets.find((x) => x.id === assetId);
    if (!asset) return null;
    return {
      asset,
      program: db.programs.find((p) => p.id === asset.programId),
      urls: db.urls.filter((x) => x.assetId === assetId),
      endpoints: db.discoveredEndpoints.filter((x) => x.assetId === assetId),
      legacyEndpoints: db.endpoints.filter((x) => x.assetId === assetId),
      findings: db.scannerFindings.filter((x) => x.assetId === assetId),
      services: db.services.filter((x) => x.assetId === assetId),
      jsFiles: db.jsFiles.filter((x) => x.assetId === assetId),
      ports: db.portRecords[assetId] ?? [],
      dns: db.dnsRecords[assetId] ?? [],
      changes: db.entityChanges.filter(
        (c) => c.entityType === "asset" && c.entityId === assetId,
      ),
      notes: db.researchNotes.filter(
        (n) => n.entityType === "asset" && n.entityId === assetId,
      ),
      evidenceRequests: db.evidenceRequests.filter(
        (r) => r.entityType === "asset" && r.entityId === assetId,
      ),
    };
  },
  urlDetail: async (urlId: string) => {
    await wait();
    const db = readDb();
    const url = db.urls.find((x) => x.id === urlId);
    if (!url) return null;
    return {
      url,
      asset: db.assets.find((a) => a.id === url.assetId),
      program: db.programs.find((p) => p.id === url.programId),
      endpoints: db.discoveredEndpoints.filter((x) => x.urlId === urlId),
      findings: db.scannerFindings.filter((x) => x.urlId === urlId),
      jsFiles: db.jsFiles.filter((x) => x.assetId === url.assetId),
      changes: db.entityChanges.filter(
        (c) => c.entityType === "url" && c.entityId === urlId,
      ),
      notes: db.researchNotes.filter(
        (n) => n.entityType === "url" && n.entityId === urlId,
      ),
      evidenceRequests: db.evidenceRequests.filter(
        (r) => r.entityType === "url" && r.entityId === urlId,
      ),
    };
  },
  endpointDetail: async (endpointId: string) => {
    await wait();
    const db = readDb();
    const endpoint = db.discoveredEndpoints.find((x) => x.id === endpointId);
    if (!endpoint) return null;
    return {
      endpoint,
      asset: db.assets.find((a) => a.id === endpoint.assetId),
      program: db.programs.find((p) => p.id === endpoint.programId),
      url: endpoint.urlId
        ? db.urls.find((u) => u.id === endpoint.urlId)
        : undefined,
      findings: db.scannerFindings.filter((x) => x.endpointId === endpointId),
      changes: db.entityChanges.filter(
        (c) => c.entityType === "endpoint" && c.entityId === endpointId,
      ),
      notes: db.researchNotes.filter(
        (n) => n.entityType === "endpoint" && n.entityId === endpointId,
      ),
      evidenceRequests: db.evidenceRequests.filter(
        (r) => r.entityType === "endpoint" && r.entityId === endpointId,
      ),
    };
  },
  findingDetail: async (findingId: string) => {
    await wait();
    const db = readDb();
    const finding = db.scannerFindings.find((x) => x.id === findingId);
    if (!finding) return null;
    return {
      finding,
      asset: db.assets.find((a) => a.id === finding.assetId),
      program: db.programs.find((p) => p.id === finding.programId),
      url: finding.urlId
        ? db.urls.find((u) => u.id === finding.urlId)
        : undefined,
      endpoint: finding.endpointId
        ? db.discoveredEndpoints.find((e) => e.id === finding.endpointId)
        : undefined,
      changes: db.entityChanges.filter(
        (c) => c.entityType === "scanner_finding" && c.entityId === findingId,
      ),
      notes: db.researchNotes.filter(
        (n) => n.entityType === "scanner_finding" && n.entityId === findingId,
      ),
      evidenceRequests: db.evidenceRequests.filter(
        (r) => r.entityType === "scanner_finding" && r.entityId === findingId,
      ),
    };
  },

  updateAssetManualScore: (id: string, manualScore: number | null) =>
    mutate((db) => {
      const a = db.assets.find((x) => x.id === id);
      if (a) {
        a.manualScore = manualScore;
        a.finalScore = manualScore ?? a.autoScore;
      }
      return a;
    }),
  updateEndpointStatus: (id: string, status: AssetStatus) =>
    mutate((db) => {
      const e = db.discoveredEndpoints.find((x) => x.id === id);
      if (e) e.status = status;
      return e;
    }),
  updateEndpointManualScore: (id: string, manualScore: number | null) =>
    mutate((db) => {
      const e = db.discoveredEndpoints.find((x) => x.id === id);
      if (e) {
        e.manualScore = manualScore;
        e.finalScore = manualScore ?? e.autoScore;
        e.priority = priorityFromScore(e.finalScore);
      }
      return e;
    }),
  updateFindingStatus: (id: string, status: ScannerFindingStatus) =>
    mutate((db) => {
      const f = db.scannerFindings.find((x) => x.id === id);
      if (f) f.status = status;
      return f;
    }),

  entityNotes: async (entityType: EntityType, entityId: string) => {
    await wait();
    return readDb().researchNotes.filter(
      (n) => n.entityType === entityType && n.entityId === entityId,
    );
  },
  addEntityNote: (note: Omit<ResearchNote, "id" | "createdAt" | "updatedAt">) =>
    mutate((db) => {
      const saved: ResearchNote = {
        ...note,
        id: `rn${Date.now()}`,
        createdAt: "Just now",
        updatedAt: "Just now",
      };
      db.researchNotes.unshift(saved);
      return saved;
    }),
  updateEntityNote: (id: string, data: Partial<ResearchNote>) =>
    mutate((db) => {
      const n = db.researchNotes.find((x) => x.id === id);
      if (n) Object.assign(n, data, { updatedAt: "Just now" });
      return n;
    }),
  deleteEntityNote: (id: string) =>
    mutate((db) => {
      db.researchNotes = db.researchNotes.filter((n) => n.id !== id);
      return id;
    }),

  entityChecklist: async (
    entityType: "asset" | "url" | "endpoint",
    entityId: string,
  ) => {
    await wait();
    return readDb().checklistItems.filter(
      (x) => x.entityType === entityType && x.entityId === entityId,
    );
  },
  generateEntityChecklist: (
    entityType: "asset" | "url" | "endpoint",
    entityId: string,
    programId: string,
    categories: string[],
  ) =>
    mutate((db) => {
      const existing = db.checklistItems.filter(
        (x) => x.entityType === entityType && x.entityId === entityId,
      );
      if (existing.length > 0) return existing;
      const templates: Record<
        string,
        { title: string; description: string }[]
      > = {
        api: [
          {
            title: "Check BOLA / IDOR",
            description: "Test object access across two accounts.",
          },
          {
            title: "Test mass assignment",
            description: "Try injecting extra fields like role, isAdmin.",
          },
          {
            title: "Test method override",
            description: "Try X-HTTP-Method-Override header.",
          },
          {
            title: "Check hidden endpoints",
            description: "Enumerate via wordlists and JS extraction.",
          },
          {
            title: "Check pagination/filter leakage",
            description: "Look for unauthorized rows returned.",
          },
          {
            title: "Check object ownership",
            description: "Verify ownership checks across endpoints.",
          },
        ],
        graphql: [
          {
            title: "Check introspection",
            description: "Disabled in production?",
          },
          {
            title: "Check query batching",
            description: "Test batched queries / aliasing.",
          },
          {
            title: "Check mutation authorization",
            description: "Test mutations across roles.",
          },
          {
            title: "Check object-level authorization",
            description: "Verify per-resolver auth.",
          },
          {
            title: "Check schema leakage",
            description: "Look for typed error message leaks.",
          },
        ],
        login: [
          {
            title: "Check login/logout",
            description: "Verify session lifecycle.",
          },
          {
            title: "Check password reset",
            description: "Token reuse, expiry, predictability.",
          },
          {
            title: "Check session expiration",
            description: "Idle and absolute timeouts.",
          },
          {
            title: "Check MFA/SSO",
            description: "Bypass tests, account linking.",
          },
          {
            title: "Check CSRF on account changes",
            description: "Token presence on sensitive forms.",
          },
          {
            title: "Check rate limiting safely per ROE",
            description: "Respect program limits.",
          },
        ],
        auth: [
          {
            title: "Check auth logic",
            description: "Token issuance, refresh, revocation.",
          },
          {
            title: "Check rate limiting safely per ROE",
            description: "Respect program limits.",
          },
          {
            title: "Check account enumeration",
            description: "Compare error messages.",
          },
          {
            title: "Check session behavior",
            description: "Cookies, flags, fixation.",
          },
        ],
        upload: [
          {
            title: "Check file type validation",
            description: "Magic byte vs extension.",
          },
          {
            title: "Check content-type mismatch",
            description: "Polyglot files.",
          },
          {
            title: "Check filename/path traversal",
            description: "Try ../ patterns.",
          },
          {
            title: "Check public file access",
            description: "Bucket / object ACLs.",
          },
          {
            title: "Check metadata leakage",
            description: "EXIF, internal paths.",
          },
        ],
        admin: [
          {
            title: "Check role bypass",
            description: "Parameter / header tampering.",
          },
          {
            title: "Check horizontal access",
            description: "Across same role.",
          },
          {
            title: "Check vertical access",
            description: "Across privilege levels.",
          },
          {
            title: "Check exposed internal functionality",
            description: "Debug routes, dev tools.",
          },
        ],
        billing: [
          {
            title: "Check invoice access",
            description: "Cross-account invoices.",
          },
          {
            title: "Check plan changes",
            description: "Tampering, downgrade abuse.",
          },
          { title: "Check coupon abuse", description: "Stacking, reuse." },
          {
            title: "Check race condition candidates",
            description: "Refund / credit endpoints.",
          },
          {
            title: "Check authorization on billing endpoints",
            description: "Per-account checks.",
          },
        ],
      };
      const items: ChecklistItem[] = [];
      const seen = new Set<string>();
      for (const cat of categories) {
        for (const t of templates[cat] ?? []) {
          if (seen.has(t.title)) continue;
          seen.add(t.title);
          items.push({
            id: `cl${Date.now()}${items.length}`,
            programId,
            entityType,
            entityId,
            category: cat,
            title: t.title,
            description: t.description,
            status: "todo",
            isCustom: false,
            updatedAt: "Just now",
          });
        }
      }
      db.checklistItems.push(...items);
      return items;
    }),
  updateChecklistItem: (id: string, updates: Partial<ChecklistItem>) =>
    mutate((db) => {
      const item = db.checklistItems.find((x) => x.id === id);
      if (item) Object.assign(item, updates, { updatedAt: "Just now" });
      return item;
    }),
  addCustomChecklistItem: (
    entityType: "asset" | "url" | "endpoint",
    entityId: string,
    programId: string,
    title: string,
  ) =>
    mutate((db) => {
      const item: ChecklistItem = {
        id: `cl${Date.now()}`,
        programId,
        entityType,
        entityId,
        category: "custom",
        title,
        status: "todo",
        isCustom: true,
        updatedAt: "Just now",
      };
      db.checklistItems.push(item);
      return item;
    }),
  deleteChecklistItem: (id: string) =>
    mutate((db) => {
      db.checklistItems = db.checklistItems.filter((x) => x.id !== id);
      return id;
    }),

  entityRequests: async (entityType: EntityType, entityId: string) => {
    await wait();
    return readDb().evidenceRequests.filter(
      (r) => r.entityType === entityType && r.entityId === entityId,
    );
  },
  addEntityRequest: (request: Omit<EvidenceRequest, "id" | "createdAt">) =>
    mutate((db) => {
      const saved: EvidenceRequest = {
        ...request,
        id: `er${Date.now()}`,
        createdAt: "Just now",
      };
      db.evidenceRequests.push(saved);
      return saved;
    }),
  updateEntityRequest: (id: string, data: Partial<EvidenceRequest>) =>
    mutate((db) => {
      const r = db.evidenceRequests.find((x) => x.id === id);
      if (r) Object.assign(r, data, { updatedAt: "Just now" });
      return r;
    }),
  deleteEntityRequest: (id: string) =>
    mutate((db) => {
      db.evidenceRequests = db.evidenceRequests.filter((r) => r.id !== id);
      return id;
    }),

  scannerFindings: async (programId?: string) => {
    await wait();
    return readDb().scannerFindings.filter(
      (x) => !programId || x.programId === programId,
    );
  },
  discoveredEndpoints: async (programId?: string) => {
    await wait();
    return readDb().discoveredEndpoints.filter(
      (x) => !programId || x.programId === programId,
    );
  },
};

const qs = (values: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : "";
};
const now = () => new Date().toISOString();
const platformToApi = (value: Program["platform"]): ProgramDto["platform"] =>
  (
    ({
      HackerOne: "hackerone",
      Bugcrowd: "bugcrowd",
      YesWeHack: "yeswehack",
      Custom: "custom",
    }) as const
  )[value];
const platformFromApi = (value: ProgramDto["platform"]): Program["platform"] =>
  (
    ({
      hackerone: "HackerOne",
      bugcrowd: "Bugcrowd",
      yeswehack: "YesWeHack",
      custom: "Custom",
      manual: "Custom",
    }) as const
  )[value];
const mockProgramDto = (program: Program): ProgramDto => ({
  id: program.id,
  platform: platformToApi(program.platform),
  name: program.name,
  handle: null,
  programUrl: program.url || null,
  status: program.status,
  huntingStatus: program.hunting === "ongoing" ? "ongoing" : "not_hunting",
  intakeSource: program.intakeSource,
  rawPolicyText: program.rawPolicyText || null,
  policyHash: program.policyHash || null,
  lastSyncedAt: program.lastSyncedAt || null,
  createdAt: program.lastSyncedAt || now(),
  updatedAt: program.lastSyncedAt || now(),
  scopesCount: program.scopeCount,
  headersCount:
    readDb().rules.find((x) => x.programId === program.id)?.headers.length ?? 0,
  hasRules: Boolean(readDb().rules.find((x) => x.programId === program.id)),
});
const mockScopeDto = (scope: ScopeAsset): ProgramScopeDto => ({
  id: scope.id,
  programId: scope.programId,
  asset: scope.asset,
  normalizedAsset: scope.normalized,
  assetType: scope.type === "wildcard" ? "wildcard_domain" : scope.type,
  isInScope: scope.scope === "in_scope",
  bountyEligible: scope.bountyEligible,
  notes: scope.notes || null,
  createdAt: now(),
  updatedAt: now(),
});
const mockRulesDto = (rules: Rules): ProgramRulesDto => ({
  id: `rules-${rules.programId}`,
  programId: rules.programId,
  automationAllowed: rules.automation,
  aggressiveAllowed: rules.aggressive,
  rateLimitRps: rules.rateLimit || null,
  maxConcurrency: rules.concurrency || null,
  forbiddenActions: rules.forbidden,
  authTestingAllowed: rules.authTesting === "yes",
  dosTestingAllowed: rules.dosTesting,
  notes: rules.notes || null,
  createdAt: now(),
  updatedAt: now(),
});
const mockHeaderDto = (
  programId: string,
  header: Rules["headers"][number],
): ProgramHeaderDto => ({
  id: header.id,
  programId,
  name: header.name,
  value: header.value,
  isRequired: header.enabled,
  createdAt: now(),
  updatedAt: now(),
});
const mockScopeGuardSummary = async (
  programId: string,
): Promise<ScopeGuardSummary> => {
  await wait();
  const db = readDb();
  const program = db.programs.find((item) => item.id === programId);
  if (!program) throw new ApiError(404, "NOT_FOUND", "Program not found");
  const rules = db.rules.find((item) => item.programId === programId);
  const allowed =
    program.status === "active" && program.hunting === "ongoing"
      ? (["passive", "active_light", "active_medium"] as const)
      : [];
  return {
    programId,
    programStatus: program.status,
    huntingStatus: program.hunting === "ongoing" ? "ongoing" : "not_hunting",
    automationAllowed: rules?.automation ?? "unknown",
    aggressiveAllowed: rules?.aggressive ?? false,
    rateLimitRps: rules?.rateLimit || 3,
    maxConcurrency: rules?.concurrency || 2,
    inScopeCount: db.scopes.filter(
      (item) => item.programId === programId && item.scope === "in_scope",
    ).length,
    outOfScopeCount: db.scopes.filter(
      (item) => item.programId === programId && item.scope === "out_of_scope",
    ).length,
    requiredHeadersCount:
      rules?.headers.filter((item) => item.enabled).length ?? 0,
    forbiddenActions: rules?.forbidden ?? [],
    defaultAllowedStages: [...allowed],
    defaultBlockedStages: ["active_deep", "manual_approval", "blocked"],
    warnings:
      rules?.automation === "unknown" ? ["automation_permission_unknown"] : [],
  };
};
const mockScopeGuardPreflight = async (
  input: ScopeGuardPreflightInput,
): Promise<ScopeGuardPreflightResult> => {
  await wait();
  const db = readDb();
  const program = db.programs.find((item) => item.id === input.programId);
  const rules = db.rules.find((item) => item.programId === input.programId);
  let host = input.target.trim().toLowerCase();
  let scheme: string | null = null;
  let path: string | null = null;
  try {
    const url = new URL(host);
    scheme = url.protocol.slice(0, -1);
    host = url.hostname.toLowerCase();
    path = url.pathname;
  } catch {
    host = host.split(":")[0] ?? host;
  }
  const scopes = db.scopes.filter((item) => item.programId === input.programId);
  const matches = (scope: ScopeAsset) =>
    scope.type === "wildcard"
      ? host !== scope.normalized && host.endsWith(`.${scope.normalized}`)
      : host === scope.normalized ||
        input.target.toLowerCase().startsWith(scope.normalized.toLowerCase());
  const inScope = scopes.find(
    (item) => item.scope === "in_scope" && matches(item),
  );
  const outScope = scopes.find(
    (item) => item.scope === "out_of_scope" && matches(item),
  );
  const stage = input.stage ?? RECON_JOB_DEFAULT_STAGES[input.jobType];
  const manual = stage === "manual_approval";
  const blocked =
    !program ||
    program.status !== "active" ||
    program.hunting !== "ongoing" ||
    !inScope ||
    Boolean(outScope) ||
    (manual && !input.manualApproved) ||
    (stage !== "passive" && rules?.automation === "no");
  const decision = blocked
    ? "blocked"
    : rules?.automation === "unknown"
      ? "limited"
      : "allowed";
  const headers = (rules?.headers ?? []).map((item) => ({
    name: item.name,
    value: item.value,
    isRequired: item.enabled,
  }));
  return {
    decision,
    allowed: decision !== "blocked",
    programId: input.programId,
    target: input.target,
    normalizedTarget: {
      input: input.target,
      normalized: input.target.trim().toLowerCase(),
      host,
      scheme,
      port: null,
      path,
      type: scheme ? "url" : "host",
    },
    jobType: input.jobType,
    stage,
    matchedInScope: Boolean(inScope),
    matchedInScopeScopeId: inScope?.id ?? null,
    matchedOutOfScope: Boolean(outScope),
    matchedOutOfScopeScopeId: outScope?.id ?? null,
    scopeReasons: outScope
      ? ["target_out_of_scope"]
      : inScope
        ? ["target_in_scope"]
        : ["no_matching_in_scope_rule"],
    automationAllowed: rules?.automation ?? "unknown",
    manualApprovalRequired: manual,
    effectiveRateLimitRps: Math.min(
      rules?.rateLimit || 3,
      decision === "limited" ? 3 : Number.MAX_SAFE_INTEGER,
    ),
    effectiveMaxConcurrency: Math.min(
      rules?.concurrency || 2,
      decision === "limited" ? 2 : Number.MAX_SAFE_INTEGER,
    ),
    requiredHeaders: headers,
    effectiveHeaders: headers,
    allowedStages: ["passive", "active_light", "active_medium"],
    blockedStages: ["active_deep", "manual_approval", "blocked"],
    reasons: outScope
      ? ["target_out_of_scope"]
      : blocked
        ? ["scope_guard_blocked"]
        : decision === "limited"
          ? ["automation_unknown_conservative_limits"]
          : ["automation_allowed"],
  };
};
const mockJobDto = (job: ReconJob): JobDto => ({
  id: job.id,
  programId: job.programId,
  type: "http_probe",
  status: job.status as JobDto["status"],
  stage: "active_light",
  target: null,
  config: null,
  requestedByUserId: "mock-admin",
  manualApproved: false,
  scopeGuardDecision: null,
  error: job.error ?? null,
  createdAt: now(),
  updatedAt: now(),
  runs: [
    {
      id: `run-${job.id}`,
      jobId: job.id,
      programId: job.programId,
      type: "http_probe",
      status: job.status as JobDto["status"],
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      error: job.error ?? null,
      logs: job.logs.map((message) => ({
        timestamp: now(),
        level: "info",
        message,
      })),
      resultSummary: { simulated: true },
      createdAt: now(),
      updatedAt: now(),
      toolRuns: [],
    },
  ],
});
const mockUrlDto = (
  item: ReturnType<typeof readDb>["urls"][number],
): UrlDto => {
  let parsed: URL | null = null;
  try {
    parsed = new URL(item.url);
  } catch {}
  return {
    id: item.id,
    programId: item.programId,
    assetId: item.assetId,
    httpServiceId: null,
    url: item.url,
    normalizedUrl: item.url,
    scheme: parsed?.protocol.replace(":", "") ?? null,
    host: item.host,
    port: parsed?.port
      ? Number(parsed.port)
      : parsed?.protocol === "https:"
        ? 443
        : 80,
    path: parsed?.pathname ?? null,
    queryParamKeys: parsed ? [...parsed.searchParams.keys()] : [],
    title: item.title,
    statusCode: item.statusCode,
    contentType: null,
    contentLength: null,
    responseTimeMs: null,
    redirectLocation: null,
    technologies: [],
    server: null,
    categories: item.categories as UrlDto["categories"],
    reasonTags: item.reasons as UrlDto["reasonTags"],
    sourceTools: [item.source],
    scopeStatus: "in_scope",
    status: "new",
    autoScore: item.autoScore,
    manualScore: item.manualScore,
    finalScore: item.finalScore,
    priority: priorityFromScore(item.finalScore),
    confidence: 75,
    firstSeenAt: item.firstSeen,
    lastSeenAt: item.lastSeen,
    lastReviewedAt: null,
    createdAt: item.firstSeen,
    updatedAt: item.lastSeen,
  };
};
const mockEndpointDto = (
  item: ReturnType<typeof readDb>["discoveredEndpoints"][number],
): ApiEndpointDto => ({
  id: item.id,
  programId: item.programId,
  assetId: item.assetId,
  urlId: item.urlId ?? null,
  method: item.method,
  path: item.path,
  fullUrl: item.fullUrl,
  normalizedFullUrl: item.fullUrl,
  statusCode: item.statusCode ?? null,
  contentType: item.contentType ?? null,
  authRequired: item.authRequired,
  source: item.source,
  status: item.status,
  categories: item.categories as ApiEndpointDto["categories"],
  reasonTags: item.reasonTags as ApiEndpointDto["reasonTags"],
  autoScore: item.autoScore,
  manualScore: item.manualScore,
  finalScore: item.finalScore,
  priority: item.priority,
  confidence: item.confidence,
  notesCount: item.notesCount,
  firstSeenAt: item.firstSeenAt,
  lastSeenAt: item.lastSeenAt,
  createdAt: item.firstSeenAt,
  updatedAt: item.lastSeenAt,
  parametersCount: item.parameters.length,
  scannerFindingsCount: readDb().scannerFindings.filter(
    (f) => f.endpointId === item.id,
  ).length,
  parameters: item.parameters.map((p) => ({
    id: p.id,
    endpointId: item.id,
    name: p.name,
    location: p.location,
    exampleValue: p.exampleValue ?? null,
    source: p.source,
    interesting: p.interesting,
    frequency: p.frequency ?? null,
    createdAt: item.firstSeenAt,
    updatedAt: item.lastSeenAt,
  })),
});
const mockFindingDto = (
  item: ReturnType<typeof readDb>["scannerFindings"][number],
): ScannerFindingDto => ({
  id: item.id,
  programId: item.programId,
  assetId: item.assetId,
  urlId: item.urlId ?? null,
  endpointId: item.endpointId ?? null,
  tool: item.tool,
  severity: item.severity,
  templateId: item.templateId ?? null,
  name: item.name,
  description: item.description ?? null,
  matcher: item.matcher ?? null,
  matchedUrl: item.matchedUrl ?? null,
  evidenceSnippet: item.evidenceSnippet ?? null,
  extractedResults: item.extractedResults ?? null,
  status: item.status,
  firstSeenAt: item.firstSeenAt,
  lastSeenAt: item.lastSeenAt,
  createdAt: item.firstSeenAt,
  updatedAt: item.lastSeenAt,
});

export const coreApi = {
  login: (email: string, password: string) => authStore.login(email, password),
  logout: () => authStore.logout(),
  me: () => authStore.me(),
  getPrograms: async (filters: ProgramFilters = {}): Promise<ProgramDto[]> =>
    API_MODE === "http"
      ? request(`/programs${qs({ ...filters })}`)
      : api.programs().then((items) => items.map(mockProgramDto)),
  createProgram: async (input: CreateProgramInput): Promise<ProgramDto> => {
    if (API_MODE === "http")
      return request("/programs", {
        method: "POST",
        body: JSON.stringify(input),
      });
    return mutate((db) => {
      const id = `p${Date.now()}`;
      const timestamp = now();
      const program: Program = {
        id,
        name: input.name,
        platform: platformFromApi(input.platform),
        status: input.status ?? "active",
        hunting: input.huntingStatus ?? "ongoing",
        scopeCount: 0,
        schedules: 0,
        lastSync: "Never",
        lastRecon: "Never",
        url: input.programUrl ?? "",
        intakeSource: "manual_paste",
        rawPolicyText: input.rawPolicyText ?? "",
        policyHash: "",
        lastSyncedAt: timestamp,
        needsManualReview: false,
        confidence: 100,
      };
      db.programs.unshift(program);
      db.rules.push({
        programId: id,
        automation: "unknown",
        aggressive: false,
        rateLimit: 0,
        concurrency: 0,
        headers: [],
        forbidden: [],
        authTesting: "no",
        dosTesting: false,
        notes: "",
        validated: true,
      });
      return mockProgramDto(program);
    });
  },
  getProgram: async (id: string): Promise<ProgramDetailDto> => {
    if (API_MODE === "http") return request(`/programs/${id}`);
    await wait();
    const db = readDb();
    const program = db.programs.find((x) => x.id === id);
    if (!program) throw new ApiError(404, "NOT_FOUND", "Program not found");
    const rules = db.rules.find((x) => x.programId === id);
    return {
      ...mockProgramDto(program),
      scopes: db.scopes.filter((x) => x.programId === id).map(mockScopeDto),
      rules: rules ? mockRulesDto(rules) : null,
      headers: (rules?.headers ?? []).map((x) => mockHeaderDto(id, x)),
    };
  },
  updateProgram: async (
    id: string,
    input: UpdateProgramInput,
  ): Promise<ProgramDto> => {
    if (API_MODE === "http")
      return request(`/programs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    return mutate((db) => {
      const program = db.programs.find((x) => x.id === id);
      if (!program) throw new ApiError(404, "NOT_FOUND", "Program not found");
      if (input.name !== undefined) program.name = input.name;
      if (input.programUrl !== undefined) program.url = input.programUrl;
      if (input.status !== undefined) program.status = input.status;
      if (input.huntingStatus !== undefined)
        program.hunting = input.huntingStatus;
      return mockProgramDto(program);
    });
  },
  archiveProgram: async (id: string): Promise<ProgramDto> =>
    API_MODE === "http"
      ? request(`/programs/${id}`, { method: "DELETE" })
      : coreApi.updateProgram(id, {
          status: "archived",
          huntingStatus: "not_hunting",
        }),
  getProgramScopes: async (id: string): Promise<ProgramScopeDto[]> =>
    API_MODE === "http"
      ? request(`/programs/${id}/scopes`)
      : api.scopes(id).then((items) => items.map(mockScopeDto)),
  createProgramScope: async (
    programId: string,
    input: CreateScopeInput,
  ): Promise<ProgramScopeDto> => {
    if (API_MODE === "http")
      return request(`/programs/${programId}/scopes`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    const item: ScopeAsset = {
      id: `s${Date.now()}`,
      programId,
      asset: input.asset,
      normalized: input.asset.trim().toLowerCase().replace(/\/$/, ""),
      type:
        input.assetType === "wildcard_domain"
          ? "wildcard"
          : input.assetType === "subdomain" ||
              input.assetType === "api" ||
              input.assetType === "other"
            ? "domain"
            : input.assetType,
      scope: input.isInScope ? "in_scope" : "out_of_scope",
      bountyEligible: input.bountyEligible,
      notes: input.notes ?? "",
    };
    return mockScopeDto(await api.saveScope(item));
  },
  updateProgramScope: async (
    programId: string,
    scopeId: string,
    input: UpdateScopeInput,
  ): Promise<ProgramScopeDto> => {
    if (API_MODE === "http")
      return request(`/programs/${programId}/scopes/${scopeId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    const current = readDb().scopes.find((x) => x.id === scopeId);
    if (!current) throw new ApiError(404, "NOT_FOUND", "Scope not found");
    const next = {
      ...current,
      asset: input.asset ?? current.asset,
      normalized:
        input.asset?.trim().toLowerCase().replace(/\/$/, "") ??
        current.normalized,
      type: input.assetType === "wildcard_domain" ? "wildcard" : current.type,
      scope:
        input.isInScope === undefined
          ? current.scope
          : input.isInScope
            ? "in_scope"
            : "out_of_scope",
      bountyEligible: input.bountyEligible ?? current.bountyEligible,
      notes: input.notes ?? current.notes,
    };
    return mockScopeDto(await api.saveScope(next));
  },
  deleteProgramScope: async (
    programId: string,
    scopeId: string,
  ): Promise<{ success: boolean }> => {
    if (API_MODE === "http")
      return request(`/programs/${programId}/scopes/${scopeId}`, {
        method: "DELETE",
      });
    await api.deleteScope(scopeId);
    return { success: true };
  },
  getProgramRules: async (id: string): Promise<ProgramRulesDto> => {
    if (API_MODE === "http") return request(`/programs/${id}/rules`);
    const rules = await api.rules(id);
    if (!rules) throw new ApiError(404, "NOT_FOUND", "Rules not found");
    return mockRulesDto(rules);
  },
  updateProgramRules: async (
    id: string,
    input: UpdateRulesInput,
  ): Promise<ProgramRulesDto> => {
    if (API_MODE === "http")
      return request(`/programs/${id}/rules`, {
        method: "PUT",
        body: JSON.stringify(input),
      });
    const current = readDb().rules.find((x) => x.programId === id);
    const rules: Rules = {
      programId: id,
      automation: input.automationAllowed,
      aggressive: input.aggressiveAllowed,
      rateLimit: input.rateLimitRps ?? 0,
      concurrency: input.maxConcurrency ?? 0,
      headers: current?.headers ?? [],
      forbidden: input.forbiddenActions ?? [],
      authTesting: input.authTestingAllowed ? "yes" : "no",
      dosTesting: input.dosTestingAllowed,
      notes: input.notes ?? "",
      validated: true,
    };
    return mockRulesDto(await api.saveRules(rules));
  },
  getProgramHeaders: async (id: string): Promise<ProgramHeaderDto[]> => {
    if (API_MODE === "http") return request(`/programs/${id}/headers`);
    const rules = await api.rules(id);
    return (rules?.headers ?? []).map((x) => mockHeaderDto(id, x));
  },
  createProgramHeader: async (
    id: string,
    input: CreateHeaderInput,
  ): Promise<ProgramHeaderDto> => {
    if (API_MODE === "http")
      return request(`/programs/${id}/headers`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    const rules = await api.rules(id);
    if (!rules) throw new ApiError(404, "NOT_FOUND", "Rules not found");
    const header = {
      id: `h${Date.now()}`,
      name: input.name,
      value: input.value,
      enabled: input.isRequired,
    };
    await api.saveRules({ ...rules, headers: [...rules.headers, header] });
    return mockHeaderDto(id, header);
  },
  updateProgramHeader: async (
    id: string,
    headerId: string,
    input: UpdateHeaderInput,
  ): Promise<ProgramHeaderDto> => {
    if (API_MODE === "http")
      return request(`/programs/${id}/headers/${headerId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    const rules = await api.rules(id);
    const header = rules?.headers.find((x) => x.id === headerId);
    if (!rules || !header)
      throw new ApiError(404, "NOT_FOUND", "Header not found");
    Object.assign(header, {
      name: input.name ?? header.name,
      value: input.value ?? header.value,
      enabled: input.isRequired ?? header.enabled,
    });
    await api.saveRules(rules);
    return mockHeaderDto(id, header);
  },
  deleteProgramHeader: async (
    id: string,
    headerId: string,
  ): Promise<{ success: boolean }> => {
    if (API_MODE === "http")
      return request(`/programs/${id}/headers/${headerId}`, {
        method: "DELETE",
      });
    const rules = await api.rules(id);
    if (rules)
      await api.saveRules({
        ...rules,
        headers: rules.headers.filter((x) => x.id !== headerId),
      });
    return { success: true };
  },
  getSettings: async (): Promise<Record<string, unknown>> => {
    if (API_MODE === "http") return request("/settings");
    const [settings, notifications] = await Promise.all([
      api.settings(),
      api.notifications(),
    ]);
    return {
      "ai.enabled": false,
      "ai.provider": "deepseek",
      "ai.monthlyLimit": 100,
      "ai.intakeFallbackThreshold": 70,
      "deepseek.model": "deepseek-v4-flash",
      "deepseek.apiKey": "",
      "deepseek.baseUrl": "https://api.deepseek.com",
      "deepseek.timeoutMs": 30000,
      "telegram.enabled": true,
      "telegram.botToken": notifications.token,
      "telegram.chatId": notifications.chatId,
      "default.rateLimitRps": settings.defaultRps,
      "default.maxConcurrency": settings.maxConcurrency,
      "artifact.retentionDays": 30,
      "recon.snapshotRetentionDays": 90,
    };
  },
  updateSetting: async (
    key: string,
    value: unknown,
  ): Promise<{ key: string; value: unknown }> => {
    if (API_MODE === "http")
      return request(`/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
    const settings = await api.settings();
    const notifications = await api.notifications();
    if (key === "default.rateLimitRps")
      await api.saveSettings({ ...settings, defaultRps: Number(value) });
    else if (key === "default.maxConcurrency")
      await api.saveSettings({ ...settings, maxConcurrency: Number(value) });
    else if (key === "telegram.botToken")
      await api.saveNotifications({ ...notifications, token: String(value) });
    else if (key === "telegram.chatId")
      await api.saveNotifications({ ...notifications, chatId: String(value) });
    return { key, value };
  },
  testTelegramNotification: async (): Promise<{ success: boolean }> =>
    API_MODE === "http"
      ? request("/notifications/test-telegram", { method: "POST" })
      : api.testTelegram().then(() => ({ success: true })),
  getAuditLogs: async (filters: AuditFilters = {}): Promise<AuditLogDto[]> =>
    API_MODE === "http" ? request(`/audit-logs${qs({ ...filters })}`) : [],
  getScopeGuardSummary: async (
    programId: string,
  ): Promise<ScopeGuardSummary> =>
    API_MODE === "http"
      ? request(`/programs/${programId}/scope-guard/summary`)
      : mockScopeGuardSummary(programId),
  runScopeGuardPreflight: async (
    input: ScopeGuardPreflightInput,
  ): Promise<ScopeGuardPreflightResult> =>
    API_MODE === "http"
      ? request("/scope-guard/preflight", {
          method: "POST",
          body: JSON.stringify(input),
        })
      : mockScopeGuardPreflight(input),
  runBulkScopeGuardPreflight: async (
    programId: string,
    input: BulkScopeGuardPreflightInput,
  ): Promise<ScopeGuardPreflightResult[]> =>
    API_MODE === "http"
      ? request(`/programs/${programId}/scope-guard/bulk-preflight`, {
          method: "POST",
          body: JSON.stringify(input),
        })
      : Promise.all(
          input.targets.map((target) =>
            mockScopeGuardPreflight({
              programId,
              target,
              jobType: input.jobType,
              stage: input.stage,
              manualApproved: input.manualApproved,
            }),
          ),
        ),
  getJobs: async (filters: JobFilters = {}): Promise<JobDto[]> =>
    API_MODE === "http"
      ? request(`/jobs${qs({ ...filters })}`)
      : api.jobs(filters.programId).then((items) => items.map(mockJobDto)),
  createJob: async (input: CreateJobRequest): Promise<JobDto> => {
    if (API_MODE === "http")
      return request("/jobs", { method: "POST", body: JSON.stringify(input) });
    const item = await api.runJob(input.type, input.programId);
    return mockJobDto(item);
  },
  getJob: async (id: string): Promise<JobDto> => {
    if (API_MODE === "http") return request(`/jobs/${id}`);
    const item = (await api.jobs()).find((job) => job.id === id);
    if (!item) throw new ApiError(404, "NOT_FOUND", "Job not found");
    return mockJobDto(item);
  },
  getJobLogs: async (id: string): Promise<JobLogsDto> => {
    if (API_MODE === "http") return request(`/jobs/${id}/logs`);
    const item = (await api.jobs()).find((job) => job.id === id);
    if (!item) throw new ApiError(404, "NOT_FOUND", "Job not found");
    return {
      jobId: id,
      jobRunId: `run-${id}`,
      logs: item.logs.map((message) => ({
        timestamp: now(),
        level: "info",
        message,
      })),
    };
  },
  cancelJob: async (id: string): Promise<JobDto> => {
    if (API_MODE === "http")
      return request(`/jobs/${id}/cancel`, { method: "POST" });
    const item = await api.cancelJob(id);
    if (!item) throw new ApiError(404, "NOT_FOUND", "Job not found");
    return mockJobDto(item);
  },
  retryJob: async (id: string, input: RetryJobInput = {}): Promise<JobDto> =>
    API_MODE === "http"
      ? request(`/jobs/${id}/retry`, {
          method: "POST",
          body: JSON.stringify(input),
        })
      : coreApi.getJob(id),
  getJobQueueHealth: async (): Promise<JobQueueHealthDto> =>
    API_MODE === "http"
      ? request("/jobs/queue/health")
      : {
          queueName: "recon-jobs",
          redis: "ok",
          counts: {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
          },
          timestamp: now(),
        },
  getAssets: async (
    filters: AssetInventoryFilters = {},
  ): Promise<AssetDto[]> => {
    if (API_MODE === "http") return request(`/assets${qs({ ...filters })}`);
    return api.assets(filters.programId).then((items) =>
      items.map(
        (item) =>
          ({
            id: item.id,
            programId: item.programId,
            type:
              item.type === "domain"
                ? "root_domain"
                : item.type === "subdomain"
                  ? "subdomain"
                  : "host",
            value: item.value,
            normalizedValue: item.value.toLowerCase(),
            parentAssetId: null,
            scopeStatus: item.scope,
            status: item.status,
            autoScore: item.autoScore,
            manualScore: item.manualScore,
            finalScore: item.finalScore,
            priority: priorityFromScore(item.finalScore),
            confidence: 80,
            categories: item.categories,
            reasonTags: item.reasons,
            sourceTools: [],
            firstSeenAt: item.firstSeen,
            lastSeenAt: item.lastSeen,
            lastChangedAt: null,
            createdAt: item.firstSeen,
            updatedAt: item.lastSeen,
          }) as AssetDto,
      ),
    );
  },
  getAsset: async (id: string): Promise<AssetDetailResponse> =>
    API_MODE === "http"
      ? request(`/assets/${id}`)
      : coreApi.getAssets().then((items) => {
          const asset = items.find((item) => item.id === id);
          if (!asset) throw new ApiError(404, "NOT_FOUND", "Asset not found");
          const db = readDb();
          return {
            asset,
            dnsRecords: [],
            httpServices: [],
            urlsCount: db.urls.filter((item) => item.assetId === id).length,
            endpointsCount: db.discoveredEndpoints.filter(
              (item) => item.assetId === id,
            ).length,
            scannerFindingsCount: db.scannerFindings.filter(
              (item) => item.assetId === id,
            ).length,
            changes: [],
          };
        }),
  getAssetDetail: async (id: string): Promise<AssetDetailResponse> =>
    coreApi.getAsset(id),
  getAssetDnsRecords: async (id: string): Promise<DnsRecordDto[]> =>
    API_MODE === "http" ? request(`/assets/${id}/dns-records`) : [],
  getAssetHttpServices: async (id: string): Promise<HttpServiceDto[]> =>
    API_MODE === "http" ? request(`/assets/${id}/http-services`) : [],
  getAssetChanges: async (id: string): Promise<EntityChangeDto[]> =>
    API_MODE === "http" ? request(`/assets/${id}/changes`) : [],
  getAssetUrls: async (
    id: string,
    filters: Omit<UrlFilters, "assetId"> = {},
  ): Promise<UrlDto[]> =>
    API_MODE === "http"
      ? request(`/assets/${id}/urls${qs({ ...filters })}`)
      : coreApi.getUrls({ assetId: id, ...filters }),
  getAssetEndpoints: async (
    id: string,
    filters: Omit<EndpointFilters, "assetId"> = {},
  ): Promise<ApiEndpointDto[]> =>
    API_MODE === "http"
      ? request(`/assets/${id}/endpoints${qs({ ...filters })}`)
      : coreApi.getEndpoints({ assetId: id, ...filters }),
  getAssetScannerFindings: async (
    id: string,
    filters: Omit<ScannerFindingFilters, "assetId"> = {},
  ): Promise<ScannerFindingDto[]> =>
    API_MODE === "http"
      ? request(`/assets/${id}/scanner-findings${qs({ ...filters })}`)
      : coreApi.getScannerFindings({ assetId: id, ...filters }),
  getHttpServices: async (
    filters: LiveHostFilters = {},
  ): Promise<HttpServiceDto[]> => {
    if (API_MODE === "http")
      return request(`/http-services${qs({ ...filters })}`);
    return api.services(filters.programId).then((items) =>
      items.map((item) => ({
        id: item.id,
        programId: item.programId,
        assetId: item.assetId,
        url: `${item.protocol}://${item.host}:${item.port}`,
        normalizedUrl: `${item.protocol}://${item.host}:${item.port}`,
        scheme: item.protocol,
        host: item.host,
        port: item.port,
        statusCode: item.status,
        title: item.title,
        webserver: null,
        technologies: item.technologies,
        contentLength: null,
        responseTimeMs: null,
        contentType: null,
        location: null,
        cdnName: null,
        failed: false,
        sourceTool: "mock",
        firstSeenAt: now(),
        lastSeenAt: now(),
        createdAt: now(),
        updatedAt: now(),
      })),
    );
  },
  getToolHealth: async (): Promise<ToolHealthDto[]> =>
    API_MODE === "http"
      ? request("/tools/health")
      : [
          "subfinder",
          "dnsx",
          "httpx",
          "gau",
          "waybackurls",
          "katana",
          "nuclei",
        ].map((name) => ({
          name: name as ToolHealthDto["name"],
          available: false,
          version: null,
          error: "Mock mode",
        })),
  getUrls: async (filters: UrlFilters = {}): Promise<UrlDto[]> =>
    API_MODE === "http"
      ? request(`/urls${qs({ ...filters })}`)
      : api
          .urls(filters.programId)
          .then((items) =>
            items
              .filter(
                (item) => !filters.assetId || item.assetId === filters.assetId,
              )
              .map(mockUrlDto),
          ),
  getUrlDetail: async (id: string): Promise<UrlDetailDto> => {
    if (API_MODE === "http") return request(`/urls/${id}`);
    const url = (await coreApi.getUrls()).find((item) => item.id === id);
    if (!url) throw new ApiError(404, "NOT_FOUND", "URL not found");
    const asset =
      (await coreApi.getAssets()).find((item) => item.id === url.assetId) ??
      null;
    const endpoints = await coreApi.getEndpoints({ urlId: id });
    const scannerFindings = await coreApi.getScannerFindings({ urlId: id });
    return {
      url,
      asset,
      httpService: null,
      endpoints,
      scannerFindings,
      parameters: endpoints.flatMap((item) => item.parameters ?? []),
      changes: [],
      scoreExplanation: await coreApi.getUrlScoreExplanation(id),
    };
  },
  createUrl: async (input: CreateUrlInput): Promise<UrlDto> => {
    if (API_MODE === "http")
      return request("/urls", { method: "POST", body: JSON.stringify(input) });
    const item = await mutate((db) => {
      const saved = {
        id: `u${Date.now()}`,
        assetId: input.assetId ?? "",
        programId: input.programId,
        url: input.url,
        host: new URL(input.url).hostname,
        statusCode: input.statusCode ?? 200,
        title: input.title ?? "Manual URL",
        categories: [],
        reasons: ["new_asset"],
        autoScore: 2,
        manualScore: null,
        finalScore: 2,
        scoreEvents: [],
        source: "manual",
        firstSeen: now(),
        lastSeen: now(),
      };
      db.urls.unshift(saved);
      return saved;
    });
    return mockUrlDto(item);
  },
  updateUrlStatus: async (id: string, status: AssetStatus): Promise<UrlDto> => {
    if (API_MODE === "http")
      return request(`/urls/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    const item = await mutate((db) => {
      const url = db.urls.find((value) => value.id === id);
      if (url) url.interesting = status === "promising";
      return url;
    });
    if (!item) throw new ApiError(404, "NOT_FOUND", "URL not found");
    return mockUrlDto(item);
  },
  updateUrlManualScore: async (
    id: string,
    manualScore: number | null,
  ): Promise<UrlDto> => {
    if (API_MODE === "http")
      return request(`/urls/${id}/manual-score`, {
        method: "PATCH",
        body: JSON.stringify({ manualScore }),
      });
    const item = await mutate((db) => {
      const url = db.urls.find((value) => value.id === id);
      if (url) {
        url.manualScore = manualScore;
        url.finalScore = manualScore ?? url.autoScore;
      }
      return url;
    });
    if (!item) throw new ApiError(404, "NOT_FOUND", "URL not found");
    return mockUrlDto(item);
  },
  getUrlScoreExplanation: async (id: string): Promise<ScoreExplanationDto> => {
    if (API_MODE === "http") return request(`/urls/${id}/score-explanation`);
    const item = (await coreApi.getUrls()).find((value) => value.id === id);
    if (!item) throw new ApiError(404, "NOT_FOUND", "URL not found");
    return {
      entityType: "url",
      entityId: id,
      autoScore: item.autoScore,
      manualScore: item.manualScore,
      finalScore: item.finalScore,
      priority: item.priority,
      confidence: item.confidence,
      categories: item.categories ?? [],
      reasonTags: item.reasonTags ?? [],
      events: [],
    };
  },
  getEndpoints: async (
    filters: EndpointFilters = {},
  ): Promise<ApiEndpointDto[]> =>
    API_MODE === "http"
      ? request(`/endpoints${qs({ ...filters })}`)
      : api
          .discoveredEndpoints(filters.programId)
          .then((items) =>
            items
              .filter(
                (item) =>
                  (!filters.assetId || item.assetId === filters.assetId) &&
                  (!filters.urlId || item.urlId === filters.urlId),
              )
              .map(mockEndpointDto),
          ),
  getEndpointDetail: async (id: string): Promise<ApiEndpointDetailDto> => {
    if (API_MODE === "http") return request(`/endpoints/${id}`);
    const endpoint = (await coreApi.getEndpoints()).find(
      (item) => item.id === id,
    );
    if (!endpoint) throw new ApiError(404, "NOT_FOUND", "Endpoint not found");
    return {
      endpoint,
      asset:
        (await coreApi.getAssets()).find(
          (item) => item.id === endpoint.assetId,
        ) ?? null,
      url: endpoint.urlId
        ? ((await coreApi.getUrls()).find(
            (item) => item.id === endpoint.urlId,
          ) ?? null)
        : null,
      parameters: endpoint.parameters ?? [],
      scannerFindings: await coreApi.getScannerFindings({ endpointId: id }),
      changes: [],
      scoreExplanation: await coreApi.getEndpointScoreExplanation(id),
    };
  },
  createEndpoint: async (
    input: CreateEndpointInput,
  ): Promise<ApiEndpointDto> => {
    if (API_MODE === "http")
      return request("/endpoints", {
        method: "POST",
        body: JSON.stringify(input),
      });
    throw new ApiError(
      501,
      "NOT_IMPLEMENTED",
      "Mock endpoint creation is not implemented",
    );
  },
  updateEndpointStatus: async (
    id: string,
    status: AssetStatus,
  ): Promise<ApiEndpointDto> => {
    if (API_MODE === "http")
      return request(`/endpoints/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    await api.updateEndpointStatus(id, status);
    const item = (await coreApi.getEndpoints()).find(
      (value) => value.id === id,
    );
    if (!item) throw new ApiError(404, "NOT_FOUND", "Endpoint not found");
    return item;
  },
  updateEndpointManualScore: async (
    id: string,
    manualScore: number | null,
  ): Promise<ApiEndpointDto> => {
    if (API_MODE === "http")
      return request(`/endpoints/${id}/manual-score`, {
        method: "PATCH",
        body: JSON.stringify({ manualScore }),
      });
    await api.updateEndpointManualScore(id, manualScore);
    const item = (await coreApi.getEndpoints()).find(
      (value) => value.id === id,
    );
    if (!item) throw new ApiError(404, "NOT_FOUND", "Endpoint not found");
    return item;
  },
  getEndpointScoreExplanation: async (
    id: string,
  ): Promise<ScoreExplanationDto> => {
    if (API_MODE === "http")
      return request(`/endpoints/${id}/score-explanation`);
    const item = (await coreApi.getEndpoints()).find(
      (value) => value.id === id,
    );
    if (!item) throw new ApiError(404, "NOT_FOUND", "Endpoint not found");
    return {
      entityType: "endpoint",
      entityId: id,
      autoScore: item.autoScore,
      manualScore: item.manualScore,
      finalScore: item.finalScore,
      priority: item.priority,
      confidence: item.confidence,
      categories: item.categories ?? [],
      reasonTags: item.reasonTags ?? [],
      events: [],
    };
  },
  getScannerFindings: async (
    filters: ScannerFindingFilters = {},
  ): Promise<ScannerFindingDto[]> =>
    API_MODE === "http"
      ? request(`/scanner-findings${qs({ ...filters })}`)
      : api
          .scannerFindings(filters.programId)
          .then((items) =>
            items
              .filter(
                (item) =>
                  (!filters.assetId || item.assetId === filters.assetId) &&
                  (!filters.urlId || item.urlId === filters.urlId) &&
                  (!filters.endpointId ||
                    item.endpointId === filters.endpointId),
              )
              .map(mockFindingDto),
          ),
  getScannerFindingDetail: async (
    id: string,
  ): Promise<ScannerFindingDetailDto> => {
    if (API_MODE === "http") return request(`/scanner-findings/${id}`);
    const finding = (await coreApi.getScannerFindings()).find(
      (item) => item.id === id,
    );
    if (!finding)
      throw new ApiError(404, "NOT_FOUND", "Scanner finding not found");
    return {
      finding,
      asset:
        (await coreApi.getAssets()).find(
          (item) => item.id === finding.assetId,
        ) ?? null,
      url: finding.urlId
        ? ((await coreApi.getUrls()).find(
            (item) => item.id === finding.urlId,
          ) ?? null)
        : null,
      endpoint: finding.endpointId
        ? ((await coreApi.getEndpoints()).find(
            (item) => item.id === finding.endpointId,
          ) ?? null)
        : null,
      changes: [],
      relatedScoreEvents: [],
    };
  },
  createScannerFinding: async (
    input: CreateScannerFindingInput,
  ): Promise<ScannerFindingDto> => {
    if (API_MODE === "http")
      return request("/scanner-findings", {
        method: "POST",
        body: JSON.stringify(input),
      });
    throw new ApiError(
      501,
      "NOT_IMPLEMENTED",
      "Mock finding creation is not implemented",
    );
  },
  updateScannerFindingStatus: async (
    id: string,
    status: CoreScannerFindingStatus,
  ): Promise<ScannerFindingDto> => {
    if (API_MODE === "http")
      return request(`/scanner-findings/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    await api.updateFindingStatus(id, status as never);
    const item = (await coreApi.getScannerFindings()).find(
      (value) => value.id === id,
    );
    if (!item)
      throw new ApiError(404, "NOT_FOUND", "Scanner finding not found");
    return item;
  },
  getScoreExplanation: async (id: string): Promise<ScoreExplanationDto> => {
    if (API_MODE === "http") return request(`/assets/${id}/score-explanation`);
    const asset = (await coreApi.getAssets()).find((item) => item.id === id);
    if (!asset) throw new ApiError(404, "NOT_FOUND", "Asset not found");
    return {
      entityType: "asset",
      entityId: id,
      autoScore: asset.autoScore,
      manualScore: asset.manualScore,
      finalScore: asset.finalScore,
      priority: asset.priority,
      confidence: asset.confidence,
      categories: (asset.categories ?? []) as ScoreExplanationDto["categories"],
      reasonTags: (asset.reasonTags ?? []) as ScoreExplanationDto["reasonTags"],
      events: (asset.reasonTags ?? []).map((reasonTag) => ({
        ruleId: null,
        ruleName: null,
        reasonTag: reasonTag as ScoreExplanationDto["reasonTags"][number],
        scoreDelta: 0,
        matched: true,
        evidence: null,
      })),
    };
  },
  updateAssetManualScore: async (
    id: string,
    manualScore: number | null,
  ): Promise<AssetDto> => {
    if (API_MODE === "http")
      return request(`/assets/${id}/manual-score`, {
        method: "PATCH",
        body: JSON.stringify({ manualScore }),
      });
    await api.updateAssetManualScore(id, manualScore);
    const asset = (await coreApi.getAssets()).find((item) => item.id === id);
    if (!asset) throw new ApiError(404, "NOT_FOUND", "Asset not found");
    return asset;
  },
  getScoringRules: async (): Promise<ScoringConfigDto> => {
    if (API_MODE === "http") return request("/scoring/rules");
    const rawYaml =
      "version: 1\npriorityThresholds:\n  P1: 15\n  P2: 8\n  Monitor: 3\nrules: []\n";
    return {
      version: 1,
      priorityThresholds: { P1: 15, P2: 8, Monitor: 3 },
      rules: [],
      rawYaml,
    };
  },
  updateScoringRules: async (yaml: string): Promise<ScoringConfigDto> =>
    API_MODE === "http"
      ? request("/scoring/rules", {
          method: "PUT",
          body: JSON.stringify({ yaml }),
        })
      : {
          version: 1,
          priorityThresholds: { P1: 15, P2: 8, Monitor: 3 },
          rules: [],
          rawYaml: yaml,
        },
  previewScoring: async (
    input: ScoringPreviewRequest,
  ): Promise<ScoringPreviewResponse> => {
    if (API_MODE === "http")
      return request("/scoring/preview", {
        method: "POST",
        body: JSON.stringify(input),
      });
    const text =
      `${input.host ?? ""} ${input.url ?? ""} ${input.title ?? ""}`.toLowerCase();
    const scoreEvents: ScoringPreviewResponse["scoreEvents"] = [];
    if (text.includes("api"))
      scoreEvents.push({
        ruleId: "api_host",
        ruleName: "API host",
        reasonTag: "api_host",
        scoreDelta: 4,
        matched: true,
        evidence: { host: input.host ?? null },
      });
    if (text.includes("graphql"))
      scoreEvents.push({
        ruleId: "graphql_detected",
        ruleName: "GraphQL detected",
        reasonTag: "graphql_detected",
        scoreDelta: 10,
        matched: true,
        evidence: { url: input.url ?? null },
      });
    const autoScore = Math.max(
      0,
      scoreEvents.reduce((sum, item) => sum + item.scoreDelta, 0),
    );
    return {
      categories: scoreEvents.map((item) =>
        item.reasonTag === "graphql_detected" ? "graphql" : "api",
      ),
      reasonTags: scoreEvents.map((item) => item.reasonTag),
      scoreEvents,
      autoScore,
      priority: priorityFromScore(autoScore),
      confidence: scoreEvents.length > 1 ? 90 : scoreEvents.length ? 75 : 25,
    };
  },
  getWorkspaceSummary: async (
    entityType: WorkspaceEntityType,
    entityId: string,
  ): Promise<EntityWorkspaceSummaryDto> =>
    API_MODE === "http"
      ? request(`/workspace/${entityType}/${entityId}/summary`)
      : {
          entityType,
          entityId,
          programId: "mock",
          status: null,
          notesCount: 0,
          checklist: { total: 0, done: 0, todo: 0, inProgress: 0, skipped: 0 },
          evidenceCount: 0,
          interestingRequestsCount: 0,
          latestStatusTransition: null,
        },
  getWorkspaceNotes: async (
    entityType: WorkspaceEntityType,
    entityId: string,
  ): Promise<ResearchNoteDto[]> =>
    API_MODE === "http"
      ? request(`/workspace/${entityType}/${entityId}/notes`)
      : [],
  createWorkspaceNote: async (
    entityType: WorkspaceEntityType,
    entityId: string,
    payload: CreateResearchNoteRequest,
  ): Promise<ResearchNoteDto> =>
    request(`/workspace/${entityType}/${entityId}/notes`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateWorkspaceNote: async (
    noteId: string,
    payload: UpdateResearchNoteRequest,
  ): Promise<ResearchNoteDto> =>
    request(`/workspace/notes/${noteId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteWorkspaceNote: async (noteId: string): Promise<void> =>
    request(`/workspace/notes/${noteId}`, { method: "DELETE" }),
  getWorkspaceChecklists: async (
    entityType: WorkspaceEntityType,
    entityId: string,
  ): Promise<ManualChecklistDto[]> =>
    API_MODE === "http"
      ? request(`/workspace/${entityType}/${entityId}/checklists`)
      : [],
  generateWorkspaceChecklist: async (
    entityType: WorkspaceEntityType,
    entityId: string,
  ): Promise<ManualChecklistDto> =>
    request(`/workspace/${entityType}/${entityId}/checklists/generate`, {
      method: "POST",
    }),
  createWorkspaceChecklist: async (
    entityType: WorkspaceEntityType,
    entityId: string,
    payload: CreateChecklistRequest,
  ): Promise<ManualChecklistDto> =>
    request(`/workspace/${entityType}/${entityId}/checklists`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getChecklistItems: async (
    checklistId: string,
  ): Promise<ChecklistItemDto[]> =>
    API_MODE === "http"
      ? request(`/workspace/checklists/${checklistId}/items`)
      : [],
  createChecklistItem: async (
    checklistId: string,
    payload: CreateChecklistItemRequest,
  ): Promise<ChecklistItemDto> =>
    request(`/workspace/checklists/${checklistId}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateChecklistItem: async (
    itemId: string,
    payload: UpdateChecklistItemRequest,
  ): Promise<ChecklistItemDto> =>
    request(`/workspace/checklist-items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteChecklistItem: async (itemId: string): Promise<void> =>
    request(`/workspace/checklist-items/${itemId}`, { method: "DELETE" }),
  getInterestingRequests: async (
    entityType: WorkspaceEntityType,
    entityId: string,
  ): Promise<InterestingRequestDto[]> =>
    API_MODE === "http"
      ? request(`/workspace/${entityType}/${entityId}/interesting-requests`)
      : [],
  createInterestingRequest: async (
    entityType: WorkspaceEntityType,
    entityId: string,
    payload: CreateInterestingRequestRequest,
  ): Promise<InterestingRequestDto> =>
    request(`/workspace/${entityType}/${entityId}/interesting-requests`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateInterestingRequest: async (
    requestId: string,
    payload: Partial<CreateInterestingRequestRequest>,
  ): Promise<InterestingRequestDto> =>
    request(`/workspace/interesting-requests/${requestId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteInterestingRequest: async (requestId: string): Promise<void> =>
    request(`/workspace/interesting-requests/${requestId}`, {
      method: "DELETE",
    }),
  getEvidenceItems: async (
    entityType: WorkspaceEntityType,
    entityId: string,
  ): Promise<EvidenceItemDto[]> =>
    API_MODE === "http"
      ? request(`/workspace/${entityType}/${entityId}/evidence`)
      : [],
  createEvidenceItem: async (
    entityType: WorkspaceEntityType,
    entityId: string,
    payload: CreateEvidenceItemRequest,
  ): Promise<EvidenceItemDto> =>
    request(`/workspace/${entityType}/${entityId}/evidence`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEvidenceItem: async (
    evidenceId: string,
    payload: Partial<CreateEvidenceItemRequest>,
  ): Promise<EvidenceItemDto> =>
    request(`/workspace/evidence/${evidenceId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteEvidenceItem: async (evidenceId: string): Promise<void> =>
    request(`/workspace/evidence/${evidenceId}`, { method: "DELETE" }),
  updateWorkspaceStatus: async (
    entityType: WorkspaceEntityType,
    entityId: string,
    status: string,
    reason?: string,
  ): Promise<{
    entityType: WorkspaceEntityType;
    entityId: string;
    oldStatus: string | null;
    status: string;
  }> =>
    request(`/workspace/${entityType}/${entityId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason }),
    }),
  getManualReviewQueue: async (
    filters: Pick<
      AssetInventoryFilters,
      "programId" | "minScore" | "status" | "limit"
    > = {},
  ): Promise<AssetDto[]> =>
    API_MODE === "http"
      ? request(`/manual-review/queue${qs({ ...filters })}`)
      : coreApi
          .getAssets({ ...filters })
          .then((items) =>
            items.filter(
              (item) =>
                item.scopeStatus === "in_scope" &&
                item.finalScore >= (filters.minScore ?? 8),
            ),
          ),
  getProgramSchedules: async (
    programId: string,
  ): Promise<ReconScheduleDto[]> =>
    API_MODE === "http" ? request(`/programs/${programId}/schedules`) : [],
  createProgramSchedule: async (
    programId: string,
    input: CreateReconScheduleInput,
  ): Promise<ReconScheduleDto> =>
    request(`/programs/${programId}/schedules`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProgramSchedule: async (
    programId: string,
    scheduleId: string,
    input: UpdateReconScheduleInput,
  ): Promise<ReconScheduleDto> =>
    request(`/programs/${programId}/schedules/${scheduleId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteProgramSchedule: async (
    programId: string,
    scheduleId: string,
  ): Promise<void> =>
    request(`/programs/${programId}/schedules/${scheduleId}`, {
      method: "DELETE",
    }),
  runProgramScheduleNow: async (
    programId: string,
    scheduleId: string,
  ): Promise<JobDto> =>
    request(`/programs/${programId}/schedules/${scheduleId}/run-now`, {
      method: "POST",
    }),
  getReconHistory: async (
    programId: string,
    filters: ReconHistoryFilters = {},
  ): Promise<ReconHistoryDto> =>
    API_MODE === "http"
      ? request(`/programs/${programId}/recon-history${qs({ ...filters })}`)
      : { jobs: [], snapshots: [], diffBatches: [], changeCounts: {} },
  getChanges: async (
    filters: ChangeFilters = {},
  ): Promise<EntityChangeRecordDto[]> =>
    API_MODE === "http" ? request(`/changes${qs({ ...filters })}`) : [],
  getChangesSummary: async (
    programId?: string,
    period: "24h" | "7d" | "30d" = "7d",
  ): Promise<ProgramChangeSummaryDto> =>
    API_MODE === "http"
      ? request(`/changes/summary${qs({ programId, period })}`)
      : {
          totalChanges: 0,
          highImportance: 0,
          criticalImportance: 0,
          newAssets: 0,
          newUrls: 0,
          newEndpoints: 0,
          scannerFindingsAppeared: 0,
          scannerFindingsResolved: 0,
          priorityPromotions: 0,
          groupedByType: {},
        },
  getReconDiffs: async (
    filters: ReconDiffFilters = {},
  ): Promise<ReconDiffBatchDto[]> =>
    API_MODE === "http" ? request(`/recon-diffs${qs({ ...filters })}`) : [],
  getReconDiff: async (id: string): Promise<ReconDiffBatchDto> =>
    request(`/recon-diffs/${id}`),
  getNotificationEvents: async (
    filters: NotificationEventFilters = {},
  ): Promise<NotificationEventDto[]> =>
    API_MODE === "http"
      ? request(`/notification-events${qs({ ...filters })}`)
      : [],
  ignoreNotificationEvent: async (id: string): Promise<NotificationEventDto> =>
    API_MODE === "http"
      ? request(`/notification-events/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "ignored" }),
        })
      : Promise.reject(new Error("Notification events are read-only in mock mode")),
  getTelegramConfig: async (): Promise<TelegramConfigStatusDto> =>
    API_MODE === "http"
      ? request("/notifications/telegram/config")
      : {
          enabled: false,
          tokenConfigured: false,
          chatIdConfigured: false,
          transport: "mock",
        },
  getProgramNotificationPreferences: async (
    programId: string,
  ): Promise<ProgramNotificationPreferenceDto> =>
    API_MODE === "http"
      ? request(`/programs/${programId}/notification-preferences`)
      : {
          id: null,
          programId,
          enabled: false,
          telegramEnabled: false,
          minImportance: "medium",
          eventTypes: [...DEFAULT_PROGRAM_NOTIFICATION_EVENT_TYPES],
          createdAt: null,
          updatedAt: null,
        },
  updateProgramNotificationPreferences: async (
    programId: string,
    input: Pick<
      ProgramNotificationPreferenceDto,
      "enabled" | "telegramEnabled" | "minImportance" | "eventTypes"
    >,
  ): Promise<ProgramNotificationPreferenceDto> =>
    API_MODE === "http"
      ? request(`/programs/${programId}/notification-preferences`, {
          method: "PUT",
          body: JSON.stringify(input),
        })
      : {
          id: `mock-preference-${programId}`,
          programId,
          ...input,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
  getNotificationDeliveries: async (
    filters: NotificationDeliveryFilters = {},
  ): Promise<NotificationDeliveryListItem[]> =>
    API_MODE === "http"
      ? request(`/notification-deliveries${qs({ ...filters })}`)
      : [],
  getNotificationEventDeliveries: async (
    id: string,
  ): Promise<NotificationDeliveryDto[]> =>
    API_MODE === "http"
      ? request(`/notification-events/${id}/deliveries`)
      : [],
  retryNotificationDelivery: async (
    id: string,
  ): Promise<NotificationDeliveryDto> =>
    request(`/notification-events/${id}/retry`, { method: "POST" }),
  getNotificationQueueHealth: async (): Promise<NotificationQueueHealthDto> =>
    API_MODE === "http"
      ? request("/notifications/queue/health")
      : {
          queueName: "notification-delivery",
          redis: "ok",
          counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
          timestamp: new Date().toISOString(),
        },
  getAiHealth: async (): Promise<AiHealthDto> => API_MODE === "http" ? request("/ai/health") : { enabled: false, provider: "deepseek", configured: false, model: "deepseek-v4-flash", baseUrl: "https://api.deepseek.com", monthlyLimit: 100, usedThisMonth: 0, remainingThisMonth: 100 },
  testDeepSeek: async (): Promise<{ success: boolean; model: string; latencyMs: number; usage?: unknown; error?: string }> => API_MODE === "http" ? request("/ai/test", { method: "POST" }) : { success: false, model: "deepseek-v4-flash", latencyMs: 0, error: "DeepSeek testing is unavailable in mock mode" },
  previewProgramIntake: async (input: ProgramIntakePreviewRequest): Promise<ProgramIntakePreviewResponse> => API_MODE === "http" ? request("/program-intake/preview", { method: "POST", body: JSON.stringify(input) }) : Promise.reject(new Error("Program intake requires HTTP API mode")),
  getProgramIntakeRuns: async (filters: { programId?: string; platform?: string; status?: string; limit?: number } = {}): Promise<ProgramIntakeRunDetail[]> => API_MODE === "http" ? request(`/program-intake/runs${qs(filters)}`) : [],
  getProgramIntakeRun: async (runId: string): Promise<ProgramIntakeRunDetail> => request(`/program-intake/runs/${runId}`),
  approveProgramIntake: async (runId: string, structuredData: ProgramIntakeStructuredResult): Promise<ProgramDto> => request(`/program-intake/runs/${runId}/approve`, { method: "POST", body: JSON.stringify({ structuredData }) }),
  rejectProgramIntake: async (runId: string): Promise<ProgramIntakeRunDetail> => request(`/program-intake/runs/${runId}/reject`, { method: "POST" }),
  previewProgramIntakeSync: async (programId: string, input: { sourceType: "platform_url"; url?: string } | { sourceType: "pasted_text"; text: string }): Promise<ProgramIntakeSyncPreview> => request(`/programs/${programId}/intake/sync-preview`, { method: "POST", body: JSON.stringify(input) }),
  applyProgramIntakeSync: async (programId: string, input: ProgramIntakeSyncApplyInput): Promise<{ programId: string; intakeRunId: string; diff: ProgramIntakeSyncPreview["diff"] }> => request(`/programs/${programId}/intake/sync-apply`, { method: "POST", body: JSON.stringify(input) }),
};
