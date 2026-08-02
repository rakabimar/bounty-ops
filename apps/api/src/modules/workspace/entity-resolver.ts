import type { PrismaClient } from "@bountyops/db";
import type { WorkspaceEntityType } from "@bountyops/shared";
import { ApiError } from "../../utils/response.js";

export interface ResolvedWorkspaceEntity {
  entityType: WorkspaceEntityType;
  entityId: string;
  programId: string;
  status: string | null;
  categories: string[];
  reasonTags: string[];
}

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export async function resolveWorkspaceEntity(prisma: PrismaClient, entityType: WorkspaceEntityType, entityId: string): Promise<ResolvedWorkspaceEntity> {
  if (entityType === "asset") {
    const item = await prisma.asset.findUnique({ where: { id: entityId } });
    if (item) return { entityType, entityId, programId: item.programId, status: item.status, categories: strings(item.categories), reasonTags: strings(item.reasonTags) };
  }
  if (entityType === "url") {
    const item = await prisma.url.findUnique({ where: { id: entityId } });
    if (item) return { entityType, entityId, programId: item.programId, status: item.status, categories: strings(item.categories), reasonTags: strings(item.reasonTags) };
  }
  if (entityType === "endpoint") {
    const item = await prisma.apiEndpoint.findUnique({ where: { id: entityId } });
    if (item) return { entityType, entityId, programId: item.programId, status: item.status, categories: strings(item.categories), reasonTags: strings(item.reasonTags) };
  }
  if (entityType === "scanner_finding") {
    const item = await prisma.scannerFinding.findUnique({ where: { id: entityId }, include: { asset: true, url: true, endpoint: true } });
    if (item) {
      const text = `${item.name} ${item.templateId ?? ""} ${item.matchedUrl ?? ""}`.toLowerCase();
      const inferred = text.includes("graphql") ? ["graphql"] : [];
      return { entityType, entityId, programId: item.programId, status: item.status, categories: [...new Set([...strings(item.asset?.categories), ...strings(item.url?.categories), ...strings(item.endpoint?.categories), ...inferred])], reasonTags: [...new Set([...strings(item.asset?.reasonTags), ...strings(item.url?.reasonTags), ...strings(item.endpoint?.reasonTags)])] };
    }
  }
  if (entityType === "http_service") {
    const item = await prisma.httpService.findUnique({ where: { id: entityId }, include: { asset: true } });
    if (item) return { entityType, entityId, programId: item.programId, status: item.failed ? "failed" : "live", categories: strings(item.asset?.categories), reasonTags: strings(item.asset?.reasonTags) };
  }
  if (entityType === "dns_record") {
    const item = await prisma.dnsRecord.findUnique({ where: { id: entityId }, include: { asset: true } });
    if (item) return { entityType, entityId, programId: item.programId, status: null, categories: strings(item.asset?.categories), reasonTags: strings(item.asset?.reasonTags) };
  }
  if (entityType === "job") {
    const item = await prisma.job.findUnique({ where: { id: entityId } });
    if (item?.programId) return { entityType, entityId, programId: item.programId, status: item.status, categories: [], reasonTags: [] };
  }
  throw new ApiError(404, "NOT_FOUND", "Workspace entity not found");
}
