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
