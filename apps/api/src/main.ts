import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import Fastify from "fastify";

dotenv.config();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});
await app.register(cookie);

app.get("/health", async () => ({
  status: "ok",
  service: "bountyops-api",
  timestamp: new Date().toISOString(),
}));

const port = Number(process.env.API_PORT ?? 3000);

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
