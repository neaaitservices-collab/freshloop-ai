import { prisma } from '@/lib/domains/inventory/ledger';

export const OFFLINE_REFERENCE_PREFIX = 'OFFLINE-';

export function offlineReferenceId(clientMutationId: string): string {
  const id = clientMutationId.trim();
  if (!id) throw new Error('clientMutationId is required.');
  return `${OFFLINE_REFERENCE_PREFIX}${id}`;
}

export async function hasOfflineMutationReference(referenceId: string): Promise<boolean> {
  const hit = await prisma.inventoryTransaction.findFirst({
    where: { referenceId },
    select: { id: true },
  });
  return Boolean(hit);
}

export async function isOfflineMutationApplied(clientMutationId: string): Promise<boolean> {
  return hasOfflineMutationReference(offlineReferenceId(clientMutationId));
}
