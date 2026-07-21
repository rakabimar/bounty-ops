import type { Prisma, PrismaClient } from "@bountyops/db";

export interface CreateAuditLogInput {
  userId?: string;
  programId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

export function createAuditLog(prisma: PrismaClient, input: CreateAuditLogInput) {
  return prisma.auditLog.create({ data: input });
}
