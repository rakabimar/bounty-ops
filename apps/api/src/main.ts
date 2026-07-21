import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { prisma } from "@bountyops/db";
import dotenv from "dotenv";
import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

export const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});
await app.register(cookie);

app.get("/health", async (request, reply) => {
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;

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

const port = Number(process.env.API_PORT ?? 3000);

export async function startApi(): Promise<void> {
  try {
    await app.listen({ port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;

if (entrypoint === import.meta.url) {
  await startApi();
}
