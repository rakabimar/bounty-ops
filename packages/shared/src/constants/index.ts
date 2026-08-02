export const BOUNTYOPS_SERVICE_NAME = "bountyops" as const;

export const PLATFORMS = ["hackerone", "bugcrowd", "yeswehack", "custom"] as const;

export const PROGRAM_STATUSES = ["active", "paused", "archived"] as const;

export const HUNTING_STATUSES = ["ongoing", "not_hunting"] as const;

export const SCOPE_ASSET_TYPES = [
  "wildcard_domain",
  "domain",
  "subdomain",
  "url",
  "api",
  "cidr",
  "mobile",
  "other",
] as const;

export const AUTOMATION_ALLOWED_VALUES = ["yes", "no", "limited", "unknown"] as const;

export const RECON_STAGES = [
  "passive",
  "active_light",
  "active_medium",
  "active_deep",
  "manual_approval",
  "blocked",
] as const;

export const RECON_JOB_TYPES = [
  "program_sync",
  "subdomain_enum",
  "dns_resolve",
  "http_probe",
  "tls_enrichment",
  "port_discovery",
  "url_archive",
  "crawl",
  "crawl_headless",
  "nuclei_safe",
  "nuclei_advanced",
  "ffuf_small",
  "ffuf_deep",
  "alterx_permutation",
  "secret_scan",
  "nmap_verification",
  "interactsh_oob",
  "full_deep_recon",
] as const;

export const RECON_JOB_DEFAULT_STAGES = {
  program_sync: "passive",
  subdomain_enum: "passive",
  url_archive: "passive",
  dns_resolve: "active_light",
  http_probe: "active_light",
  tls_enrichment: "active_light",
  port_discovery: "active_medium",
  crawl: "active_medium",
  nuclei_safe: "active_medium",
  secret_scan: "active_medium",
  ffuf_small: "active_deep",
  alterx_permutation: "active_deep",
  crawl_headless: "active_deep",
  ffuf_deep: "manual_approval",
  nuclei_advanced: "manual_approval",
  nmap_verification: "manual_approval",
  interactsh_oob: "manual_approval",
  full_deep_recon: "active_deep",
} as const satisfies Record<(typeof RECON_JOB_TYPES)[number], (typeof RECON_STAGES)[number]>;

export const MANUAL_APPROVAL_JOB_TYPES = [
  "nmap_verification",
  "interactsh_oob",
  "nuclei_advanced",
  "ffuf_deep",
] as const;

export const DEFAULT_BLOCKED_ACTION_CATEGORIES = ["dos", "bruteforce"] as const;

export const RECON_QUEUE_NAME = "recon-jobs" as const;

export const OPTIONAL_TARGET_JOB_TYPES = [
  "program_sync",
  "subdomain_enum",
  "url_archive",
  "full_deep_recon",
] as const;

export const FULL_DEEP_RECON_STAGES = [
  "program_sync",
  "subdomain_enum",
  "dns_resolve",
  "http_probe",
  "tls_enrichment",
  "port_discovery",
  "url_archive",
  "crawl",
  "nuclei_safe",
  "secret_scan",
] as const;

export const RECON_MVP_TOOL_NAMES = ["subfinder", "dnsx", "httpx"] as const;

export const ASSET_TYPES = ["root_domain", "subdomain", "host", "ip", "service"] as const;

export const CATEGORIES = [
  "login", "auth", "admin_dashboard", "api", "swagger_openapi", "graphql",
  "upload", "download_export", "billing_payment", "team_invite_role", "staging_dev",
  "debug_error", "storage_bucket", "static_cdn", "parked", "unknown",
] as const;

export const REASON_TAGS = [
  "new_asset", "live_host", "api_host", "graphql_detected", "swagger_detected",
  "admin_detected", "login_detected", "auth_detected", "upload_detected",
  "download_export_detected", "billing_payment_detected", "staging_keyword",
  "debug_error_detected", "storage_bucket_detected", "interesting_403", "server_error",
  "unusual_port", "sensitive_path", "dev_tech_detected", "duplicate_fingerprint",
  "parked_detected", "static_cdn",
] as const;

export const PRIORITY_THRESHOLDS = {
  P1: 15,
  P2: 8,
  Monitor: 3,
} as const;

export const ENDPOINT_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "UNKNOWN"] as const;
export const AUTH_REQUIRED_VALUES = ["yes", "no", "unknown"] as const;
export const ENDPOINT_PARAMETER_LOCATIONS = ["query", "body", "path", "header", "cookie"] as const;
export const SCANNER_FINDING_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export const SCANNER_FINDING_STATUSES = ["new", "reviewed", "interesting", "false_positive", "potential_bug", "ignored"] as const;
export const SCANNER_TOOLS = ["nuclei", "custom", "manual"] as const;

export const WORKSPACE_ENTITY_TYPES = [
  "asset", "url", "endpoint", "scanner_finding", "http_service", "dns_record", "job",
] as const;
export const CHECKLIST_ITEM_STATUSES = ["todo", "in_progress", "done", "skipped", "not_applicable"] as const;
export const CHECKLIST_PRIORITIES = ["low", "medium", "high"] as const;
export const CHECKLIST_SOURCES = ["manual", "auto", "template"] as const;
export const EVIDENCE_TYPES = ["text", "request_response", "screenshot_reference", "file_reference", "command_output", "observation"] as const;
