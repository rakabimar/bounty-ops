import { copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ScoringConfigDto } from "@bountyops/shared";
import { CATEGORIES, REASON_TAGS } from "@bountyops/shared";
import { parse } from "yaml";
import { z } from "zod";
import { ApiError } from "../../utils/response.js";

const configPath = fileURLToPath(new URL("../../../../../configs/scoring-rules.yaml", import.meta.url));
const entityTypes = ["asset", "http_service", "url", "endpoint", "scanner_finding", "js_file", "secret_candidate", "job"] as const;
const matchSchema = z.object({
  hostKeywords: z.array(z.string()).optional(), pathKeywords: z.array(z.string()).optional(),
  titleKeywords: z.array(z.string()).optional(), techKeywords: z.array(z.string()).optional(),
  statusCodes: z.array(z.number().int()).optional(), ports: z.array(z.number().int().min(1).max(65535)).optional(),
  contentTypeKeywords: z.array(z.string()).optional(), urlRegex: z.string().optional(),
});
const configSchema = z.object({
  version: z.number().int().positive(),
  priorityThresholds: z.object({ P1: z.number().int(), P2: z.number().int(), Monitor: z.number().int() }),
  rules: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), enabled: z.boolean(),
    entityTypes: z.array(z.enum(entityTypes)).min(1), category: z.enum(CATEGORIES), reasonTag: z.enum(REASON_TAGS),
    scoreDelta: z.number().int(), confidence: z.number().int().min(0).max(100), match: matchSchema,
    notes: z.string().optional(),
  })).min(1),
});

export function parseScoringConfig(rawYaml: string): ScoringConfigDto {
  let parsed: unknown;
  try { parsed = parse(rawYaml); } catch { throw new ApiError(400, "BAD_REQUEST", "Scoring rules contain invalid YAML"); }
  const result = configSchema.safeParse(parsed);
  if (!result.success) throw new ApiError(400, "BAD_REQUEST", result.error.issues[0]?.message ?? "Invalid scoring rules");
  for (const rule of result.data.rules) {
    if (rule.match.urlRegex) {
      try { new RegExp(rule.match.urlRegex); } catch { throw new ApiError(400, "BAD_REQUEST", `Rule ${rule.id} has an invalid urlRegex`); }
    }
  }
  return result.data as ScoringConfigDto;
}

export async function loadScoringConfig(): Promise<ScoringConfigDto> {
  return parseScoringConfig(await readFile(configPath, "utf8"));
}

export async function loadScoringConfigWithSource(): Promise<ScoringConfigDto> {
  const rawYaml = await readFile(configPath, "utf8");
  return { ...parseScoringConfig(rawYaml), rawYaml };
}

export async function saveScoringConfig(rawYaml: string): Promise<ScoringConfigDto> {
  const config = parseScoringConfig(rawYaml);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = configPath.replace(/\.yaml$/, `.backup.${stamp}.yaml`);
  await copyFile(configPath, backupPath);
  await writeFile(configPath, rawYaml.endsWith("\n") ? rawYaml : `${rawYaml}\n`, "utf8");
  return { ...config, rawYaml };
}
