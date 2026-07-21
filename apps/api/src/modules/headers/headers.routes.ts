import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";

const programParamsSchema = z.object({ programId: z.string().min(1) });
const headerParamsSchema = z.object({
  programId: z.string().min(1),
  headerId: z.string().min(1),
});

const createHeaderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  value: z.string().min(1),
  isRequired: z.boolean().default(true),
});

const updateHeaderSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    value: z.string().min(1).optional(),
    isRequired: z.boolean().optional(),
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

export async function headersRoutes(app: FastifyInstance): Promise<void> {
  app.get("/programs/:programId/headers", { preHandler: app.requireAuth }, async (request) => {
    const { programId } = parseRequest(programParamsSchema, request.params);
    await ensureProgram(app, programId);

    return app.prisma.programHeader.findMany({
      where: { programId },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post(
    "/programs/:programId/headers",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { programId } = parseRequest(programParamsSchema, request.params);
      const body = parseRequest(createHeaderSchema, request.body);
      await ensureProgram(app, programId);

      // TODO(Phase 3): encrypt sensitive header values at rest in production.
      const header = await app.prisma.programHeader.create({
        data: { programId, ...body },
      });

      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId,
        action: "header.created",
        entityType: "header",
        entityId: header.id,
      });

      return reply.code(201).send(header);
    },
  );

  app.patch(
    "/programs/:programId/headers/:headerId",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId, headerId } = parseRequest(headerParamsSchema, request.params);
      const body = parseRequest(updateHeaderSchema, request.body);
      const existing = await app.prisma.programHeader.findFirst({
        where: { id: headerId, programId },
        select: { id: true },
      });

      if (!existing) {
        throw new ApiError(404, "NOT_FOUND", "Header not found");
      }

      const header = await app.prisma.programHeader.update({
        where: { id: headerId },
        data: body,
      });

      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId,
        action: "header.updated",
        entityType: "header",
        entityId: headerId,
        metadata: { fields: Object.keys(body) },
      });

      return header;
    },
  );

  app.delete(
    "/programs/:programId/headers/:headerId",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId, headerId } = parseRequest(headerParamsSchema, request.params);
      const existing = await app.prisma.programHeader.findFirst({
        where: { id: headerId, programId },
        select: { id: true },
      });

      if (!existing) {
        throw new ApiError(404, "NOT_FOUND", "Header not found");
      }

      await app.prisma.programHeader.delete({ where: { id: headerId } });
      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId,
        action: "header.deleted",
        entityType: "header",
        entityId: headerId,
      });

      return { success: true };
    },
  );
}
