import { prisma } from '@/lib/domains/inventory/ledger';

export type ReceivingDispositionReason = 'NOT_RECEIVED' | 'REMOVED';
export type ReceivingDispositionStatus = 'PENDING_CREDIT' | 'RESOLVED';

export interface ReceivingDispositionRow {
  id: string;
  externalLogId: string;
  itemName: string;
  casesReceived: number;
  caseCost: number;
  reason: ReceivingDispositionReason;
  status: ReceivingDispositionStatus;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

function toRow(row: {
  id: string;
  externalLogId: string;
  itemName: string;
  casesReceived: number;
  caseCost: number;
  reason: string;
  status: string;
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}): ReceivingDispositionRow {
  return {
    id: row.id,
    externalLogId: row.externalLogId,
    itemName: row.itemName,
    casesReceived: row.casesReceived,
    caseCost: row.caseCost,
    reason: row.reason as ReceivingDispositionReason,
    status: row.status as ReceivingDispositionStatus,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export async function listPendingVendorCredits(): Promise<ReceivingDispositionRow[]> {
  const rows = await prisma.receivingDisposition.findMany({
    where: { reason: 'NOT_RECEIVED', status: 'PENDING_CREDIT' },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toRow);
}

export async function listHiddenReceivingLogIds(): Promise<string[]> {
  const rows = await prisma.receivingDisposition.findMany({
    select: { externalLogId: true },
  });
  return rows.map((r) => r.externalLogId);
}

export async function createReceivingDisposition(input: {
  externalLogId: string;
  itemName: string;
  casesReceived: number;
  caseCost: number;
  reason: ReceivingDispositionReason;
  note?: string | null;
}): Promise<ReceivingDispositionRow> {
  const isRemoved = input.reason === 'REMOVED';
  const row = await prisma.receivingDisposition.upsert({
    where: { externalLogId: input.externalLogId },
    create: {
      externalLogId: input.externalLogId,
      itemName: input.itemName,
      casesReceived: input.casesReceived,
      caseCost: input.caseCost,
      reason: input.reason,
      status: isRemoved ? 'RESOLVED' : 'PENDING_CREDIT',
      note: input.note ?? null,
      resolvedAt: isRemoved ? new Date() : null,
    },
    update: {
      itemName: input.itemName,
      casesReceived: input.casesReceived,
      caseCost: input.caseCost,
      reason: input.reason,
      status: isRemoved ? 'RESOLVED' : 'PENDING_CREDIT',
      note: input.note ?? null,
      resolvedAt: isRemoved ? new Date() : null,
    },
  });
  return toRow(row);
}

export async function resolveVendorCredit(id: string): Promise<ReceivingDispositionRow | null> {
  try {
    const row = await prisma.receivingDisposition.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    return toRow(row);
  } catch {
    return null;
  }
}
