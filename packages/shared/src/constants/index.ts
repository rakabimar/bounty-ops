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
