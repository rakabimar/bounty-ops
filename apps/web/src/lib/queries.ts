import { queryOptions } from "@tanstack/react-query";
import { api } from "./api-client";
import { ApiError, coreApi } from "./api-client";

export const q = {
  dashboard: (programId?: string) =>
    queryOptions({
      queryKey: ["dashboard", programId],
      queryFn: () => api.dashboard(programId),
    }),
  programs: () =>
    queryOptions({ queryKey: ["programs"], queryFn: api.programs }),
  program: (id: string) =>
    queryOptions({ queryKey: ["program", id], queryFn: () => api.program(id) }),
  scopes: (programId?: string) =>
    queryOptions({
      queryKey: ["scopes", programId],
      queryFn: () => api.scopes(programId),
    }),
  rules: (programId: string) =>
    queryOptions({
      queryKey: ["rules", programId],
      queryFn: () => api.rules(programId),
    }),
  jobs: (programId?: string) =>
    queryOptions({
      queryKey: ["jobs", programId],
      queryFn: () => api.jobs(programId),
    }),
  assets: (programId?: string) =>
    queryOptions({
      queryKey: ["assets", programId],
      queryFn: () => api.assets(programId),
    }),
  urls: (programId?: string) =>
    queryOptions({
      queryKey: ["urls", programId],
      queryFn: () => api.urls(programId),
    }),
  services: (programId?: string) =>
    queryOptions({
      queryKey: ["services", programId],
      queryFn: () => api.services(programId),
    }),
  endpoints: (programId?: string) =>
    queryOptions({
      queryKey: ["endpoints", programId],
      queryFn: () => api.apiEndpoints(programId),
    }),
  jsFiles: (programId?: string) =>
    queryOptions({
      queryKey: ["js-files", programId],
      queryFn: () => api.jsFiles(programId),
    }),
  notes: (programId?: string) =>
    queryOptions({
      queryKey: ["notes", programId],
      queryFn: () => api.notes(programId),
    }),
  changes: (programId?: string) =>
    queryOptions({
      queryKey: ["changes", programId],
      queryFn: () => api.changes(programId),
    }),
  schedules: (programId: string) =>
    queryOptions({
      queryKey: ["schedules", programId],
      queryFn: () => api.schedules(programId),
    }),
  pipeline: (programId: string) =>
    queryOptions({
      queryKey: ["pipeline", programId],
      queryFn: () => api.pipeline(programId),
    }),
  nuclei: (assetId: string) =>
    queryOptions({
      queryKey: ["nuclei", assetId],
      queryFn: () => api.nucleiFindings(assetId),
    }),
  requests: (assetId: string) =>
    queryOptions({
      queryKey: ["requests", assetId],
      queryFn: () => api.interestingRequests(assetId),
    }),
  tools: () => queryOptions({ queryKey: ["tools"], queryFn: api.tools }),
  scoring: () => queryOptions({ queryKey: ["scoring"], queryFn: api.scoring }),
  notifications: () =>
    queryOptions({ queryKey: ["notifications"], queryFn: api.notifications }),
  settings: () =>
    queryOptions({ queryKey: ["settings"], queryFn: api.settings }),
  checklist: (id: string) =>
    queryOptions({
      queryKey: ["checklist", id],
      queryFn: () => api.checklist(id),
    }),
  assetDetail: (id: string) =>
    queryOptions({
      queryKey: ["asset-detail", id],
      queryFn: () => api.assetDetail(id),
    }),
  urlDetail: (id: string) =>
    queryOptions({
      queryKey: ["url-detail", id],
      queryFn: () => api.urlDetail(id),
    }),
  endpointDetail: (id: string) =>
    queryOptions({
      queryKey: ["endpoint-detail", id],
      queryFn: () => api.endpointDetail(id),
    }),
  findingDetail: (id: string) =>
    queryOptions({
      queryKey: ["finding-detail", id],
      queryFn: () => api.findingDetail(id),
    }),
  entityNotes: (entityType: string, entityId: string) =>
    queryOptions({
      queryKey: ["entity-notes", entityType, entityId],
      queryFn: () => api.entityNotes(entityType as never, entityId),
    }),
  entityChecklist: (
    entityType: "asset" | "url" | "endpoint",
    entityId: string,
  ) =>
    queryOptions({
      queryKey: ["entity-checklist", entityType, entityId],
      queryFn: () => api.entityChecklist(entityType, entityId),
    }),
  entityRequests: (entityType: string, entityId: string) =>
    queryOptions({
      queryKey: ["entity-requests", entityType, entityId],
      queryFn: () => api.entityRequests(entityType as never, entityId),
    }),
  scannerFindings: (programId?: string) =>
    queryOptions({
      queryKey: ["scanner-findings", programId],
      queryFn: () => api.scannerFindings(programId),
    }),
  discoveredEndpoints: (programId?: string) =>
    queryOptions({
      queryKey: ["discovered-endpoints", programId],
      queryFn: () => api.discoveredEndpoints(programId),
    }),
};

export const coreQ = {
  session: () =>
    queryOptions({
      queryKey: ["auth", "me"],
      queryFn: async () => {
        try {
          return await coreApi.me();
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return null;
          throw error;
        }
      },
      retry: false,
      staleTime: 30_000,
    }),
  programs: (filters: Parameters<typeof coreApi.getPrograms>[0] = {}) =>
    queryOptions({
      queryKey: ["core", "programs", filters],
      queryFn: () => coreApi.getPrograms(filters),
    }),
  program: (id: string) =>
    queryOptions({
      queryKey: ["core", "program", id],
      queryFn: () => coreApi.getProgram(id),
    }),
  scopes: (id: string) =>
    queryOptions({
      queryKey: ["core", "scopes", id],
      queryFn: () => coreApi.getProgramScopes(id),
    }),
  rules: (id: string) =>
    queryOptions({
      queryKey: ["core", "rules", id],
      queryFn: () => coreApi.getProgramRules(id),
    }),
  headers: (id: string) =>
    queryOptions({
      queryKey: ["core", "headers", id],
      queryFn: () => coreApi.getProgramHeaders(id),
    }),
  settings: () =>
    queryOptions({
      queryKey: ["core", "settings"],
      queryFn: coreApi.getSettings,
    }),
  auditLogs: (filters: Parameters<typeof coreApi.getAuditLogs>[0] = {}) =>
    queryOptions({
      queryKey: ["core", "audit", filters],
      queryFn: () => coreApi.getAuditLogs(filters),
    }),
  scopeGuardSummary: (programId: string) =>
    queryOptions({
      queryKey: ["core", "scope-guard", "summary", programId],
      queryFn: () => coreApi.getScopeGuardSummary(programId),
    }),
  jobs: (filters: Parameters<typeof coreApi.getJobs>[0] = {}) =>
    queryOptions({
      queryKey: ["core", "jobs", filters],
      queryFn: () => coreApi.getJobs(filters),
    }),
  job: (id: string) =>
    queryOptions({
      queryKey: ["core", "job", id],
      queryFn: () => coreApi.getJob(id),
    }),
  jobLogs: (id: string) =>
    queryOptions({
      queryKey: ["core", "job-logs", id],
      queryFn: () => coreApi.getJobLogs(id),
    }),
  queueHealth: () =>
    queryOptions({
      queryKey: ["core", "jobs", "queue-health"],
      queryFn: coreApi.getJobQueueHealth,
    }),
  assets: (filters: Parameters<typeof coreApi.getAssets>[0] = {}) =>
    queryOptions({
      queryKey: ["core", "assets", filters],
      queryFn: () => coreApi.getAssets(filters),
    }),
  asset: (id: string) =>
    queryOptions({
      queryKey: ["core", "asset", id],
      queryFn: () => coreApi.getAsset(id),
    }),
  httpServices: (filters: Parameters<typeof coreApi.getHttpServices>[0] = {}) =>
    queryOptions({
      queryKey: ["core", "http-services", filters],
      queryFn: () => coreApi.getHttpServices(filters),
    }),
  toolHealth: () =>
    queryOptions({
      queryKey: ["core", "tools", "health"],
      queryFn: coreApi.getToolHealth,
    }),
  scoreExplanation: (id: string) =>
    queryOptions({
      queryKey: ["core", "assets", id, "score-explanation"],
      queryFn: () => coreApi.getScoreExplanation(id),
    }),
  scoringRules: () =>
    queryOptions({
      queryKey: ["core", "scoring", "rules"],
      queryFn: coreApi.getScoringRules,
    }),
  manualReview: (
    filters: Parameters<typeof coreApi.getManualReviewQueue>[0] = {},
  ) =>
    queryOptions({
      queryKey: ["core", "manual-review", filters],
      queryFn: () => coreApi.getManualReviewQueue(filters),
    }),
  assetDetail: (id: string) =>
    queryOptions({
      queryKey: ["core", "asset-detail", id],
      queryFn: () => coreApi.getAssetDetail(id),
    }),
  assetUrls: (
    id: string,
    filters: Parameters<typeof coreApi.getAssetUrls>[1] = {},
  ) =>
    queryOptions({
      queryKey: ["core", "asset-urls", id, filters],
      queryFn: () => coreApi.getAssetUrls(id, filters),
    }),
  assetEndpoints: (
    id: string,
    filters: Parameters<typeof coreApi.getAssetEndpoints>[1] = {},
  ) =>
    queryOptions({
      queryKey: ["core", "asset-endpoints", id, filters],
      queryFn: () => coreApi.getAssetEndpoints(id, filters),
    }),
  assetFindings: (
    id: string,
    filters: Parameters<typeof coreApi.getAssetScannerFindings>[1] = {},
  ) =>
    queryOptions({
      queryKey: ["core", "asset-findings", id, filters],
      queryFn: () => coreApi.getAssetScannerFindings(id, filters),
    }),
  urls: (filters: Parameters<typeof coreApi.getUrls>[0] = {}) =>
    queryOptions({
      queryKey: ["core", "urls", filters],
      queryFn: () => coreApi.getUrls(filters),
    }),
  urlDetail: (id: string) =>
    queryOptions({
      queryKey: ["core", "url-detail", id],
      queryFn: () => coreApi.getUrlDetail(id),
    }),
  endpoints: (filters: Parameters<typeof coreApi.getEndpoints>[0] = {}) =>
    queryOptions({
      queryKey: ["core", "endpoints", filters],
      queryFn: () => coreApi.getEndpoints(filters),
    }),
  endpointDetail: (id: string) =>
    queryOptions({
      queryKey: ["core", "endpoint-detail", id],
      queryFn: () => coreApi.getEndpointDetail(id),
    }),
  scannerFindings: (
    filters: Parameters<typeof coreApi.getScannerFindings>[0] = {},
  ) =>
    queryOptions({
      queryKey: ["core", "scanner-findings", filters],
      queryFn: () => coreApi.getScannerFindings(filters),
    }),
  scannerFindingDetail: (id: string) =>
    queryOptions({
      queryKey: ["core", "scanner-finding-detail", id],
      queryFn: () => coreApi.getScannerFindingDetail(id),
    }),
  workspaceSummary: (
    entityType: Parameters<typeof coreApi.getWorkspaceSummary>[0],
    id: string,
  ) =>
    queryOptions({
      queryKey: ["core", "workspace", entityType, id, "summary"],
      queryFn: () => coreApi.getWorkspaceSummary(entityType, id),
    }),
  workspaceNotes: (
    entityType: Parameters<typeof coreApi.getWorkspaceNotes>[0],
    id: string,
  ) =>
    queryOptions({
      queryKey: ["core", "workspace", entityType, id, "notes"],
      queryFn: () => coreApi.getWorkspaceNotes(entityType, id),
    }),
  workspaceChecklists: (
    entityType: Parameters<typeof coreApi.getWorkspaceChecklists>[0],
    id: string,
  ) =>
    queryOptions({
      queryKey: ["core", "workspace", entityType, id, "checklists"],
      queryFn: () => coreApi.getWorkspaceChecklists(entityType, id),
    }),
  workspaceRequests: (
    entityType: Parameters<typeof coreApi.getInterestingRequests>[0],
    id: string,
  ) =>
    queryOptions({
      queryKey: ["core", "workspace", entityType, id, "requests"],
      queryFn: () => coreApi.getInterestingRequests(entityType, id),
    }),
  workspaceEvidence: (
    entityType: Parameters<typeof coreApi.getEvidenceItems>[0],
    id: string,
  ) =>
    queryOptions({
      queryKey: ["core", "workspace", entityType, id, "evidence"],
      queryFn: () => coreApi.getEvidenceItems(entityType, id),
    }),
  schedules: (programId: string) =>
    queryOptions({
      queryKey: ["core", "schedules", programId],
      queryFn: () => coreApi.getProgramSchedules(programId),
    }),
  reconHistory: (
    programId: string,
    filters: Parameters<typeof coreApi.getReconHistory>[1] = {},
  ) =>
    queryOptions({
      queryKey: ["core", "recon-history", programId, filters],
      queryFn: () => coreApi.getReconHistory(programId, filters),
    }),
  changes: (filters: Parameters<typeof coreApi.getChanges>[0] = {}) =>
    queryOptions({
      queryKey: ["core", "changes", filters],
      queryFn: () => coreApi.getChanges(filters),
    }),
  changesSummary: (programId?: string, period: "24h" | "7d" | "30d" = "7d") =>
    queryOptions({
      queryKey: ["core", "changes", "summary", programId, period],
      queryFn: () => coreApi.getChangesSummary(programId, period),
    }),
  reconDiffs: (filters: Parameters<typeof coreApi.getReconDiffs>[0] = {}) =>
    queryOptions({
      queryKey: ["core", "recon-diffs", filters],
      queryFn: () => coreApi.getReconDiffs(filters),
    }),
  notificationEvents: (
    filters: Parameters<typeof coreApi.getNotificationEvents>[0] = {},
  ) =>
    queryOptions({
      queryKey: ["core", "notification-events", filters],
      queryFn: () => coreApi.getNotificationEvents(filters),
    }),
  telegramConfig: () =>
    queryOptions({
      queryKey: ["core", "telegram-config"],
      queryFn: coreApi.getTelegramConfig,
    }),
  notificationPreferences: (programId: string) =>
    queryOptions({
      queryKey: ["core", "notification-preferences", programId],
      queryFn: () => coreApi.getProgramNotificationPreferences(programId),
    }),
  notificationDeliveries: (
    filters: Parameters<typeof coreApi.getNotificationDeliveries>[0] = {},
  ) =>
    queryOptions({
      queryKey: ["core", "notification-deliveries", filters],
      queryFn: () => coreApi.getNotificationDeliveries(filters),
    }),
  notificationQueueHealth: () =>
    queryOptions({
      queryKey: ["core", "notification-queue-health"],
      queryFn: coreApi.getNotificationQueueHealth,
    }),
  aiHealth: () =>
    queryOptions({ queryKey: ["core", "ai-health"], queryFn: coreApi.getAiHealth }),
  programIntakeRuns: (filters: Parameters<typeof coreApi.getProgramIntakeRuns>[0] = {}) =>
    queryOptions({ queryKey: ["core", "program-intake-runs", filters], queryFn: () => coreApi.getProgramIntakeRuns(filters) }),
};
