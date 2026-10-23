'use client';

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import {
  executeInventoryMove,
  type InventoryMoveAction,
  transferSuccessMessage,
  type SubInventoryTransferRow,
} from '@/lib/domains/inventory/inventoryMoveClient';
import { applyOptimisticMove } from '@/lib/domains/inventory/optimisticStock';
import { patchInventoryLevel } from '@/lib/domains/inventory/inventoryLevelsClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';

export type OptimisticMovePayload = {
  productId: string;
  action: InventoryMoveAction;
  quantity: number;
};

function applyMoveReducer(state: StockLevel[], update: OptimisticMovePayload): StockLevel[] {
  return state.map((row) =>
    row.productId === update.productId
      ? applyOptimisticMove(row, update.action, update.quantity)
      : row
  );
}

function snapshotKey(levels: StockLevel[] | null): string | null {
  return levels == null ? null : JSON.stringify(levels);
}

export function useOptimisticInventoryLevels(initialLevels: StockLevel[] | null) {
  const [levels, setLevels] = useState<StockLevel[]>(() => initialLevels ?? []);
  const [optimisticLevels, addOptimisticMove] = useOptimistic(levels, applyMoveReducer);
  const [, startTransition] = useTransition();
  const snapshot = snapshotKey(initialLevels);
  const snapshotRef = useRef(initialLevels);
  snapshotRef.current = initialLevels;

  useEffect(() => {
    if (snapshot == null) return;
    const next = snapshotRef.current;
    if (!next) return;
    setLevels((current) => (snapshotKey(current) === snapshot ? current : next));
  }, [snapshot]);

  const performMove = useCallback(
    async (input: {
      productId: string;
      action: InventoryMoveAction;
      quantity?: number;
      staffId?: string;
      row: SubInventoryTransferRow;
    }) => {
      const quantity =
        input.action === 'markdown'
          ? input.row.onHand
          : Math.max(0, input.quantity ?? 0);

      const snapshot = levels;
      startTransition(() => {
        addOptimisticMove({
          productId: input.productId,
          action: input.action,
          quantity,
        });
      });

      const result = await executeInventoryMove({
        productId: input.productId,
        action: input.action,
        quantity: input.action === 'markdown' ? undefined : quantity,
        staffId: input.staffId,
      });

      if (result.success && result.level) {
        setLevels((current) =>
          current.map((row) => (row.productId === result.level!.productId ? result.level! : row))
        );
        return {
          success: true as const,
          level: result.level,
          message: transferSuccessMessage(input.action, input.row, result.level, result.units),
        };
      }

      setLevels(snapshot);
      return {
        success: false as const,
        error: result.error ?? 'Transfer failed.',
      };
    },
    [levels, addOptimisticMove, startTransition]
  );

  const patchLevelOptimistic = useCallback(
    async (body: Record<string, unknown>, preview: (row: StockLevel) => StockLevel) => {
      const productId = String(body.productId ?? '');
      if (!productId) {
        return { success: false as const, error: 'productId is required.' };
      }

      const snapshot = levels;
      setLevels((current) =>
        current.map((row) => (row.productId === productId ? preview(row) : row))
      );

      const result = await patchInventoryLevel(body);
      if (result.success && result.level) {
        setLevels((current) =>
          current.map((row) => (row.productId === result.level!.productId ? result.level! : row))
        );
        return { success: true as const, level: result.level };
      }

      setLevels(snapshot);
      return { success: false as const, error: result.error ?? 'Update failed.' };
    },
    [levels]
  );

  return {
    levels: optimisticLevels,
    setLevels,
    performMove,
    patchLevelOptimistic,
  };
}
