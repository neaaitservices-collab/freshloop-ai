export const OFFLINE_MUTATION_KIND = {
  VOICE_COMMIT: 'voice_commit',
  INVENTORY_MOVE: 'inventory_move',
  STOCK_COUNT: 'stock_count',
} as const;

export type OfflineMutationKind =
  (typeof OFFLINE_MUTATION_KIND)[keyof typeof OFFLINE_MUTATION_KIND];

export type OfflineMutationStatus = 'pending' | 'processing' | 'failed';

export interface OfflineMutationRecord {
  id: string;
  kind: OfflineMutationKind;
  status: OfflineMutationStatus;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError: string | null;
  /** Stable id sent to the API for deduplication (`OFFLINE-{id}` on ledger). */
  clientMutationId: string;
  url: string;
  method: 'POST' | 'PATCH';
  body: Record<string, unknown>;
  /** Human label for sync UI (SKU name, etc.). */
  label: string;
}

export type OfflineSyncPhase = 'idle' | 'syncing' | 'error';

export interface OfflineSyncSnapshot {
  online: boolean;
  pendingCount: number;
  phase: OfflineSyncPhase;
  lastSyncedAt: number | null;
  lastError: string | null;
}
