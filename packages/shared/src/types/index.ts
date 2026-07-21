export type AssetStatus =
  | "new"
  | "resolved"
  | "live"
  | "triaged"
  | "promising"
  | "manual_started"
  | "manual_done"
  | "potential_bug"
  | "reported"
  | "duplicate"
  | "ignored"
  | "monitor"
  | "out_of_scope";

export type Priority = "P1" | "P2" | "Monitor" | "Low";

export type Platform = "hackerone" | "bugcrowd" | "yeswehack" | "custom";

export type ProgramStatus = "active" | "paused" | "archived";

export type JobStatus = "queued" | "running" | "success" | "failed" | "cancelled";

export type ScopeStatus = "in_scope" | "out_of_scope" | "unknown";
