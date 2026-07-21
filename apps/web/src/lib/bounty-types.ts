export type Platform = "HackerOne" | "Bugcrowd" | "YesWeHack" | "Custom";
export const priorityFromScore = (score: number): "P1" | "P2" | "Monitor" | "Low" =>
  score >= 15 ? "P1" : score >= 8 ? "P2" : score >= 3 ? "Monitor" : "Low";
export type ProgramStatus = "active" | "paused" | "archived";
export type HuntingStatus = "ongoing" | "not_hunting" | "monitoring" | "paused";
export type JobStatus = "queued" | "running" | "success" | "failed" | "cancelled";
export type AssetStatus = "new" | "resolved" | "live" | "triaged" | "promising" | "manual_started" | "manual_done" | "potential_bug" | "reported" | "duplicate" | "ignored" | "monitor" | "out_of_scope";
export type Priority = "P1" | "P2" | "Monitor" | "Low";
export type ScannerFindingStatus = "new" | "reviewed" | "interesting" | "false_positive" | "potential_bug" | "ignored";
export type SecretCandidateStatus = "new" | "reviewed" | "false_positive" | "valid_exposure" | "ignored";
export type EntityType = "asset" | "url" | "endpoint" | "scanner_finding" | "js_file" | "secret_candidate" | "job";
export type ToolStatus = "healthy" | "degraded" | "offline";
export type ScopeStatus = "in_scope" | "out_of_scope" | "unknown";
export type IntakeSource = "api" | "url_parser" | "manual_paste" | "gemini";

export interface Program {
  id: string;
  name: string;
  platform: Platform;
  status: ProgramStatus;
  hunting: HuntingStatus;
  scopeCount: number;
  schedules: number;
  lastSync: string;
  lastRecon: string;
  url: string;
  intakeSource: IntakeSource;
  rawPolicyText: string;
  policyHash: string;
  lastSyncedAt: string;
  needsManualReview: boolean;
  confidence: number;
  draft?: boolean;
}

export interface ScopeAsset {
  id: string;
  programId: string;
  asset: string;
  normalized: string;
  type: "domain" | "wildcard" | "url" | "cidr" | "mobile";
  scope: ScopeStatus;
  bountyEligible: boolean;
  notes: string;
  conflict?: string;
}

export interface RequiredHeader { id: string; name: string; value: string; enabled: boolean; }

export interface Rules {
  programId: string;
  automation: "yes" | "no" | "limited" | "unknown";
  aggressive: boolean;
  rateLimit: number;
  concurrency: number;
  headers: RequiredHeader[];
  forbidden: string[];
  authTesting: "yes" | "no" | "unknown";
  dosTesting: boolean;
  notes: string;
  validated: boolean;
}

export interface PipelineStep { id: string; label: string; tool: string; status: JobStatus; duration: string; lastRun: string; error?: string; }
export interface ScoreEvent { ruleName: string; scoreDelta: number; reason: string; timestamp: string; }

export interface ReconJob {
  id: string;
  type: string;
  programId: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  duration: string;
  tool: string;
  error?: string;
  logs: string[];
}

export interface Asset {
  id: string;
  programId: string;
  value: string;
  type: string;
  scope: ScopeStatus;
  status: AssetStatus;
  autoScore: number;
  manualScore: number | null;
  finalScore: number;
  categories: string[];
  reasons: string[];
  scoreEvents: ScoreEvent[];
  firstSeen: string;
  lastSeen: string;
  lastReviewed?: string;
  relatedUrls: number;
  reportUrl?: string;
  reportTemplateRef?: string;
}

export interface UrlRecord {
  id: string;
  assetId: string;
  programId: string;
  url: string;
  host: string;
  statusCode: number;
  title: string;
  categories: string[];
  reasons: string[];
  autoScore: number;
  manualScore: number | null;
  finalScore: number;
  scoreEvents: ScoreEvent[];
  source: string;
  firstSeen: string;
  lastSeen: string;
  interesting?: boolean;
}

export interface HttpService {
  id: string;
  assetId: string;
  programId: string;
  host: string;
  port: number;
  protocol: string;
  status: number;
  title: string;
  technologies: string[];
  score: number;
}

export interface ApiEndpoint {
  id: string;
  assetId?: string;
  programId: string;
  method: string;
  path: string;
  host: string;
  auth: string;
  source: string;
  score: number;
  status: AssetStatus;
}

export interface JsFile {
  id: string;
  assetId?: string;
  programId: string;
  url: string;
  size: string;
  secrets: {
    type: string;
    value: string;
    confidence: string;
    severity: string;
  }[];
  lastSeen: string;
}

export interface Note {
  id: string;
  programId: string;
  assetId?: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
}

export interface ChangeRecord {
  id: string;
  type: string;
  programId: string;
  assetId?: string;
  title: string;
  description: string;
  severity: string;
  oldValue?: string;
  newValue?: string;
  discoveredAt: string;
}

export interface ToolHealth {
  name: string;
  version: string;
  status: ToolStatus;
  latency: string;
}

export interface ScoringRule {
  id: string;
  name: string;
  field: string;
  operator: string;
  value: string;
  score: number;
  enabled: boolean;
}

export interface NotificationSettings {
  token: string;
  chatId: string;
  toggles: Record<string, boolean>;
}

export interface AppSettings {
  theme: "dark" | "light" | "system";
  apiMode: "mock" | "http";
  apiBase: string;
  maxConcurrency: number;
  defaultRps: number;
  pageSize: number;
}

export interface WorkerHealth { cpuCores: number; cpuUsage: number; memoryTotal: number; memoryUsed: number; diskTotal: number; diskUsed: number; queueDepth: number; runningJobs: number; os: string; dockerStatus: ToolStatus; }
export interface Schedule { id: string; programId: string; jobType: string; enabled: boolean; frequency: string; time: string; lastRun: string; nextRun: string; }
export interface NucleiFinding { id: string; assetId: string; template: string; severity: string; matchedAt: string; }
export interface InterestingRequest { id: string; assetId: string; method: string; url: string; status: number; note: string; requestSnippet: string; responseSnippet: string; }
export interface IntakeInput { platform: Platform; method: "api" | "url_parser" | "manual_paste"; programUrl: string; apiHandle: string; rawPolicyText: string; }
export interface IntakePreview { name: string; platform: Platform; url: string; inScope: string[]; outOfScope: string[]; rules: Rules; confidence: number; needsManualReview: boolean; source: IntakeSource; rawPolicyText: string; policyHash: string; }

export interface DiscoveredEndpoint {
  id: string;
  programId: string;
  assetId: string;
  urlId?: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | "UNKNOWN";
  path: string;
  fullUrl: string;
  statusCode?: number;
  contentType?: string;
  authRequired: "yes" | "no" | "unknown";
  source: "katana" | "gau" | "waybackurls" | "js_extract" | "ffuf" | "manual" | "OpenAPI";
  categories: string[];
  reasonTags: string[];
  parameters: EndpointParameter[];
  autoScore: number;
  manualScore: number | null;
  finalScore: number;
  priority: Priority;
  confidence: number;
  status: AssetStatus;
  notesCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface EndpointParameter {
  id: string;
  name: string;
  location: "query" | "body" | "path" | "header" | "cookie";
  type?: string;
  exampleValue?: string;
  source: string;
  interesting: boolean;
  frequency?: number;
}

export interface ScannerFinding {
  id: string;
  programId: string;
  assetId: string;
  urlId?: string;
  endpointId?: string;
  tool: "nuclei" | "custom" | "manual";
  severity: "info" | "low" | "medium" | "high" | "critical";
  templateId?: string;
  name: string;
  description?: string;
  matcher?: string;
  matchedUrl?: string;
  evidenceSnippet?: string;
  extractedResults?: string[];
  status: ScannerFindingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ResearchNote {
  id: string;
  programId: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  programId: string;
  entityType: "asset" | "url" | "endpoint";
  entityId: string;
  category: string;
  title: string;
  description?: string;
  status: "todo" | "doing" | "done" | "skipped";
  note?: string;
  isCustom: boolean;
  updatedAt: string;
}

export interface EntityChange {
  id: string;
  programId: string;
  entityType: "asset" | "url" | "endpoint" | "scanner_finding";
  entityId: string;
  type: string;
  summary: string;
  oldValue?: string;
  newValue?: string;
  source: string;
  importance: "low" | "medium" | "high";
  createdAt: string;
}

export interface EvidenceRequest {
  id: string;
  programId: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  method: string;
  url: string;
  statusCode?: number;
  requestHeaders?: string;
  requestBody?: string;
  responseHeaders?: string;
  responseBody?: string;
  note?: string;
  tags: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface DnsRecord { type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS"; value: string; }
export interface PortRecord { port: number; protocol: string; service: string; product?: string; scheme?: string; status: string; source: string; firstSeen: string; lastSeen: string; }

export interface MockDb {
  programs: Program[];
  scopes: ScopeAsset[];
  rules: Rules[];
  jobs: ReconJob[];
  pipeline: Record<string, PipelineStep[]>;
  assets: Asset[];
  urls: UrlRecord[];
  services: HttpService[];
  endpoints: ApiEndpoint[];
  jsFiles: JsFile[];
  notes: Note[];
  changes: ChangeRecord[];
  tools: ToolHealth[];
  workerHealth: WorkerHealth;
  scoring: ScoringRule[];
  notifications: NotificationSettings;
  settings: AppSettings;
  checklist: Record<string, string[]>;
  schedules: Schedule[];
  nucleiFindings: NucleiFinding[];
  interestingRequests: InterestingRequest[];
  discoveredEndpoints: DiscoveredEndpoint[];
  scannerFindings: ScannerFinding[];
  researchNotes: ResearchNote[];
  checklistItems: ChecklistItem[];
  entityChanges: EntityChange[];
  evidenceRequests: EvidenceRequest[];
  dnsRecords: Record<string, DnsRecord[]>;
  portRecords: Record<string, PortRecord[]>;
}
