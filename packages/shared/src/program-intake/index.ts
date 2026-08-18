import { z } from "zod";

export const programIntakePlatformSchema = z.enum(["hackerone", "bugcrowd", "yeswehack", "manual"]);
export const programIntakeSourceTypeSchema = z.enum(["platform_url", "pasted_text"]);
export const intakeScopeSchema = z.object({
  asset: z.string().trim().min(1).max(2000),
  assetType: z.enum(["wildcard_domain", "domain", "subdomain", "url", "api", "cidr", "other"]),
  isInScope: z.boolean(),
  bountyEligible: z.boolean().nullable(),
  notes: z.string().max(4000).nullable(),
  confidence: z.number().int().min(0).max(100),
  sourceEvidence: z.string().max(2000).nullable(),
});
export const intakeRulesSchema = z.object({
  automationAllowed: z.enum(["yes", "no", "limited", "unknown"]),
  aggressiveAllowed: z.boolean(),
  rateLimitRps: z.number().int().positive().max(10000).nullable(),
  maxConcurrency: z.number().int().positive().max(1000).nullable(),
  forbiddenActions: z.array(z.string().trim().min(1).max(200)).max(100),
  authTestingAllowed: z.boolean(),
  dosTestingAllowed: z.boolean(),
  notes: z.string().max(10000).nullable(),
});
export const intakeHeaderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  value: z.string().max(2000).nullable(),
  isRequired: z.boolean(),
  notes: z.string().max(2000).nullable(),
});
export const programIntakeStructuredResultSchema = z.object({
  platform: programIntakePlatformSchema,
  programName: z.string().trim().min(1).max(300).nullable(),
  handle: z.string().trim().max(300).nullable(),
  programUrl: z.string().url().max(2000).nullable(),
  scopes: z.array(intakeScopeSchema).max(2000),
  rules: intakeRulesSchema,
  requiredHeaders: z.array(intakeHeaderSchema).max(100),
  safeHarborSummary: z.string().max(10000).nullable(),
  reportingNotes: z.string().max(10000).nullable(),
  warnings: z.array(z.string().max(1000)).max(200),
  overallConfidence: z.number().int().min(0).max(100),
});

export const programIntakePreviewRequestSchema = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("platform_url"), url: z.string().url().max(2000) }),
  z.object({ sourceType: z.literal("pasted_text"), platform: programIntakePlatformSchema, text: z.string().trim().min(20).max(250000) }),
]);

export type ProgramIntakePlatform = z.infer<typeof programIntakePlatformSchema>;
export type ProgramIntakeSourceType = z.infer<typeof programIntakeSourceTypeSchema>;
export type ProgramIntakeStructuredResult = z.infer<typeof programIntakeStructuredResultSchema>;
export type ProgramIntakePreviewRequest = z.infer<typeof programIntakePreviewRequestSchema>;

export interface IntakeSourceDocument {
  platform: ProgramIntakePlatform;
  sourceType: ProgramIntakeSourceType;
  sourceUrl?: string;
  title?: string;
  rawText: string;
  fetchedAt?: string;
  contentHash: string;
}
export interface DeterministicIntakeResult {
  structuredData: ProgramIntakeStructuredResult;
  confidence: number;
  ambiguous: boolean;
  warnings: string[];
}
export interface ProgramIntakeRunDto {
  id: string; programId: string | null; platform: ProgramIntakePlatform; sourceType: ProgramIntakeSourceType;
  sourceUrl: string | null; status: "pending" | "parsing" | "needs_review" | "approved" | "rejected" | "failed";
  parserConfidence: number; aiUsed: boolean; aiProvider: string | null; aiModel: string | null;
  sourceContentHash: string | null; error: string | null; createdByUserId: string | null; createdAt: string; completedAt: string | null;
}
export interface ProgramIntakeProposalDto {
  id: string; intakeRunId: string; structuredData: ProgramIntakeStructuredResult;
  deterministicData: ProgramIntakeStructuredResult | null; aiData: ProgramIntakeStructuredResult | null;
  confidence: number; warnings: string[]; createdAt: string; updatedAt: string;
}
export interface ProgramIntakePreviewResponse { run: ProgramIntakeRunDto; proposal: ProgramIntakeProposalDto }
export interface ProgramIntakeSyncDiff {
  scopeAdded: ProgramIntakeStructuredResult["scopes"];
  scopeRemoved: Array<{ id: string; asset: string; assetType: string; isInScope: boolean }>;
  scopeChanged: Array<{ asset: string; before: unknown; after: unknown }>;
  rulesChanged: Array<{ field: string; before: unknown; after: unknown; dangerous: boolean }>;
  headersAdded: ProgramIntakeStructuredResult["requiredHeaders"];
  headersRemoved: Array<{ id: string; name: string; isRequired: boolean }>;
  warnings: string[];
}
export interface AiHealthDto { enabled: boolean; provider: "deepseek"; configured: boolean; model: string; baseUrl: string; monthlyLimit: number; usedThisMonth: number; remainingThisMonth: number }
