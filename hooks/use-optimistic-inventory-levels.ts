'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  executeInventoryMove,
  notifyInventoryUpdated,
  type InventoryMoveAction,
  transferSuccessMessage,
  type SubInventoryTransferRow,
} from '@/lib/domains/inventory/inventoryMoveClient';
import { applyOptimisticMove } from '@/lib/domains/inventory/optimisticStock';
import { patchInventoryLevel } from '@/lib/domains/inventory/inventoryLevelsClient';
import { applyStockLevelPatch } from '@/lib/domains/inventory/subInventoryView';
import type { StockLevel } from '@/lib/domains/inventory/stock';

export type OptimisticMovePayload = {
  productId: string;
  action: InventoryMoveAction;
  quantity: number;
  discountPct?: number;
};

function applyMoveReducer(state: StockLevel[], update: OptimisticMovePayload): StockLevel[] {
  const row = state.find((r) => r.productId === update.productId);
  if (!row) return state;
  const preview = applyOptimisticMove(row, update.action, update.quantity, update.discountPct);
  return applyStockLevelPatch(state, preview);
}

function snapshotKey(levels: StockLevel[] | null): string | null {
  return levels == null ? null : JSON.stringify(levels);
}

export function useOptimisticInventoryLevels(initialLevels: StockLevel[] | null) {
  const [levels, setLevels] = useState<StockLevel[]>(() => initialLevels ?? []);
  const levelsRef = useRef(levels);
  const inFlight = useRef(new Set<string>());
  const snapshot = snapshotKey(initialLevels);

  useEffect(() => {
    levelsRef.current = levels;
  }, [levels]);

  useEffect(() => {
    if (!initialLevels) return;
    setLevels((current) => (snapshotKey(current) === snapshot ? current : initialLevels));
  }, [initialLevels, snapshot]);

  const performMove = useCallback(
    async (input: {
      productId: string;
      action: InventoryMoveAction;
      quantity?: number;
      staffId?: string;
      discountPct?: number;
      clientMutationId?: string;
      row: SubInventoryTransferRow;
    }) => {
      if (inFlight.current.has(input.productId)) {
        return {
          success: false as const,
          error: 'This item is already updating — wait a moment.',
        };
      }
      inFlight.current.add(input.productId);

      const quantity =
        input.action === 'markdown'
          ? input.row.onHand
          : Math.max(0, input.quantity ?? 0);

      const revertSnapshot = levelsRef.current;
      setLevels((current) =>
        applyMoveReducer(current, {
          productId: input.productId,
          action: input.action,
          quantity,
          discountPct: input.discountPct,
        })
      );

      let result: Awaited<ReturnType<typeof executeInventoryMove>>;
      try {
        result = await executeInventoryMove({
          productId: input.productId,
          action: input.action,
          quantity: input.action === 'markdown' ? undefined : quantity,
          staffId: input.staffId,
          discountPct: input.discountPct,
          clientMutationId: input.clientMutationId,
          broadcast: false,
        });
      } finally {
        inFlight.current.delete(input.productId);
      }

      if (result.success && result.queuedOffline) {
        const level = levelsRef.current.find((row) => row.productId === input.productId);
        if (level) {
          return {
            success: true as const,
            level,
            message: transferSuccessMessage(input.action, input.row, level, result.units ?? quantity),
          };
        }
      }

      if (result.success && result.level) {
        setLevels((current) => applyStockLevelPatch(current, result.level!));
        notifyInventoryUpdated({
          level: result.level,
          productId: input.productId,
          source: 'level-patch',
        });
        if (input.action === 'rescue' && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('freshloop-kitchen-inbox', {
              detail: { productId: input.productId, units: result.units },
            })
          );
        }
        return {
          success: true as const,
          level: result.level,
          message: transferSuccessMessage(input.action, input.row, result.level, result.units),
        };
      }

      setLevels(revertSnapshot);
      return {
        success: false as const,
        error: result.error ?? 'Transfer failed.',
      };
    },
    []
  );

  const patchLevelOptimistic = useCallback(
    async (body: Record<string, unknown>, preview: (row: StockLevel) => StockLevel) => {
      const productId = String(body.productId ?? '');
      if (!productId) {
        return { success: false as const, error: 'productId is required.' };
      }

      const revertSnapshot = levelsRef.current;
      setLevels((current) =>
        current.map((row) => (row.productId === productId ? preview(row) : row))
      );

      const result = await patchInventoryLevel(body);
      if (result.success && result.level) {
        setLevels((current) => applyStockLevelPatch(current, result.level!));
        return { success: true as const, level: result.level };
      }

      setLevels(revertSnapshot);
      return { success: false as const, error: result.error ?? 'Update failed.' };
    },
    []
  );

  return {
    levels,
    setLevels,
    performMove,
    patchLevelOptimistic,
  };
}
