import { Prisma, TargetAction } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { moveRetailStock } from '@/lib/domains/inventory/stock';

export interface VoiceCommitLine {
  product_id: string;
  quantity: number;
  target_action: 'DISCARD' | 'PULL_RESCUE' | string;
}

/** Ledger-row count for lines that actually moved stock. A zero-unit replay adds nothing. */
export function accountVoiceCommit(
  lines: Array<{ units: number; action: 'waste' | 'rescue' }>
): { transactionsCreated: number; writeAuditLog: boolean } {
  let transactionsCreated = 0;
  let writeAuditLog = false;
  for (const line of lines) {
    if (!(line.units > 0)) continue;
    writeAuditLog = true;
    transactionsCreated += line.action === 'rescue' ? 2 : 1;
  }
  return { transactionsCreated, writeAuditLog };
}

export async function commitConfirmedVoiceItems(input: {
  actorId: string;
  clientMutationId: string;
  confirmedItems: VoiceCommitLine[];
  transcript?: string;
}): Promise<{ transactionsCreated: number; deduped: boolean; voiceLogId: string | null }> {
  const outcomes: Array<{ units: number; action: 'waste' | 'rescue' }> = [];
  for (let index = 0; index < input.confirmedItems.length; index += 1) {
    const item = input.confirmedItems[index]!;
    const action = item.target_action === 'DISCARD' ? 'waste' : 'rescue';
    const lineMutationId = input.clientMutationId
      ? `${input.clientMutationId}:${index}:${item.product_id}`
      : undefined;
    const moved = await moveRetailStock(
      item.product_id,
      action,
      input.actorId,
      Math.abs(Number(item.quantity) || 1),
      lineMutationId
    );
    outcomes.push({ units: moved.units, action });
  }
  const account = accountVoiceCommit(outcomes);
  if (!account.writeAuditLog) {
    return { transactionsCreated: 0, deduped: true, voiceLogId: null };
  }
  const hasDiscard = input.confirmedItems.some((item) => item.target_action === 'DISCARD');
  const voiceLog = await prisma.voiceLog.create({
    data: {
      transcript: input.transcript?.trim() || 'Voice floor log (confirmed)',
      parsedData: input.confirmedItems as unknown as Prisma.InputJsonValue,
      targetAction: hasDiscard ? TargetAction.DISCARD : TargetAction.KITCHEN_RESCUE,
    },
    select: { id: true },
  });
  return {
    transactionsCreated: account.transactionsCreated,
    deduped: false,
    voiceLogId: voiceLog.id,
  };
}
