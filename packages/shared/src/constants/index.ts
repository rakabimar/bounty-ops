export const BOUNTYOPS_SERVICE_NAME = "bountyops" as const;

export const PLATFORMS = ["hackerone", "bugcrowd", "yeswehack", "custom", "manual"] as const;
export const PROGRAM_INTAKE_PLATFORMS = ["hackerone", "bugcrowd", "yeswehack", "manual"] as const;
export const PROGRAM_INTAKE_SOURCE_TYPES = ["platform_url", "pasted_text"] as const;
export const PROGRAM_INTAKE_STATUSES = ["pending", "parsing", "needs_review", "approved", "rejected", "failed"] as const;

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
  "nuclei_safe",
  "full_deep_recon",
] as const;

export const FULL_DEEP_RECON_STAGES = [
  "subdomain_enum",
  "dns_resolve",
  "http_probe",
  "url_archive",
  "crawl",
  "nuclei_safe",
] as const;

export const RECON_MVP_TOOL_NAMES = ["subfinder", "dnsx", "httpx"] as const;
export const RECON_PHASE_10_TOOL_NAMES = ["gau", "waybackurls", "katana", "nuclei"] as const;
export const RECON_TOOL_NAMES = [...RECON_MVP_TOOL_NAMES, ...RECON_PHASE_10_TOOL_NAMES] as const;

export const NUCLEI_SAFE_ALLOWED_TAGS = ["exposure", "misconfig", "takeover", "tech", "panel"] as const;
export const NUCLEI_SAFE_BLOCKED_TAGS = ["dos", "bruteforce", "intrusive", "fuzz", "destructive", "rce", "cve", "oob"] as const;
export const NUCLEI_SAFE_ALLOWED_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

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

export const RECON_SNAPSHOT_STATUSES = ["running", "success", "partial", "failed", "skipped"] as const;
export const RECON_DIFF_TYPES = ["added", "changed", "removed", "reappeared"] as const;
export const CHANGE_IMPORTANCE_VALUES = ["low", "medium", "high", "critical"] as const;
export const NOTIFICATION_EVENT_STATUSES = ["pending", "delivered", "ignored", "failed", "suppressed"] as const;
export const NOTIFICATION_CHANNELS = ["telegram"] as const;
export const NOTIFICATION_DELIVERY_STATUSES = ["queued", "sending", "delivered", "failed", "suppressed"] as const;
export const NOTIFICATION_DELIVERY_QUEUE_NAME = "notification-delivery" as const;
export const NOTIFICATION_IMPORTANCE_RANK = { low: 1, medium: 2, high: 3, critical: 4 } as const;
export const SUPPORTED_NOTIFICATION_EVENT_TYPES = [
  "new_subdomain", "high_score_asset", "new_live_host", "new_open_web_service",
  "api_docs_discovered", "graphql_discovered", "staging_dev_discovered",
  "scanner_finding_high", "scanner_finding_critical", "scanner_finding_resolved",
  "scanner_finding_reappeared", "priority_promoted", "job_failed", "scope_changed",
  "schedule_blocked", "tool_degraded",
] as const;
export const DEFAULT_PROGRAM_NOTIFICATION_EVENT_TYPES = [
  "high_score_asset", "new_live_host", "api_docs_discovered", "graphql_discovered",
  "staging_dev_discovered", "scanner_finding_high", "scanner_finding_critical",
  "scanner_finding_reappeared", "priority_promoted", "job_failed", "scope_changed",
] as const;
export const RECON_SCHEDULE_FREQUENCIES = ["daily", "every_3_days", "weekly", "manual"] as const;
export const RECON_CHANGE_TYPES = [
  "asset_discovered", "asset_reappeared", "asset_not_seen", "dns_record_added", "dns_record_removed",
  "ip_changed", "cname_changed", "http_service_discovered", "http_service_not_seen",
  "status_code_changed", "title_changed", "technology_changed", "content_type_changed",
  "url_discovered", "endpoint_discovered", "endpoint_parameter_added", "scanner_finding_appeared",
  "scanner_finding_resolved", "scanner_finding_reappeared", "score_changed", "priority_changed",
  "category_changed",
] as const;
