'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  groupBySupplier,
  marksFromPurchaseOrders,
  MISSING_SUPPLIER_EMAIL_HINT,
  orderLine,
  purchaseOrderRecipientForSupplier,
  singleSupplierEmail,
  supplierRecipientHint,
  withSavedRecipient,
  type PoDraft,
  type SupplierDirectoryEntry,
} from '@/components/features/orders/supplierMail';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import {
  purchaseOrderHistoryEntrySchema,
  purchaseOrderHistoryResponseSchema,
  purchaseOrderSaveResponseSchema,
  type PurchaseOrderHistoryEntry,
} from '@/lib/domains/orders/purchaseOrderSubmit';

function supplierIdsOnList(
  levels: readonly StockLevel[],
  directory: readonly SupplierDirectoryEntry[]
): string[] {
  const names = new Set(levels.map((row) => row.supplier.trim().toLowerCase()));
  const ids: string[] = [];
  for (const entry of directory) {
    const id = entry.id?.trim();
    if (!id || !names.has(entry.name.trim().toLowerCase())) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function receiptMap(levels: readonly StockLevel[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const row of levels) {
    map[row.productId] = row.lastReceiptAt ?? null;
  }
  return map;
}

export function usePurchaseOrders(input: {
  levels: readonly StockLevel[];
  supplierDirectory: readonly SupplierDirectoryEntry[];
  directoryReady: boolean;
  drafts: readonly PoDraft[];
  onError: (message: string | null) => void;
}) {
  const { levels, supplierDirectory, directoryReady, drafts, onError } = input;
  const [orders, setOrders] = useState<PurchaseOrderHistoryEntry[] | null>(null);
  const [supplierIssues, setSupplierIssues] = useState<Record<string, string>>({});
  const [savingSupplier, setSavingSupplier] = useState<string | null>(null);
  const supplierKey = supplierIdsOnList(levels, supplierDirectory).join('\n');

  useEffect(() => {
    if (!directoryReady) return;
    const ids = supplierKey ? supplierKey.split('\n') : [];
    if (ids.length === 0) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      ids.map(async (supplierId) => {
        const response = await fetch(
          `/api/orders/purchase-order-email?supplierId=${encodeURIComponent(supplierId)}`,
          { cache: 'no-store' }
        );
        const parsed = purchaseOrderHistoryResponseSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success || !parsed.data.success || !parsed.data.orders) {
          throw new Error(parsed.success ? parsed.data.error : undefined);
        }
        return parsed.data.orders;
      })
    )
      .then((groups) => {
        if (!cancelled) setOrders(groups.flat());
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error && error.message ? error.message : '';
        onError(message || 'Purchase order history could not be loaded.');
        setOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [directoryReady, supplierKey, onError]);

  const marks = useMemo(() => {
    return marksFromPurchaseOrders(orders ?? [], {
      now: new Date(),
      lastReceiptAt: receiptMap(levels),
    });
  }, [orders, levels]);

  const remember = (order: PurchaseOrderHistoryEntry, closedIds: readonly string[]) => {
    const parsed = purchaseOrderHistoryEntrySchema.parse(order);
    setOrders((current) => {
      const closed = new Set(closedIds);
      const next = (current ?? []).map((row) =>
        closed.has(row.id) ? { ...row, status: 'SENT' as const, updatedAt: parsed.updatedAt } : row
      );
      return [parsed, ...next.filter((row) => row.id !== parsed.id)];
    });
  };

  const savePurchaseOrder = async (draft: {
    supplier: string;
    supplierId: string | null;
    to: string;
    subject: string;
    body: string;
    productIds: string[];
    status: 'APPROVED' | 'SENT';
  }): Promise<boolean> => {
    if (!singleSupplierEmail(draft.to)) {
      setSupplierIssues((current) => ({
        ...current,
        [draft.supplier]:
          supplierRecipientHint({ to: draft.to, recipientIssue: 'missing' }) ?? MISSING_SUPPLIER_EMAIL_HINT,
      }));
      return false;
    }
    setSupplierIssues((current) => {
      if (!current[draft.supplier]) return current;
      const next = { ...current };
      delete next[draft.supplier];
      return next;
    });
    setSavingSupplier(draft.supplier);
    onError(null);
    try {
      const response = await fetch('/api/orders/purchase-order-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          supplierId: draft.supplierId,
          supplierName: draft.supplier,
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
          productIds: draft.productIds,
          status: draft.status,
        }),
      });
      const parsed = purchaseOrderSaveResponseSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success || !parsed.data.success || !parsed.data.id || !parsed.data.status) {
        onError(parsed.success && parsed.data.error ? parsed.data.error : 'The purchase order could not be saved.');
        return false;
      }
      const savedAt = parsed.data.updatedAt ?? parsed.data.openedAt ?? new Date().toISOString();
      remember(
        {
          id: parsed.data.id,
          supplierId: draft.supplierId,
          supplierName: draft.supplier,
          toEmail: singleSupplierEmail(draft.to) ?? draft.to,
          subject: draft.subject,
          status: parsed.data.status,
          lineKey: parsed.data.lineKey ?? '',
          productIds: parsed.data.productIds ?? draft.productIds,
          createdAt: parsed.data.openedAt ?? savedAt,
          updatedAt: savedAt,
        },
        parsed.data.closedIds ?? []
      );
      return true;
    } catch {
      onError('The purchase order could not be saved.');
      return false;
    } finally {
      setSavingSupplier(null);
    }
  };

  const saveRows = async (rows: readonly StockLevel[], status: 'APPROVED' | 'SENT') => {
    const eligible = rows.filter((row) => row.low && (status === 'SENT' || marks[row.productId] !== 'sent'));
    const groupedRows = groupBySupplier([...eligible]);
    for (const [supplier, groupRows] of Object.entries(groupedRows)) {
      const directoryRecipient = purchaseOrderRecipientForSupplier(supplier, supplierDirectory, drafts);
      const recipient = withSavedRecipient(
        {
          supplier,
          supplierId: directoryRecipient.supplierId,
          to: directoryRecipient.to,
          subject: '',
          body: '',
          productIds: groupRows.map((row) => row.productId),
        },
        orders ?? []
      );
      await savePurchaseOrder({
        supplier,
        supplierId: recipient.supplierId,
        to: recipient.to,
        subject: `Supermarket Purchase Order - ${supplier}`,
        body: groupRows.map(orderLine).join('\n'),
        productIds: groupRows.map((row) => row.productId),
        status,
      });
    }
  };

  return {
    orders,
    ordersLoading: orders === null,
    marks,
    supplierIssues,
    savingSupplier,
    saveRows,
    savePurchaseOrder,
  };
}
