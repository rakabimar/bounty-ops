import type { Prisma } from "@bountyops/db";
import { SCOPE_ASSET_TYPES } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { normalizeAsset } from "../../utils/normalize.js";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";

const programParamsSchema = z.object({ programId: z.string().min(1) });
const scopeParamsSchema = z.object({
  programId: z.string().min(1),
  scopeId: z.string().min(1),
});

const createScopeSchema = z.object({
  asset: z.string().trim().min(1),
  assetType: z.enum(SCOPE_ASSET_TYPES),
  isInScope: z.boolean(),
  bountyEligible: z.boolean().default(true),
  notes: z.string().nullable().optional(),
});

const updateScopeSchema = z
  .object({
    asset: z.string().trim().min(1).optional(),
    assetType: z.enum(SCOPE_ASSET_TYPES).optional(),
    isInScope: z.boolean().optional(),
    bountyEligible: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

async function ensureProgram(app: FastifyInstance, programId: string): Promise<void> {
  const exists = await app.prisma.program.findUnique({
    where: { id: programId },
    select: { id: true },
  });

  if (!exists) {
    throw new ApiError(404, "NOT_FOUND", "Program not found");
  }
}

export async function scopesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/programs/:programId/scopes", { preHandler: app.requireAuth }, async (request) => {
    const { programId } = parseRequest(programParamsSchema, request.params);
    await ensureProgram(app, programId);

    return app.prisma.programScope.findMany({
      where: { programId },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post(
    "/programs/:programId/scopes",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { programId } = parseRequest(programParamsSchema, request.params);
      const body = parseRequest(createScopeSchema, request.body);
      await ensureProgram(app, programId);

      const scope = await app.prisma.programScope.create({
        data: {
          programId,
          ...body,
          normalizedAsset: normalizeAsset(body.asset),
        },
      });

      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId,
        action: "scope.created",
        entityType: "scope",
        entityId: scope.id,
      });

      return reply.code(201).send(scope);
    },
  );

  app.patch(
    "/programs/:programId/scopes/:scopeId",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId, scopeId } = parseRequest(scopeParamsSchema, request.params);
      const body = parseRequest(updateScopeSchema, request.body);
      const existing = await app.prisma.programScope.findFirst({
        where: { id: scopeId, programId },
      });

      if (!existing) {
        throw new ApiError(404, "NOT_FOUND", "Scope not found");
      }

      const data: Prisma.ProgramScopeUpdateInput = {
        ...body,
        normalizedAsset: body.asset ? normalizeAsset(body.asset) : undefined,
      };
      const scope = await app.prisma.programScope.update({ where: { id: scopeId }, data });

      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId,
        action: "scope.updated",
        entityType: "scope",
        entityId: scopeId,
        metadata: { fields: Object.keys(body) },
      });

      return scope;
    },
  );

  app.delete(
    "/programs/:programId/scopes/:scopeId",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId, scopeId } = parseRequest(scopeParamsSchema, request.params);
      const existing = await app.prisma.programScope.findFirst({
        where: { id: scopeId, programId },
        select: { id: true },
      });

      if (!existing) {
        throw new ApiError(404, "NOT_FOUND", "Scope not found");
      }

      await app.prisma.programScope.delete({ where: { id: scopeId } });
      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId,
        action: "scope.deleted",
        entityType: "scope",
        entityId: scopeId,
      });

      return { success: true };
    },
  );
}
