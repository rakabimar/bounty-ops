import { prisma, type PrismaClient } from "@bountyops/db";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async (app) => {
  app.decorate("prisma", prisma);
});
