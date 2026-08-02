import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { auditRoutes } from "./modules/audit/audit.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { headersRoutes } from "./modules/headers/headers.routes.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";
import { programsRoutes } from "./modules/programs/programs.routes.js";
import { rulesRoutes } from "./modules/rules/rules.routes.js";
import { scopesRoutes } from "./modules/scopes/scopes.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { scopeGuardRoutes } from "./modules/scope-guard/scope-guard.routes.js";
import { jobsRoutes } from "./modules/jobs/jobs.routes.js";
import { assetsRoutes } from "./modules/assets/assets.routes.js";
import { toolsRoutes } from "./modules/tools/tools.routes.js";
import { scoringRoutes } from "./modules/scoring/scoring.routes.js";
import { urlsRoutes } from "./modules/urls/urls.routes.js";
import { endpointsRoutes } from "./modules/endpoints/endpoints.routes.js";
import { scannerFindingsRoutes } from "./modules/scanner-findings/scanner-findings.routes.js";
import { workspaceRoutes } from "./modules/workspace/workspace.routes.js";
import { authPlugin } from "./plugins/auth.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { queuePlugin } from "./plugins/queue.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(prismaPlugin);
  await app.register(queuePlugin);
  await app.register(authPlugin);
  await app.register(errorHandlerPlugin);

  app.get("/health", async (request, reply) => {
    const timestamp = new Date().toISOString();

    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        service: "bountyops-api",
        database: "ok",
        timestamp,
      };
    } catch (error) {
      request.log.error({ err: error }, "Database health check failed");
      return reply.code(503).send({
        status: "degraded",
        service: "bountyops-api",
        database: "error",
        error: "Database connectivity check failed",
        timestamp,
      });
    }
  });

  await app.register(authRoutes);
  await app.register(programsRoutes);
  await app.register(scopesRoutes);
  await app.register(rulesRoutes);
  await app.register(headersRoutes);
  await app.register(settingsRoutes);
  await app.register(notificationsRoutes);
  await app.register(auditRoutes);
  await app.register(scopeGuardRoutes);
  await app.register(jobsRoutes);
  await app.register(assetsRoutes);
  await app.register(toolsRoutes);
  await app.register(scoringRoutes);
  await app.register(urlsRoutes);
  await app.register(endpointsRoutes);
  await app.register(scannerFindingsRoutes);
  await app.register(workspaceRoutes);

  return app;
}
