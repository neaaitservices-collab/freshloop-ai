'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowDownToLine } from 'lucide-react';
import { StatsDateFilter } from '@/components/features/admin/StatsDateFilter';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  PRODUCTION_INBOX_EMPTY,
  PRODUCTION_INBOX_TITLE,
  productionInboxQuery,
} from '@/lib/domains/inventory/productionInboxQuery';
import { formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { formatTorontoDateTime } from '@/lib/domains/stats/storeTime';
import { cn } from '@/lib/utils/cn';

interface InboxItem {
  id?: string;
  productId: string;
  name: string;
  unitType: string;
  qtyReceived: number;
  lastReceivedAt: string;
  staffName?: string;
}

export function KitchenFloorInbox({
  focusInbox,
  defaultPreset = null,
}: {
  focusInbox?: boolean;
  defaultPreset?: 'day' | null;
}) {
  const search = useSearchParams();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLElement>(null);
  const query = defaultPreset === 'day' ? productionInboxQuery(search) : 'hours=24';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/kitchen-inbox?${query}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.items)) {
        setItems(json.items as InboxItem[]);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

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
    if (!focusInbox || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusInbox, loading, items.length]);

  return (
    <section ref={ref} className="mb-4" aria-label={PRODUCTION_INBOX_TITLE}>
      {defaultPreset ? <StatsDateFilter defaultPreset={defaultPreset} heading={PRODUCTION_INBOX_TITLE} /> : null}
      {loading ? (
        <Card className="mt-3">
          <CardBody className="py-4 text-sm text-slate-500" aria-busy="true">
            Loading Production transfers…
          </CardBody>
        </Card>
      ) : items.length === 0 ? (
        <Card className="mt-3 border-slate-800/80">
          <CardBody className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-200">{PRODUCTION_INBOX_TITLE}</p>
              <p className="text-xs text-slate-500">{PRODUCTION_INBOX_EMPTY}</p>
            </div>
            <Link href="/inventory/floor">
              <Button variant="secondary" className="text-xs">
                Open floor view
              </Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <Card className={cn('mt-3 border-blue-900/40 bg-blue-950/15', focusInbox && 'ring-1 ring-blue-800/60')}>
          <CardHeader>
            <div className="flex items-start gap-2">
              <ArrowDownToLine className="mt-0.5 h-5 w-5 text-blue-300/90" />
              <div>
                <CardTitle>{PRODUCTION_INBOX_TITLE}</CardTitle>
                <CardDescription>
                  {items.length} item{items.length === 1 ? '' : 's'} moved to production
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardBody className="pt-0">
            <ul className="divide-y divide-slate-800/80 rounded-xl border border-slate-800/80">
              {items.map((item) => (
                <li key={item.id ?? `${item.productId}-${item.lastReceivedAt}`} className="px-3 py-2.5">
                  <p className="text-sm font-bold text-slate-100">{item.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatUnits(item.qtyReceived)} {stockUnitLabel(item.unitType)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {item.staffName?.trim() || 'Floor'} · {formatTorontoDateTime(item.lastReceivedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </section>
  );
}
