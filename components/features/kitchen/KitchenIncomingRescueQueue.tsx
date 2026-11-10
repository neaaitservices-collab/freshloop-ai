'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { sumInboxByProduct } from '@/lib/domains/inventory/inboxReceipts';
import { filterKitchenPrepLevels } from '@/lib/domains/inventory/subInventoryView';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';

interface InboxMeta {
  productId: string;
  qtyReceived: number;
  lastReceivedAt: string;
  staffName?: string;
}

export interface KitchenIncomingRescueQueueProps {
  focusInbox?: boolean;
  maxItems?: number;
  variant?: 'default' | 'pills';
  /** Product ids currently in Kitchen_Prep (for Synthesize Recipes). */
  onPrepProductIdsChange?: (ids: string[]) => void;
}

export function KitchenIncomingRescueQueue({
  focusInbox,
  maxItems = 15,
  variant = 'default',
  onPrepProductIdsChange,
}: KitchenIncomingRescueQueueProps) {
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [inbox, setInbox] = useState<InboxMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [levelsRes, inboxRes] = await Promise.all([
        fetch('/api/inventory/levels', { cache: 'no-store' }),
        fetch('/api/inventory/kitchen-inbox?hours=24', { cache: 'no-store' }),
      ]);
      const levelsJson = await levelsRes.json();
      const inboxJson = await inboxRes.json();
      if (levelsJson.success && Array.isArray(levelsJson.levels)) {
        setLevels(filterKitchenPrepLevels(levelsJson.levels as StockLevel[]));
      } else {
        setLevels([]);
      }
      if (inboxJson.success && Array.isArray(inboxJson.productTotals)) {
        setInbox(inboxJson.productTotals as InboxMeta[]);
      } else if (inboxJson.success && Array.isArray(inboxJson.items)) {
        setInbox(
          sumInboxByProduct(
            inboxJson.items as {
              productId: string;
              qtyReceived: number;
              lastReceivedAt: string;
              staffName?: string;
            }[]
          )
        );
      } else {
        setInbox([]);
      }
    } catch {
      setLevels([]);
      setInbox([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onUpdate = () => void load();
    window.addEventListener('freshloop-inventory-updated', onUpdate);
    window.addEventListener('freshloop-kitchen-inbox', onUpdate);
    return () => {
      window.removeEventListener('freshloop-inventory-updated', onUpdate);
      window.removeEventListener('freshloop-kitchen-inbox', onUpdate);
    };
  }, [load]);

  useEffect(() => {
    onPrepProductIdsChange?.(levels.map((row) => row.productId));
  }, [levels, onPrepProductIdsChange]);

  useEffect(() => {
    if (!focusInbox || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusInbox, loading, levels.length]);

  const recentIds = new Set(inbox.map((row) => row.productId));
  const receivedQty = new Map(inbox.map((row) => [row.productId, row.qtyReceived]));
  const displayLevels = levels.slice(0, maxItems);
  const pills = variant === 'pills';

  if (loading) {
    return (
      <Card className="border-slate-800/90 bg-slate-900/40">
        <CardBody className="py-3 text-xs text-slate-500">Loading From floor…</CardBody>
      </Card>
    );
  }

  if (levels.length === 0) {
    return (
      <section ref={ref}>
        <Card className="border-slate-800/90 bg-slate-900/30">
          <CardBody className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Package className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-sm font-bold text-slate-200">Production prep is currently clear</p>
                <p className="text-[11px] text-slate-500">
                  Transfer surplus or short-dated product from the retail floor or main inventory to supply production recipes.
                </p>
              </div>
            </div>
            <Link href="/inventory/floor" className="shrink-0">
              <Button variant="secondary" className="min-h-11 text-xs">
                Open floor queue
              </Button>
            </Link>
          </CardBody>
        </Card>
      </section>
    );
  }

  return (
    <section ref={ref}>
      <Card
        className={cn(
          'border-slate-800/90 bg-slate-900/50',
          focusInbox && 'ring-1 ring-amber-800/50',
          pills && 'rounded-2xl'
        )}
      >
        <CardHeader className={cn('gap-0.5', pills ? 'px-3 pb-2 pt-3' : 'gap-1 pb-2 pt-3')}>
          <CardTitle className="text-xs font-extrabold tracking-tight text-slate-100 sm:text-sm">
            Incoming production prep
          </CardTitle>
          {!pills ? (
            <CardDescription className="text-[11px]">
              Production Prep · {levels.length} item{levels.length === 1 ? '' : 's'} on hand
            </CardDescription>
          ) : (
            <CardDescription className="text-[10px] text-slate-500">
              {levels.length} SKUs · showing {displayLevels.length}
            </CardDescription>
          )}
        </CardHeader>
        <CardBody className="pt-0 pb-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {displayLevels.map((row) => {
              const isNew = recentIds.has(row.productId);
              const floorQty = receivedQty.get(row.productId);
              if (pills) {
                return (
                  <div
                    key={row.productId}
                    title={row.name}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5',
                      isNew
                        ? 'border-amber-500/40 bg-amber-950/50'
                        : 'border-slate-700 bg-slate-950/80'
                    )}
                  >
                    <p className="max-w-[140px] truncate text-[11px] font-bold text-slate-100">
                      {row.name}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400">
                      {formatUnits(row.kitchenPrepQty)} {stockUnitLabel(row.unitType)}
                      {isNew && floorQty != null ? (
                        <span className="text-amber-400"> +{formatUnits(floorQty)}</span>
                      ) : null}
                    </p>
                  </div>
                );
              }
              return (
                <div
                  key={row.productId}
                  className="min-w-[168px] max-w-[220px] shrink-0 rounded-xl border border-slate-800/90 bg-slate-950/60 px-3 py-2.5"
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-1">
                    {isNew ? (
                      <Badge variant="warning" className="normal-case tracking-normal">
                        New from floor
                      </Badge>
                    ) : (
                      <Badge
                        variant="neutral"
                        className="border-slate-600/50 bg-slate-800/30 text-slate-400 normal-case tracking-normal"
                      >
                        In prep
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs font-bold text-slate-100" title={row.name}>
                    {row.name}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                    {formatUnits(row.kitchenPrepQty)} {stockUnitLabel(row.unitType)} in prep
                    {isNew && floorQty != null ? (
                      <span className="text-amber-500/90"> · +{formatUnits(floorQty)} today</span>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </section>
  );
}
