import { Prisma } from "@bountyops/db";
import { CHANGE_IMPORTANCE_VALUES } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";

const date = z.coerce.date().optional();
const changesQuery = z.object({
  programId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  type: z.string().optional(),
  importance: z.enum(CHANGE_IMPORTANCE_VALUES).optional(),
  from: date,
  to: date,
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
const summaryQuery = z.object({
  programId: z.string().optional(),
  period: z.enum(["24h", "7d", "30d"]).default("7d"),
});
const diffQuery = z.object({
  programId: z.string().optional(),
  stage: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const diffParams = z.object({ diffBatchId: z.string().min(1) });
const historyParams = z.object({ programId: z.string().min(1) });
const historyQuery = z.object({
  stage: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  from: date,
  to: date,
});

export async function reconHistoryRoutes(app: FastifyInstance) {
  app.get("/changes", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(changesQuery, request.query);
    const where: Prisma.EntityChangeWhereInput = {
      programId: query.programId,
      entityType: query.entityType,
      entityId: query.entityId,
      type: query.type,
      importance: query.importance,
      createdAt:
        query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
    };
    return app.prisma.entityChange.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
  });
  app.get(
    "/changes/summary",
    { preHandler: app.requireAuth },
    async (request) => {
      const query = parseRequest(summaryQuery, request.query);
      const milliseconds =
        query.period === "24h"
          ? 86_400_000
          : query.period === "7d"
            ? 604_800_000
            : 2_592_000_000;
      const changes = await app.prisma.entityChange.findMany({
        where: {
          programId: query.programId,
          createdAt: { gte: new Date(Date.now() - milliseconds) },
        },
        select: { type: true, importance: true },
      });
      const groupedByType: Record<string, number> = {};
      for (const change of changes)
        groupedByType[change.type] = (groupedByType[change.type] ?? 0) + 1;
      return {
        totalChanges: changes.length,
        highImportance: changes.filter((item) => item.importance === "high")
          .length,
        criticalImportance: changes.filter(
          (item) => item.importance === "critical",
        ).length,
        newAssets: groupedByType.asset_discovered ?? 0,
        newUrls: groupedByType.url_discovered ?? 0,
        newEndpoints: groupedByType.endpoint_discovered ?? 0,
        scannerFindingsAppeared: groupedByType.scanner_finding_appeared ?? 0,
        scannerFindingsResolved: groupedByType.scanner_finding_resolved ?? 0,
        priorityPromotions: groupedByType.priority_changed ?? 0,
        groupedByType,
      };
    },
  );
  app.get("/recon-diffs", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(diffQuery, request.query);
    return app.prisma.reconDiffBatch.findMany({
      where: { programId: query.programId, stage: query.stage },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
  });
  app.get(
    "/recon-diffs/:diffBatchId",
    { preHandler: app.requireAuth },
    async (request) => {
      const { diffBatchId } = parseRequest(diffParams, request.params);
      const batch = await app.prisma.reconDiffBatch.findUnique({
        where: { id: diffBatchId },
      });
      if (!batch) throw new ApiError(404, "NOT_FOUND", "Recon diff not found");
      const changes = await app.prisma.entityChange.findMany({
        where: { source: `recon_diff:${batch.id}` },
        orderBy: { createdAt: "asc" },
      });
      return { ...batch, changes };
    },
  );
  app.get(
    "/programs/:programId/recon-history",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId } = parseRequest(historyParams, request.params);
      const query = parseRequest(historyQuery, request.query);
      const range =
        query.from || query.to ? { gte: query.from, lte: query.to } : undefined;
      const [jobs, snapshots, diffBatches, changes] = await Promise.all([
        app.prisma.jobRun.findMany({
          where: { programId, createdAt: range },
          include: { job: true, toolRuns: true },
          orderBy: { createdAt: "desc" },
          take: query.limit,
        }),
        app.prisma.reconSnapshot.findMany({
          where: { programId, stage: query.stage, createdAt: range },
          orderBy: { createdAt: "desc" },
          take: query.limit,
        }),
        app.prisma.reconDiffBatch.findMany({
          where: { programId, stage: query.stage, createdAt: range },
          orderBy: { createdAt: "desc" },
          take: query.limit,
        }),
        app.prisma.entityChange.groupBy({
          by: ["type"],
          where: { programId, createdAt: range },
          _count: true,
        }),
      ]);
      return {
        jobs,
        snapshots,
        diffBatches,
        changeCounts: Object.fromEntries(
          changes.map((item) => [item.type, item._count]),
        ),
      };
    },
  );
}
