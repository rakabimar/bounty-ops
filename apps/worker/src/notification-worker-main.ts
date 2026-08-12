import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createNotificationWorker } from "./notification-worker.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

try {
  const runtime = await createNotificationWorker(process.env.REDIS_URL ?? "redis://localhost:6379");
  console.log("BountyOps notification worker started");
  console.log("Redis connection: ok");
  console.log(`Notification transport: ${process.env.BOUNTYOPS_NOTIFICATION_TRANSPORT === "mock" ? "mock" : "telegram"}`);
  runtime.worker.on("error", (error) => console.error(`Notification worker error: ${error.message}`));
  let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; await runtime.close(); };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
} catch (error) {
  console.error(`Notification worker startup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
