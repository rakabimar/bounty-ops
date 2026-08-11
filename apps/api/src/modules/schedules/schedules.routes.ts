import { Prisma } from "@bountyops/db";
import { RECON_SCHEDULE_FREQUENCIES } from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { IANAZone } from "luxon";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";
import { calculateNextRun, triggerSchedule } from "./schedule.service.js";

const programParams = z.object({ programId: z.string().min(1) });
const scheduleParams = z.object({
  programId: z.string().min(1),
  scheduleId: z.string().min(1),
});
const scheduleShape = z.object({
  name: z.string().trim().min(1).max(200),
  jobType: z.literal("full_deep_recon").default("full_deep_recon"),
  enabled: z.boolean().default(false),
  frequency: z.enum(RECON_SCHEDULE_FREQUENCIES),
  timeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  timezone: z.string().default("UTC"),
  config: z.record(z.string(), z.unknown()).default({}),
});
const scheduleBody = scheduleShape.refine(
  (value) => IANAZone.isValidZone(value.timezone),
  { message: "Invalid timezone", path: ["timezone"] },
);
const patchBody = scheduleShape
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  )
  .refine(
    (value) =>
      value.timezone === undefined || IANAZone.isValidZone(value.timezone),
    { message: "Invalid timezone", path: ["timezone"] },
  );
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function schedulesRoutes(app: FastifyInstance) {
  app.get(
    "/programs/:programId/schedules",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId } = parseRequest(programParams, request.params);
      return app.prisma.reconSchedule.findMany({
        where: { programId },
        orderBy: { createdAt: "desc" },
      });
    },
  );
  app.post(
    "/programs/:programId/schedules",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { programId } = parseRequest(programParams, request.params);
      const body = parseRequest(scheduleBody, request.body);
      if (!(await app.prisma.program.findUnique({ where: { id: programId } })))
        throw new ApiError(404, "NOT_FOUND", "Program not found");
      const nextRunAt = body.enabled
        ? calculateNextRun({
            frequency: body.frequency,
            timeOfDay: body.timeOfDay,
            timezone: body.timezone,
          })
        : null;
      const schedule = await app.prisma.reconSchedule.create({
        data: { ...body, programId, config: json(body.config), nextRunAt },
      });
      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId,
        action: "schedule.created",
        entityType: "schedule",
        entityId: schedule.id,
        metadata: json({
          frequency: schedule.frequency,
          enabled: schedule.enabled,
        }),
      });
      return reply.code(201).send(schedule);
    },
  );
  app.patch(
    "/programs/:programId/schedules/:scheduleId",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId, scheduleId } = parseRequest(
        scheduleParams,
        request.params,
      );
      const body = parseRequest(patchBody, request.body);
      const existing = await app.prisma.reconSchedule.findFirst({
        where: { id: scheduleId, programId },
      });
      if (!existing) throw new ApiError(404, "NOT_FOUND", "Schedule not found");
      const frequency =
        body.frequency ??
        (existing.frequency as (typeof RECON_SCHEDULE_FREQUENCIES)[number]);
      const timezone = body.timezone ?? existing.timezone;
      const timeOfDay =
        body.timeOfDay === undefined ? existing.timeOfDay : body.timeOfDay;
      const enabled = body.enabled ?? existing.enabled;
      const nextRunAt = enabled
        ? calculateNextRun({ frequency, timezone, timeOfDay })
        : null;
      const schedule = await app.prisma.reconSchedule.update({
        where: { id: scheduleId },
        data: {
          ...body,
          config: body.config ? json(body.config) : undefined,
          nextRunAt,
        },
      });
      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId,
        action: "schedule.updated",
        entityType: "schedule",
        entityId: scheduleId,
        metadata: json({ fields: Object.keys(body) }),
      });
      return schedule;
    },
  );
  app.delete(
    "/programs/:programId/schedules/:scheduleId",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { programId, scheduleId } = parseRequest(
        scheduleParams,
        request.params,
      );
      const deleted = await app.prisma.reconSchedule.deleteMany({
        where: { id: scheduleId, programId },
      });
      if (!deleted.count)
        throw new ApiError(404, "NOT_FOUND", "Schedule not found");
      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId,
        action: "schedule.deleted",
        entityType: "schedule",
        entityId: scheduleId,
      });
      return reply.code(204).send();
    },
  );
  app.post(
    "/programs/:programId/schedules/:scheduleId/run-now",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId, scheduleId } = parseRequest(
        scheduleParams,
        request.params,
      );
      const schedule = await app.prisma.reconSchedule.findFirst({
        where: { id: scheduleId, programId },
      });
      if (!schedule) throw new ApiError(404, "NOT_FOUND", "Schedule not found");
      return triggerSchedule(app.prisma, app.reconQueue, schedule);
    },
  );
}
