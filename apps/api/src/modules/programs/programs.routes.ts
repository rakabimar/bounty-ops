import type { Prisma } from "@bountyops/db";
import {
  HUNTING_STATUSES,
  PLATFORMS,
  PROGRAM_STATUSES,
} from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";

const programParamsSchema = z.object({ programId: z.string().min(1) });

const programQuerySchema = z.object({
  status: z.enum(PROGRAM_STATUSES).optional(),
  platform: z.enum(PLATFORMS).optional(),
  huntingStatus: z.enum(HUNTING_STATUSES).optional(),
  search: z.string().trim().min(1).optional(),
});

const createProgramSchema = z.object({
  platform: z.enum(PLATFORMS),
  name: z.string().trim().min(1).max(200),
  handle: z.string().trim().max(200).optional(),
  programUrl: z.url().optional(),
  status: z.enum(PROGRAM_STATUSES).default("active"),
  huntingStatus: z.enum(HUNTING_STATUSES).default("ongoing"),
  rawPolicyText: z.string().optional(),
});

const updateProgramSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    handle: z.string().trim().max(200).nullable().optional(),
    programUrl: z.url().nullable().optional(),
    status: z.enum(PROGRAM_STATUSES).optional(),
    huntingStatus: z.enum(HUNTING_STATUSES).optional(),
    rawPolicyText: z.string().nullable().optional(),
    lastSyncedAt: z.iso.datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

async function ensureProgram(app: FastifyInstance, programId: string): Promise<void> {
  const program = await app.prisma.program.findUnique({
    where: { id: programId },
    select: { id: true },
  });

  if (!program) {
    throw new ApiError(404, "NOT_FOUND", "Program not found");
  }
}

export async function programsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/programs", { preHandler: app.requireAuth }, async (request) => {
    const query = parseRequest(programQuerySchema, request.query);
    const where: Prisma.ProgramWhereInput = {
      status: query.status,
      platform: query.platform,
      huntingStatus: query.huntingStatus,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { handle: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const programs = await app.prisma.program.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { scopes: true, headers: true } },
        rules: { select: { id: true } },
      },
    });

    return programs.map(({ _count, rules, ...program }) => ({
      ...program,
      scopesCount: _count.scopes,
      headersCount: _count.headers,
      hasRules: Boolean(rules),
    }));
  });

  app.post("/programs", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseRequest(createProgramSchema, request.body);
    const program = await app.prisma.program.create({
      data: {
        ...body,
        rules: {
          create: {
            automationAllowed: "unknown",
            aggressiveAllowed: false,
            dosTestingAllowed: false,
          },
        },
      },
      include: { scopes: true, rules: true, headers: true },
    });

    await createAuditLog(app.prisma, {
      userId: request.user.sub,
      programId: program.id,
      action: "program.created",
      entityType: "program",
      entityId: program.id,
    });

    return reply.code(201).send(program);
  });

  app.get("/programs/:programId", { preHandler: app.requireAuth }, async (request) => {
    const { programId } = parseRequest(programParamsSchema, request.params);
    const program = await app.prisma.program.findUnique({
      where: { id: programId },
      include: {
        scopes: { orderBy: { createdAt: "asc" } },
        rules: true,
        headers: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!program) {
      throw new ApiError(404, "NOT_FOUND", "Program not found");
    }

    return program;
  });

  app.patch("/programs/:programId", { preHandler: app.requireAuth }, async (request) => {
    const { programId } = parseRequest(programParamsSchema, request.params);
    const body = parseRequest(updateProgramSchema, request.body);
    await ensureProgram(app, programId);

    const data: Prisma.ProgramUpdateInput = {
      ...body,
      lastSyncedAt:
        body.lastSyncedAt === undefined
          ? undefined
          : body.lastSyncedAt === null
            ? null
            : new Date(body.lastSyncedAt),
    };

    const program = await app.prisma.program.update({ where: { id: programId }, data });

    await createAuditLog(app.prisma, {
      userId: request.user.sub,
      programId,
      action: "program.updated",
      entityType: "program",
      entityId: programId,
      metadata: { fields: Object.keys(body) },
    });

    return program;
  });

  app.delete("/programs/:programId", { preHandler: app.requireAuth }, async (request) => {
    const { programId } = parseRequest(programParamsSchema, request.params);
    await ensureProgram(app, programId);

    const program = await app.prisma.program.update({
      where: { id: programId },
      data: { status: "archived", huntingStatus: "not_hunting" },
    });

    await createAuditLog(app.prisma, {
      userId: request.user.sub,
      programId,
      action: "program.archived",
      entityType: "program",
      entityId: programId,
    });

    return program;
  });
}
