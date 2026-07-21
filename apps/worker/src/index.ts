import dotenv from "dotenv";
import { Redis } from "ioredis";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(redisUrl, {
  lazyConnect: true,
  connectTimeout: 5_000,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});

redis.on("error", () => {
  // Connection failures are handled by the startup check below.
});

console.log("BountyOps worker started");

try {
  await redis.connect();
  const response = await redis.ping();

  if (response !== "PONG") {
    throw new Error("Unexpected Redis ping response");
  }

  console.log("Redis connection: ok");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown Redis connection error";
  console.error(`Redis connection failed: ${message}`);
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
