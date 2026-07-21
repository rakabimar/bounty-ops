import type { Prisma } from "@bountyops/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseRequest } from "../../utils/response.js";

const auditQuerySchema = z.object({
  programId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get("/audit-logs", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(auditQuerySchema, request.query);
    const where: Prisma.AuditLogWhereInput = {
      programId: query.programId,
      action: query.action,
    };

    return app.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
  });
}
