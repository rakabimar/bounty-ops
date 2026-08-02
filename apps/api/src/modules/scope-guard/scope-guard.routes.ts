import {
  RECON_JOB_TYPES,
  RECON_STAGES,
  type ScopeGuardPreflightInput,
} from "@bountyops/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, parseRequest } from "../../utils/response.js";
import { evaluateScopeGuard, getScopeGuardSummary } from "./scope-guard.service.js";

const programParamsSchema = z.object({ programId: z.string().min(1) });
const preflightSchema = z.object({
  programId: z.string().min(1),
  target: z.string().trim().min(1).max(2_048),
  jobType: z.enum(RECON_JOB_TYPES),
  stage: z.enum(RECON_STAGES).optional(),
  manualApproved: z.boolean().default(false),
});
const bulkPreflightSchema = z.object({
  targets: z.array(z.string().trim().min(1).max(2_048)).min(1).max(100),
  jobType: z.enum(RECON_JOB_TYPES),
  stage: z.enum(RECON_STAGES).optional(),
  manualApproved: z.boolean().default(false),
});

export async function scopeGuardRoutes(app: FastifyInstance): Promise<void> {
  app.post("/scope-guard/preflight", { preHandler: app.requireAuth }, async (request) => {
    const body = parseRequest(preflightSchema, request.body) as ScopeGuardPreflightInput;
    return evaluateScopeGuard(app.prisma, body, { userId: request.user.sub });
  });

  app.get(
    "/programs/:programId/scope-guard/summary",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId } = parseRequest(programParamsSchema, request.params);
      const summary = await getScopeGuardSummary(app.prisma, programId);
      if (!summary) throw new ApiError(404, "NOT_FOUND", "Program not found");
      return summary;
    },
  );

  app.post(
    "/programs/:programId/scope-guard/bulk-preflight",
    { preHandler: app.requireAuth },
    async (request) => {
      const { programId } = parseRequest(programParamsSchema, request.params);
      const body = parseRequest(bulkPreflightSchema, request.body);
      const results = [];
      for (const target of body.targets) {
        results.push(
          await evaluateScopeGuard(
            app.prisma,
            {
              programId,
              target,
              jobType: body.jobType,
              stage: body.stage,
              manualApproved: body.manualApproved,
            },
            { userId: request.user.sub },
          ),
        );
      }
      return results;
    },
  );
}
