import {
  CHANGE_IMPORTANCE_VALUES,
  NOTIFICATION_EVENT_STATUSES,
} from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";

const querySchema = z.object({
  programId: z.string().optional(),
  eventType: z.string().optional(),
  importance: z.enum(CHANGE_IMPORTANCE_VALUES).optional(),
  status: z.enum(NOTIFICATION_EVENT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
const paramsSchema = z.object({ id: z.string().min(1) });
const bodySchema = z.object({ status: z.literal("ignored") });

export async function notificationEventsRoutes(app: FastifyInstance) {
  app.get(
    "/notification-events",
    { preHandler: app.requireAuth },
    async (request) => {
      const query = parseRequest(querySchema, request.query);
      return app.prisma.notificationEvent.findMany({
        where: {
          programId: query.programId,
          eventType: query.eventType,
          importance: query.importance,
          status: query.status,
        },
        orderBy: { createdAt: "desc" },
        take: query.limit,
      });
    },
  );
  app.patch(
    "/notification-events/:id/status",
    { preHandler: app.requireAuth },
    async (request) => {
      const { id } = parseRequest(paramsSchema, request.params);
      parseRequest(bodySchema, request.body);
      const existing = await app.prisma.notificationEvent.findUnique({
        where: { id },
      });
      if (!existing)
        throw new ApiError(404, "NOT_FOUND", "Notification event not found");
      const event = await app.prisma.notificationEvent.update({
        where: { id },
        data: { status: "ignored" },
      });
      await createAuditLog(app.prisma, {
        userId: request.user.sub,
        programId: event.programId ?? undefined,
        action: "notification_event.ignored",
        entityType: "notification_event",
        entityId: id,
      });
      return event;
    },
  );
}
