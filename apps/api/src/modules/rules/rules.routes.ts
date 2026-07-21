import type { Prisma } from "@bountyops/db";
import { AUTOMATION_ALLOWED_VALUES } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";

const programParamsSchema = z.object({ programId: z.string().min(1) });

const rulesSchema = z.object({
  automationAllowed: z.enum(AUTOMATION_ALLOWED_VALUES).default("unknown"),
  aggressiveAllowed: z.boolean().default(false),
  rateLimitRps: z.number().int().positive().nullable().optional(),
  maxConcurrency: z.number().int().positive().nullable().optional(),
  forbiddenActions: z.array(z.string().trim().min(1)).optional(),
  authTestingAllowed: z.boolean().default(false),
  dosTestingAllowed: z.boolean().default(false),
  notes: z.string().nullable().optional(),
});

async function ensureProgram(app: FastifyInstance, programId: string): Promise<void> {
  const exists = await app.prisma.program.findUnique({
    where: { id: programId },
    select: { id: true },
  });

  if (!exists) {
    throw new ApiError(404, "NOT_FOUND", "Program not found");
  }
}

export async function rulesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/programs/:programId/rules", { preHandler: app.requireAuth }, async (request) => {
    const { programId } = parseRequest(programParamsSchema, request.params);
    await ensureProgram(app, programId);

    return app.prisma.programRules.upsert({
      where: { programId },
      update: {},
      create: { programId },
    });
  });

  app.put("/programs/:programId/rules", { preHandler: app.requireAuth }, async (request) => {
    const { programId } = parseRequest(programParamsSchema, request.params);
    const body = parseRequest(rulesSchema, request.body);
    await ensureProgram(app, programId);

    const updateData: Prisma.ProgramRulesUncheckedUpdateInput = {
      ...body,
      forbiddenActions: body.forbiddenActions,
    };
    const createData: Prisma.ProgramRulesUncheckedCreateInput = {
      programId,
      ...body,
      forbiddenActions: body.forbiddenActions,
    };
    const rules = await app.prisma.programRules.upsert({
      where: { programId },
      update: updateData,
      create: createData,
    });

    await createAuditLog(app.prisma, {
      userId: request.user.sub,
      programId,
      action: "rules.updated",
      entityType: "rules",
      entityId: rules.id,
    });

    return rules;
  });
}
