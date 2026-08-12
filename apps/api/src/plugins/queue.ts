import { NOTIFICATION_DELIVERY_QUEUE_NAME, RECON_QUEUE_NAME, type ReconQueueJobData, type TelegramDeliveryPayload } from "@bountyops/shared";
import { Queue } from "bullmq";
import fp from "fastify-plugin";
import { Redis } from "ioredis";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyInstance {
    reconQueue: Queue<ReconQueueJobData>;
    notificationQueue: Queue<TelegramDeliveryPayload>;
    queueRedis: Redis;
  }
}

export const queuePlugin = fp(async (app) => {
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 5_000,
    maxRetriesPerRequest: null,
    retryStrategy: () => null,
  });
  redis.on("error", () => {
    // Enqueue operations and the queue health route report connection errors.
  });
  const queue = new Queue<ReconQueueJobData>(RECON_QUEUE_NAME, { connection: redis });
  const notificationQueue = new Queue<TelegramDeliveryPayload>(NOTIFICATION_DELIVERY_QUEUE_NAME, { connection: redis });

  app.decorate("queueRedis", redis);
  app.decorate("reconQueue", queue);
  app.decorate("notificationQueue", notificationQueue);
  app.addHook("onClose", async () => {
    await queue.close();
    await notificationQueue.close();
    redis.disconnect();
  });
});
