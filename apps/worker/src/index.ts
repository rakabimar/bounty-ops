import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createReconWorker } from "./recon-worker.js";
import { createNotificationWorker } from "./notification-worker.js";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

try {
  const runtime = await createReconWorker(redisUrl);
  const notificationRuntime = await createNotificationWorker(redisUrl);
  console.log("BountyOps worker started");
  console.log("Redis connection: ok");
  console.log("Recon queue consumer: ready");
  console.log(`Notification transport: ${process.env.BOUNTYOPS_NOTIFICATION_TRANSPORT === "mock" ? "mock" : "telegram"}`);
  console.log("Notification delivery consumer: ready");

  runtime.worker.on("completed", (job) => console.log(`Job completed: ${job.data.jobId}`));
  runtime.worker.on("failed", (job, error) => console.error(`Job failed: ${job?.data.jobId ?? "unknown"}: ${error.message}`));
  runtime.worker.on("error", (error) => console.error(`Worker error: ${error.message}`));
  notificationRuntime.worker.on("completed", (job) => console.log(`Notification delivery completed: ${job.data.notificationEventId}`));
  notificationRuntime.worker.on("failed", (job, error) => console.error(`Notification delivery failed: ${job?.data.notificationEventId ?? "unknown"}: ${error.message}`));

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await notificationRuntime.close();
    await runtime.close();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown Redis connection error";
  console.error(`Redis connection failed: ${message}`);
  process.exitCode = 1;
}
