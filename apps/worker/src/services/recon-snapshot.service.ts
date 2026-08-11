import { Prisma, prisma } from "@bountyops/db";
import { buildFingerprint, buildStableKey, type ReconObservationEntityType, type ReconSnapshotStatus } from "@bountyops/shared";
import { runReconDiff } from "./recon-diff.service.js";

export interface ObservationCandidate {
  entityType: ReconObservationEntityType;
  entityId?: string | null;
  entity: Record<string, unknown>;
}

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function beginSnapshot(input: { programId: string; jobId?: string; jobRunId?: string; stage: string; metadata?: Record<string, unknown> }) {
  return prisma.reconSnapshot.create({ data: { programId: input.programId, jobId: input.jobId, jobRunId: input.jobRunId, stage: input.stage, status: "running", startedAt: new Date(), metadata: input.metadata ? json(input.metadata) : undefined } });
}

export async function completeSnapshot(snapshotId: string, input: { status?: ReconSnapshotStatus; comparable: boolean; observations: ObservationCandidate[]; metadata?: Record<string, unknown> }) {
  const snapshot = await prisma.reconSnapshot.findUniqueOrThrow({ where: { id: snapshotId } });
  const status = input.status ?? "success";
  const comparable = input.comparable && status === "success";
  const unique = new Map<string, ObservationCandidate>();
  for (const observation of input.observations) unique.set(`${observation.entityType}:${buildStableKey(observation.entityType, observation.entity)}`, observation);
  const rows = await Promise.all([...unique.values()].map(async (observation) => ({ snapshotId, programId: snapshot.programId, entityType: observation.entityType, entityId: observation.entityId, stableKey: buildStableKey(observation.entityType, observation.entity), fingerprint: await buildFingerprint(observation.entityType, observation.entity), metadata: json(observation.entity) })));
  await prisma.$transaction(async (transaction) => {
    if (rows.length) await transaction.reconObservation.createMany({ data: rows, skipDuplicates: true });
    await transaction.reconSnapshot.update({ where: { id: snapshotId }, data: { status, comparable, observedCount: rows.length, completedAt: new Date(), metadata: input.metadata ? json(input.metadata) : snapshot.metadata ?? undefined } });
  });
  return comparable ? runReconDiff(snapshotId) : null;
}

export async function failSnapshot(snapshotId: string, error: unknown, status: "failed" | "partial" | "skipped" = "failed") {
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  return prisma.reconSnapshot.update({ where: { id: snapshotId }, data: { status, comparable: false, completedAt: new Date(), metadata: json({ error: message }) } });
}
