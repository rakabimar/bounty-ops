import type { MockDb, ToolStatus, DiscoveredEndpoint, ScannerFinding, ResearchNote, ChecklistItem, EntityChange, EvidenceRequest, DnsRecord, PortRecord } from "./bounty-types";

const now = "2026-06-13 14:32";
const programMeta = { intakeSource: "url_parser", rawPolicyText: "Automation is permitted at safe rates. No denial of service or social engineering.", policyHash: "sha256:8c91e2a", lastSyncedAt: now, needsManualReview: false, confidence: 92 } as const;
const events = (kind: string, score: number) => [{ ruleName: `${kind} signal`, scoreDelta: score, reason: `Matched ${kind} scoring evidence`, timestamp: now }];

const pipeline = [
  ["subdomain_enum", "Subdomain enum", "subfinder"],
  ["dns_resolve", "DNS resolve", "dnsx"],
  ["http_probe", "HTTP probe", "httpx"],
  ["port_scan", "Port scan", "naabu"],
  ["url_collect", "URL collection", "gau + waybackurls"],
  ["crawl", "Crawl", "katana"],
  ["nuclei", "Nuclei", "nuclei"],
  ["ffuf", "FFUF", "ffuf"],
  ["secret_scan", "Secret scan", "trufflehog + gitleaks"],
].map(([id, label, tool], index) => ({
  id, label, tool,
  status: index < 3 ? "success" as const : "queued" as const,
  duration: index < 3 ? `${index + 1}m ${12 + index}s` : "—",
  lastRun: index < 3 ? "Today 14:10" : "Never",
}));

const toolStatus = (index: number): ToolStatus => index === 5 ? "degraded" : index === 11 ? "offline" : "healthy";

const A1 = "a1";
const P1 = "p1";

const discoveredEndpoints: DiscoveredEndpoint[] = [
  { id: "de1", programId: P1, assetId: A1, urlId: "u1", method: "GET", path: "/api/v1/users/me", fullUrl: "https://internal-api.prod.target.com/api/v1/users/me", statusCode: 200, contentType: "application/json", authRequired: "yes", source: "OpenAPI", categories: ["api", "auth"], reasonTags: ["user_context", "auth_required"], parameters: [{ id: "ep1", name: "Authorization", location: "header", source: "OpenAPI", interesting: true }], autoScore: 12, manualScore: null, finalScore: 12, priority: "P2", confidence: 88, status: "promising", notesCount: 1, firstSeenAt: "Today 09:01", lastSeenAt: "2 min ago" },
  { id: "de2", programId: P1, assetId: A1, urlId: "u5", method: "POST", path: "/api/v1/auth/login", fullUrl: "https://internal-api.prod.target.com/api/v1/auth/login", statusCode: 200, contentType: "application/json", authRequired: "no", source: "katana", categories: ["auth", "login"], reasonTags: ["login_endpoint", "rate_limit_check"], parameters: [{ id: "ep2", name: "email", location: "body", type: "string", source: "katana", interesting: true }, { id: "ep3", name: "password", location: "body", type: "string", source: "katana", interesting: true }], autoScore: 14, manualScore: null, finalScore: 14, priority: "P2", confidence: 92, status: "new", notesCount: 0, firstSeenAt: "Today 09:02", lastSeenAt: "5 min ago" },
  { id: "de3", programId: P1, assetId: A1, urlId: "u6", method: "POST", path: "/graphql", fullUrl: "https://internal-api.prod.target.com/graphql", statusCode: 200, contentType: "application/json", authRequired: "unknown", source: "katana", categories: ["graphql", "api"], reasonTags: ["graphql_endpoint", "introspection_candidate"], parameters: [{ id: "ep4", name: "query", location: "body", type: "string", source: "katana", interesting: true }], autoScore: 16, manualScore: 18, finalScore: 18, priority: "P1", confidence: 95, status: "promising", notesCount: 1, firstSeenAt: "Today 09:05", lastSeenAt: "1 min ago" },
  { id: "de4", programId: P1, assetId: A1, urlId: "u7", method: "PUT", path: "/api/v1/settings/profile", fullUrl: "https://internal-api.prod.target.com/api/v1/settings/profile", statusCode: 200, contentType: "application/json", authRequired: "yes", source: "js_extract", categories: ["api"], reasonTags: ["profile_update", "mass_assignment_candidate"], parameters: [{ id: "ep5", name: "email", location: "body", source: "js_extract", interesting: true }, { id: "ep6", name: "role", location: "body", source: "js_extract", interesting: true }], autoScore: 13, manualScore: null, finalScore: 13, priority: "P2", confidence: 80, status: "new", notesCount: 0, firstSeenAt: "Today 09:10", lastSeenAt: "12 min ago" },
];

const scannerFindings: ScannerFinding[] = [
  { id: "sf1", programId: P1, assetId: A1, urlId: "u6", endpointId: "de3", tool: "nuclei", severity: "high", templateId: "graphql-introspection", name: "GraphQL introspection enabled", description: "The GraphQL endpoint allows introspection queries, exposing the schema.", matcher: "word:__schema", matchedUrl: "https://internal-api.prod.target.com/graphql", evidenceSnippet: "{\"data\":{\"__schema\":{\"types\":[...]}}}", extractedResults: ["__schema", "queryType", "mutationType"], status: "new", firstSeenAt: "Today 09:05", lastSeenAt: "1 min ago" },
  { id: "sf2", programId: P1, assetId: A1, urlId: "u1", tool: "nuclei", severity: "medium", templateId: "cors-misconfig", name: "Permissive CORS policy", description: "Access-Control-Allow-Origin reflects arbitrary origin with credentials.", matcher: "header:access-control-allow-origin", matchedUrl: "https://internal-api.prod.target.com/api/v1/users/me", evidenceSnippet: "Access-Control-Allow-Origin: https://evil.example\nAccess-Control-Allow-Credentials: true", extractedResults: ["https://evil.example"], status: "new", firstSeenAt: "Today 09:14", lastSeenAt: "8 min ago" },
  { id: "sf3", programId: P1, assetId: A1, tool: "nuclei", severity: "info", templateId: "tech-detect", name: "Technology detected: nginx / OpenAPI", description: "Identifies running technologies from response headers.", matcher: "header:server", matchedUrl: "https://internal-api.prod.target.com/", evidenceSnippet: "Server: nginx/1.25.1", extractedResults: ["nginx", "OpenAPI"], status: "reviewed", firstSeenAt: "Today 08:50", lastSeenAt: "1 hr ago" },
];

const researchNotes: ResearchNote[] = [
  { id: "rn1", programId: P1, entityType: "asset", entityId: A1, title: "Suspected internal admin surface", body: "Host name contains 'internal-api' which is highly suggestive of weaker auth posture. Confirm IP scope and check for VPN gating.", tags: ["recon", "auth"], createdAt: "Today 09:30", updatedAt: "Today 12:14" },
  { id: "rn2", programId: P1, entityType: "url", entityId: "u1", title: "/api/v1/users/me leak check", body: "Compare response across two test accounts. Look for shared IDs or sensitive fields.", tags: ["idor"], createdAt: "Today 10:10", updatedAt: "Today 10:10" },
  { id: "rn3", programId: P1, entityType: "endpoint", entityId: "de3", title: "GraphQL mutation audit", body: "Enumerate mutations via introspection. Pay attention to admin-prefixed mutations.", tags: ["graphql"], createdAt: "Today 10:42", updatedAt: "Today 10:42" },
  { id: "rn4", programId: P1, entityType: "scanner_finding", entityId: "sf1", title: "Introspection: prioritize", body: "Validate this is not behind auth gate; confirm before promoting to potential bug.", tags: ["triage"], createdAt: "Today 11:02", updatedAt: "Today 11:02" },
];

const entityChanges: EntityChange[] = [
  { id: "ec1", programId: P1, entityType: "asset", entityId: A1, type: "first_seen", summary: "Subdomain discovered", newValue: "internal-api.prod.target.com", source: "subfinder", importance: "high", createdAt: "Today 08:42" },
  { id: "ec2", programId: P1, entityType: "asset", entityId: A1, type: "new_endpoint", summary: "Endpoint discovered: POST /graphql", newValue: "POST /graphql", source: "katana", importance: "high", createdAt: "Today 09:05" },
  { id: "ec3", programId: P1, entityType: "asset", entityId: A1, type: "scanner_finding", summary: "GraphQL introspection enabled", newValue: "graphql-introspection", source: "nuclei", importance: "high", createdAt: "Today 09:05" },
  { id: "ec4", programId: P1, entityType: "asset", entityId: A1, type: "score_changed", summary: "Final score increased", oldValue: "13", newValue: "18", source: "scoring", importance: "medium", createdAt: "Today 12:10" },
  { id: "ec5", programId: P1, entityType: "endpoint", entityId: "de3", type: "first_seen", summary: "Endpoint discovered", newValue: "POST /graphql", source: "katana", importance: "high", createdAt: "Today 09:05" },
  { id: "ec6", programId: P1, entityType: "scanner_finding", entityId: "sf1", type: "first_seen", summary: "Finding appeared", newValue: "graphql-introspection", source: "nuclei", importance: "high", createdAt: "Today 09:05" },
  { id: "ec7", programId: P1, entityType: "url", entityId: "u1", type: "first_seen", summary: "URL discovered", newValue: "/api/v1/users/me", source: "katana", importance: "medium", createdAt: "Today 09:01" },
];

const evidenceRequests: EvidenceRequest[] = [
  { id: "er1", programId: P1, entityType: "asset", entityId: A1, title: "Cross-account /me response compare", method: "GET", url: "https://internal-api.prod.target.com/api/v1/users/me", statusCode: 200, requestHeaders: "Authorization: Bearer [redacted]\nCookie: session=[redacted]", responseHeaders: "Content-Type: application/json", responseBody: "{\"id\":1001,\"email\":\"[redacted]\",\"role\":\"user\"}", note: "Capture and compare with second test account.", tags: ["idor", "evidence"], createdAt: "Today 12:20" },
];

const dnsRecords: Record<string, DnsRecord[]> = {
  a1: [
    { type: "A", value: "203.0.113.42" },
    { type: "A", value: "203.0.113.43" },
    { type: "CNAME", value: "prod-edge.target.com" },
    { type: "TXT", value: "v=spf1 include:_spf.target.com -all" },
  ],
};

const portRecords: Record<string, PortRecord[]> = {
  a1: [
    { port: 443, protocol: "tcp", service: "https", product: "nginx 1.25.1", scheme: "https", status: "open", source: "naabu", firstSeen: "Today 08:50", lastSeen: "2 min ago" },
    { port: 80, protocol: "tcp", service: "http", product: "nginx 1.25.1", scheme: "http", status: "open", source: "naabu", firstSeen: "Today 08:50", lastSeen: "2 min ago" },
  ],
};

export const seedDb: MockDb = {
  programs: [
    { id: "p1", name: "Acme Security Program", platform: "HackerOne", status: "active", hunting: "ongoing", scopeCount: 18, schedules: 4, lastSync: "12 min ago", lastRecon: "38 min ago", url: "https://hackerone.com/acme", ...programMeta },
    { id: "p2", name: "Northstar Marketplace", platform: "Bugcrowd", status: "active", hunting: "monitoring", scopeCount: 11, schedules: 2, lastSync: "1 hr ago", lastRecon: "3 hr ago", url: "https://bugcrowd.com/northstar", ...programMeta, intakeSource: "api", confidence: 98 },
    { id: "p3", name: "Orbit Finance", platform: "YesWeHack", status: "paused", hunting: "paused", scopeCount: 7, schedules: 0, lastSync: "Yesterday", lastRecon: "2 days ago", url: "https://yeswehack.com/programs/orbit", ...programMeta, needsManualReview: true, confidence: 71 },
  ],
  scopes: [
    { id: "s1", programId: "p1", asset: "*.acme.com", normalized: "acme.com", type: "wildcard", scope: "in_scope", bountyEligible: true, notes: "Primary web estate" },
    { id: "s2", programId: "p1", asset: "admin.acme.com", normalized: "admin.acme.com", type: "domain", scope: "out_of_scope", bountyEligible: false, notes: "Explicit exclusion", conflict: "Covered by in-scope wildcard *.acme.com" },
    { id: "s3", programId: "p1", asset: "*.prod.target.com", normalized: "prod.target.com", type: "wildcard", scope: "in_scope", bountyEligible: true, notes: "Production estate" },
    { id: "s4", programId: "p2", asset: "*.northstar.io", normalized: "northstar.io", type: "wildcard", scope: "in_scope", bountyEligible: true, notes: "" },
  ],
  rules: [
    { programId: "p1", automation: "limited", aggressive: false, rateLimit: 8, concurrency: 5, headers: [{ id: "rh1", name: "X-Bug-Bounty", value: "hunter@example.com", enabled: true }], forbidden: ["DoS", "Social engineering", "Data destruction"], authTesting: "yes", dosTesting: false, notes: "Stop immediately if service degradation is observed.", validated: true },
    { programId: "p2", automation: "yes", aggressive: false, rateLimit: 5, concurrency: 3, headers: [], forbidden: ["DoS", "Spam"], authTesting: "unknown", dosTesting: false, notes: "Use test accounts only.", validated: true },
    { programId: "p3", automation: "unknown", aggressive: false, rateLimit: 0, concurrency: 0, headers: [], forbidden: ["DoS"], authTesting: "unknown", dosTesting: false, notes: "Manual policy review needed.", validated: false },
  ],
  jobs: [
    { id: "j1", type: "Full recon", programId: "p1", status: "running", createdAt: now, startedAt: "14:33", duration: "08m 14s", tool: "pipeline", logs: ["[14:33] Scope validation passed", "[14:34] subfinder: 1,842 candidates", "[14:38] dnsx: 614 resolved", "[14:41] httpx: probing live hosts"] },
    { id: "j2", type: "Nuclei scan", programId: "p2", status: "failed", createdAt: "Today 11:04", startedAt: "11:05", finishedAt: "11:07", duration: "02m 01s", tool: "nuclei", error: "Worker timeout after 120s", logs: ["Templates loaded: 8,211", "Worker timeout"] },
    { id: "j3", type: "URL collection", programId: "p1", status: "success", createdAt: "Today 09:10", startedAt: "09:11", finishedAt: "09:18", duration: "07m 22s", tool: "gau + waybackurls", logs: ["Collected 12,403 URLs", "Normalized 9,811 unique URLs"] },
  ],
  pipeline: {
    p1: pipeline,
    p2: pipeline.map(x => ({ ...x, status: x.id === "nuclei" ? "failed" : x.status, error: x.id === "nuclei" ? "Template worker timeout" : undefined })),
    p3: pipeline.map(x => ({ ...x, status: "queued" as const })),
  },
  assets: [
    { id: "a1", programId: "p1", value: "internal-api.prod.target.com", type: "subdomain", scope: "in_scope", status: "promising", autoScore: 13, manualScore: 18, finalScore: 18, categories: ["api", "graphql"], reasons: ["api_host", "graphql_detected", "live_200", "internal_keyword", "new_asset"], scoreEvents: events("API + GraphQL", 8), firstSeen: "Today 08:42", lastSeen: "2 min ago", lastReviewed: "Today 12:10", relatedUrls: 38 },
    { id: "a2", programId: "p1", value: "sso.acme.com", type: "subdomain", scope: "in_scope", status: "new", autoScore: 12, manualScore: null, finalScore: 12, categories: ["login"], reasons: ["SSO provider", "Password reset"], scoreEvents: events("login", 5), firstSeen: "Today 11:02", lastSeen: "8 min ago", relatedUrls: 14 },
    { id: "a3", programId: "p2", value: "uploads.northstar.io", type: "subdomain", scope: "in_scope", status: "manual_started", autoScore: 9, manualScore: 11, finalScore: 11, categories: ["upload", "api"], reasons: ["Upload endpoint", "S3 reference"], scoreEvents: events("upload", 4), firstSeen: "Yesterday", lastSeen: "18 min ago", lastReviewed: "Today 10:41", relatedUrls: 22 },
    { id: "a4", programId: "p1", value: "graphql.acme.com", type: "subdomain", scope: "in_scope", status: "new", autoScore: 7, manualScore: null, finalScore: 7, categories: ["graphql", "api"], reasons: ["Introspection enabled"], scoreEvents: events("GraphQL", 4), firstSeen: "Today 13:51", lastSeen: "24 min ago", relatedUrls: 6 },
    { id: "a5", programId: "p3", value: "billing.orbit.finance", type: "subdomain", scope: "unknown", status: "new", autoScore: 4, manualScore: null, finalScore: 4, categories: ["billing"], reasons: ["Payment keywords"], scoreEvents: events("billing", 4), firstSeen: "2 days ago", lastSeen: "1 day ago", relatedUrls: 11 },
  ],
  urls: [
    { id: "u1", assetId: "a1", programId: "p1", url: "https://internal-api.prod.target.com/api/v1/users/me", host: "internal-api.prod.target.com", statusCode: 200, title: "User context", categories: ["api", "auth"], reasons: ["User context endpoint"], autoScore: 12, manualScore: null, finalScore: 12, scoreEvents: events("api", 5), source: "katana", firstSeen: "Today 09:01", lastSeen: "2 min ago", interesting: true },
    { id: "u2", assetId: "a1", programId: "p1", url: "https://internal-api.prod.target.com/swagger/index.html", host: "internal-api.prod.target.com", statusCode: 200, title: "Swagger UI", categories: ["api", "docs"], reasons: ["API docs exposed"], autoScore: 10, manualScore: 14, finalScore: 14, scoreEvents: events("swagger", 6), source: "katana", firstSeen: "Today 09:00", lastSeen: "2 min ago", interesting: true },
    { id: "u3", assetId: "a2", programId: "p1", url: "https://sso.acme.com/password/reset", host: "sso.acme.com", statusCode: 200, title: "Reset your password", categories: ["login"], reasons: ["Password reset"], autoScore: 7, manualScore: null, finalScore: 7, scoreEvents: events("login", 4), source: "katana", firstSeen: "Today 11:04", lastSeen: "8 min ago" },
    { id: "u4", assetId: "a3", programId: "p2", url: "https://uploads.northstar.io/api/upload", host: "uploads.northstar.io", statusCode: 405, title: "Method Not Allowed", categories: ["upload", "api"], reasons: ["Upload route"], autoScore: 8, manualScore: 10, finalScore: 10, scoreEvents: events("upload", 4), source: "js-parser", firstSeen: "Yesterday", lastSeen: "18 min ago" },
    { id: "u5", assetId: "a1", programId: "p1", url: "https://internal-api.prod.target.com/api/v1/auth/login", host: "internal-api.prod.target.com", statusCode: 200, title: "Login", categories: ["auth", "login"], reasons: ["Login endpoint"], autoScore: 14, manualScore: null, finalScore: 14, scoreEvents: events("login", 6), source: "katana", firstSeen: "Today 09:02", lastSeen: "5 min ago" },
    { id: "u6", assetId: "a1", programId: "p1", url: "https://internal-api.prod.target.com/graphql", host: "internal-api.prod.target.com", statusCode: 200, title: "GraphQL", categories: ["graphql", "api"], reasons: ["GraphQL endpoint", "Introspection candidate"], autoScore: 16, manualScore: 18, finalScore: 18, scoreEvents: events("graphql", 8), source: "katana", firstSeen: "Today 09:05", lastSeen: "1 min ago", interesting: true },
    { id: "u7", assetId: "a1", programId: "p1", url: "https://internal-api.prod.target.com/api/v1/settings/profile", host: "internal-api.prod.target.com", statusCode: 200, title: "Profile settings", categories: ["api"], reasons: ["Profile mutation"], autoScore: 13, manualScore: null, finalScore: 13, scoreEvents: events("api", 5), source: "js-parser", firstSeen: "Today 09:10", lastSeen: "12 min ago" },
  ],
  services: [
    { id: "h1", assetId: "a1", programId: "p1", host: "internal-api.prod.target.com", port: 443, protocol: "https", status: 200, title: "Internal API", technologies: ["nginx", "OpenAPI", "GraphQL"], score: 18 },
    { id: "h2", assetId: "a2", programId: "p1", host: "sso.acme.com", port: 443, protocol: "https", status: 200, title: "Acme Identity", technologies: ["Okta", "React"], score: 12 },
    { id: "h3", assetId: "a3", programId: "p2", host: "uploads.northstar.io", port: 443, protocol: "https", status: 403, title: "Access denied", technologies: ["CloudFront", "S3"], score: 11 },
  ],
  endpoints: [
    { id: "e1", assetId: "a1", programId: "p1", method: "GET", path: "/api/v1/users/me", host: "internal-api.prod.target.com", auth: "Bearer", source: "OpenAPI", score: 12, status: "promising" },
    { id: "e2", assetId: "a1", programId: "p1", method: "POST", path: "/graphql", host: "internal-api.prod.target.com", auth: "Unknown", source: "katana", score: 18, status: "promising" },
    { id: "e3", assetId: "a3", programId: "p2", method: "POST", path: "/api/upload", host: "uploads.northstar.io", auth: "Unknown", source: "katana", score: 11, status: "manual_started" },
  ],
  jsFiles: [
    { id: "js1", assetId: "a1", programId: "p1", url: "https://internal-api.prod.target.com/static/app.8d1.js", size: "1.8 MB", secrets: [{ type: "AWS key candidate", value: "AKIA••••••••••7K2P", confidence: "medium", severity: "high" }], lastSeen: "4 min ago" },
    { id: "js2", assetId: "a3", programId: "p2", url: "https://northstar.io/assets/main.js", size: "842 KB", secrets: [{ type: "Sentry DSN", value: "https://••••@sentry.io/••••", confidence: "high", severity: "low" }], lastSeen: "1 hr ago" },
  ],
  notes: [
    { id: "n1", programId: "p1", assetId: "a1", title: "API v2 auth model", body: "Swagger exposes object IDs. Compare access across two test accounts.", tags: ["idor", "api"], updatedAt: "Today 12:14" },
    { id: "n2", programId: "p2", assetId: "a3", title: "Upload review", body: "Test SVG and content-type mismatch after confirming storage isolation.", tags: ["upload"], updatedAt: "Today 10:48" },
  ],
  tools: ["subfinder", "dnsx", "httpx", "naabu", "katana", "nuclei", "amass", "assetfinder", "gau", "waybackurls", "ffuf", "trufflehog", "gitleaks"].map((name, i) => ({ name, version: ["2.6.7", "1.2.1", "1.6.10", "2.3.4"][i % 4], status: toolStatus(i), latency: i === 11 ? "—" : `${22 + i * 3}ms` })),
  workerHealth: { cpuCores: 2, cpuUsage: 38, memoryTotal: 4, memoryUsed: 2.1, diskTotal: 60, diskUsed: 36, queueDepth: 2, runningJobs: 1, os: "Ubuntu 24.04", dockerStatus: "healthy" },
  scoring: [
    { id: "r1", name: "API category", field: "category", operator: "contains", value: "api", score: 4, enabled: true },
    { id: "r2", name: "Swagger title", field: "title", operator: "contains", value: "swagger", score: 6, enabled: true },
    { id: "r3", name: "Admin category", field: "category", operator: "contains", value: "admin", score: 5, enabled: true },
    { id: "r4", name: "HTTP success", field: "status_code", operator: "equals", value: "200", score: 1, enabled: true },
  ],
  notifications: { token: "123456789:AAExampleBotToken", chatId: "-100123456789", toggles: { "New high-score asset": true, "New subdomain": false, "New live host": false, "New API docs": true, "New GraphQL endpoint": true, "New nuclei high/critical": true, "Program scope changed": true, "Job failed": true, "New secret candidate": true, "New open port": true, "New staging/dev host": true, "Worker/tool degraded": true, "New ffuf interesting path": true } },
  settings: { theme: "dark", apiMode: "mock", apiBase: "/api", maxConcurrency: 5, defaultRps: 8, pageSize: 25 },
  checklist: {},
  changes: [
    { id: "c1", type: "new_subdomain", programId: "p1", assetId: "a4", title: "New subdomain", description: "graphql.acme.com resolved for the first time", severity: "medium", newValue: "graphql.acme.com", discoveredAt: "24 min ago" },
    { id: "c2", type: "technology_changed", programId: "p1", assetId: "a1", title: "Technology changed", description: "OpenAPI was detected on the API service", severity: "high", oldValue: "nginx", newValue: "nginx, OpenAPI", discoveredAt: "2 min ago" },
    { id: "c3", type: "scope_changed", programId: "p2", title: "Scope changed", description: "Marketplace wildcard added", severity: "high", newValue: "*.northstar.io", discoveredAt: "1 hr ago" },
  ],
  schedules: ["program_sync", "subdomain_enum", "dns_resolve", "http_probe", "port_scan", "url_collect", "crawl", "nuclei", "ffuf", "secret_scan"].map((jobType, index) => ({ id: `sch${index}`, programId: "p1", jobType, enabled: index < 8, frequency: index === 0 ? "Every 6 hours" : "Daily", time: `0${index % 9}:00`, lastRun: index < 5 ? "Today" : "Yesterday", nextRun: "Tomorrow" })),
  nucleiFindings: [
    { id: "nf1", assetId: "a1", template: "openapi-schema", severity: "medium", matchedAt: "https://internal-api.prod.target.com/swagger.json" },
    { id: "nf2", assetId: "a2", template: "missing-security-headers", severity: "info", matchedAt: "https://sso.acme.com" },
  ],
  interestingRequests: [
    { id: "ir1", assetId: "a1", method: "GET", url: "/api/v1/users/1001", status: 200, note: "Compare object access with second account", requestSnippet: "GET /api/v1/users/1001\nAuthorization: Bearer [redacted]", responseSnippet: "{\"id\":1001,\"email\":\"[redacted]\"}" },
  ],
  discoveredEndpoints,
  scannerFindings,
  researchNotes,
  checklistItems: [] as ChecklistItem[],
  entityChanges,
  evidenceRequests,
  dnsRecords,
  portRecords,
};
