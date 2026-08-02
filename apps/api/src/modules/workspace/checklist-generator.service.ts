import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@bountyops/db";
import { CHECKLIST_PRIORITIES, WORKSPACE_ENTITY_TYPES } from "@bountyops/shared";
import type { WorkspaceEntityType } from "@bountyops/shared";
import { parse } from "yaml";
import { z } from "zod";
import { ApiError } from "../../utils/response.js";
import { resolveWorkspaceEntity } from "./entity-resolver.js";

const configPath = fileURLToPath(new URL("../../../../../configs/checklist-rules.yaml", import.meta.url));
const itemSchema = z.object({ title: z.string().min(1), description: z.string().optional(), priority: z.enum(CHECKLIST_PRIORITIES).default("medium"), category: z.string().optional() });
const configSchema = z.object({ version: z.number().int().positive(), rules: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), enabled: z.boolean(), entityTypes: z.array(z.enum(WORKSPACE_ENTITY_TYPES)), categories: z.array(z.string()).default([]), reasonTags: z.array(z.string()).default([]), items: z.array(itemSchema) })) });

async function loadChecklistRules() {
  let value: unknown;
  try { value = parse(await readFile(configPath, "utf8")); } catch { throw new ApiError(500, "INTERNAL_ERROR", "Checklist rules could not be loaded"); }
  const result = configSchema.safeParse(value);
  if (!result.success) throw new ApiError(500, "INTERNAL_ERROR", "Checklist rules are invalid");
  return result.data;
}

export async function generateEntityChecklist(prisma: PrismaClient, entityType: WorkspaceEntityType, entityId: string) {
  const entity = await resolveWorkspaceEntity(prisma, entityType, entityId);
  const config = await loadChecklistRules();
  const categories = new Set(entity.categories);
  const reasonTags = new Set(entity.reasonTags);
  const rules = config.rules.filter((rule) => rule.enabled && rule.entityTypes.includes(entityType) && (rule.categories.some((value) => categories.has(value)) || rule.reasonTags.some((value) => reasonTags.has(value))));
  let checklist = await prisma.manualChecklist.findFirst({ where: { entityType, entityId, source: "auto" }, include: { items: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } } });
  if (!checklist) checklist = await prisma.manualChecklist.create({ data: { programId: entity.programId, entityType, entityId, title: "Suggested manual checks", source: "auto" }, include: { items: true } });
  const existingTitles = new Set(checklist.items.filter((item) => item.source === "auto").map((item) => item.title.trim().toLowerCase()));
  const pending = rules.flatMap((rule) => rule.items).filter((item) => !existingTitles.has(item.title.trim().toLowerCase()));
  if (pending.length) await prisma.checklistItem.createMany({ data: pending.map((item, index) => ({ checklistId: checklist!.id, title: item.title, description: item.description, category: item.category, priority: item.priority, order: checklist!.items.length + index, source: "auto" })) });
  return prisma.manualChecklist.findUniqueOrThrow({ where: { id: checklist.id }, include: { items: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } } });
}
