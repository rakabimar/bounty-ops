import { Prisma, type PrismaClient, type ReconSchedule } from "@bountyops/db";
import type {
  ReconQueueJobData,
  ReconScheduleFrequency,
} from "@bountyops/shared";
import type { Queue } from "bullmq";
import { DateTime } from "luxon";
import { createQueuedJob } from "../jobs/jobs.service.js";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function calculateNextRun(input: {
  frequency: ReconScheduleFrequency;
  timeOfDay?: string | null;
  timezone: string;
  from?: Date;
}): Date | null {
  if (input.frequency === "manual") return null;
  const now = DateTime.fromJSDate(input.from ?? new Date(), {
    zone: "utc",
  }).setZone(input.timezone);
  if (!now.isValid) throw new Error(`Invalid timezone: ${input.timezone}`);
  const [hour, minute] = (input.timeOfDay ?? "03:00").split(":").map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour! < 0 ||
    hour! > 23 ||
    minute! < 0 ||
    minute! > 59
  )
    throw new Error("timeOfDay must use HH:mm");
  let next = now.set({ hour, minute, second: 0, millisecond: 0 });
  if (input.frequency === "daily") {
    if (next <= now) next = next.plus({ days: 1 });
  } else if (input.frequency === "every_3_days") next = next.plus({ days: 3 });
  else next = next.plus({ days: 7 });
  return next.toUTC().toJSDate();
}

export async function triggerSchedule(
  prisma: PrismaClient,
  queue: Queue<ReconQueueJobData>,
  schedule: ReconSchedule,
) {
  const config =
    schedule.config &&
    typeof schedule.config === "object" &&
    !Array.isArray(schedule.config)
      ? schedule.config
      : {};
  const job = await createQueuedJob(
    prisma,
    queue,
    {
      programId: schedule.programId,
      type: schedule.jobType as "full_deep_recon",
      config,
    },
    `schedule:${schedule.id}`,
  );
  const now = new Date();
  const nextRunAt = schedule.enabled
    ? calculateNextRun({
        frequency: schedule.frequency as ReconScheduleFrequency,
        timeOfDay: schedule.timeOfDay,
        timezone: schedule.timezone,
        from: now,
      })
    : null;
  await prisma.reconSchedule.update({
    where: { id: schedule.id },
    data: { lastTriggeredAt: now, nextRunAt },
  });
  if (job.status === "blocked")
    await prisma.notificationEvent.create({
      data: {
        programId: schedule.programId,
        eventType: "schedule_blocked",
        entityType: "job",
        entityId: job.id,
        importance: "medium",
        title: "Scheduled recon blocked",
        message: `${schedule.name} was blocked by current Scope Guard policy`,
        metadata: json({ scheduleId: schedule.id }),
      },
    });
  return job;
}

export function startScheduleLoop(
  prisma: PrismaClient,
  queue: Queue<ReconQueueJobData>,
) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due = await prisma.reconSchedule.findMany({
        where: {
          enabled: true,
          frequency: { not: "manual" },
          nextRunAt: { lte: new Date() },
        },
        orderBy: { nextRunAt: "asc" },
        take: 20,
      });
      for (const schedule of due) {
        const claimedNext = calculateNextRun({
          frequency: schedule.frequency as ReconScheduleFrequency,
          timeOfDay: schedule.timeOfDay,
          timezone: schedule.timezone,
        });
        const claimed = await prisma.reconSchedule.updateMany({
          where: { id: schedule.id, nextRunAt: schedule.nextRunAt },
          data: { nextRunAt: claimedNext },
        });
        if (claimed.count)
          await triggerSchedule(prisma, queue, {
            ...schedule,
            nextRunAt: claimedNext,
          }).catch(() => undefined);
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 30_000);
  timer.unref();
  return () => clearInterval(timer);
}
