'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ChefHat } from 'lucide-react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';

interface InboxItem {
  productId: string;
  name: string;
  unitType: string;
  qtyReceived: number;
  lastReceivedAt: string;
  kitchenPrepQty: number;
}

export function KitchenFloorInbox({ focusInbox }: { focusInbox?: boolean }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/kitchen-inbox?hours=24', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.items)) {
        setItems(json.items as InboxItem[]);
      }
    } catch {
      setItems([]);
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
    if (!focusInbox || !ref.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusInbox, loading, items.length]);

  if (loading) {
    return (
      <Card className="mb-4">
        <CardBody className="py-4 text-sm text-slate-500">Checking floor rescues…</CardBody>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="mb-4 border-slate-800/80">
        <CardBody className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-200">Floor inbox empty</p>
            <p className="text-xs text-slate-500">Nothing rescued from the floor in the last 24 hours.</p>
          </div>
          <Link href="/inventory/floor">
            <Button variant="secondary" className="text-xs">
              Open floor view
            </Button>
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <section ref={ref}>
    <Card className={cn('mb-4 border-blue-900/40 bg-blue-950/15', focusInbox && 'ring-1 ring-blue-800/60')}>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <ArrowDownToLine className="mt-0.5 h-5 w-5 text-blue-300/90" />
          <div>
            <CardTitle>
              {items.length} new from the floor
            </CardTitle>
            <CardDescription>Rescue transfers to production prep · last 24h</CardDescription>
          </div>
        </div>
        <Link href="/inventory/floor" className="shrink-0">
          <Button variant="secondary" className="text-xs">
            Floor transfers
          </Button>
        </Link>
      </CardHeader>
      <CardBody className="pt-0">
        <ul className="divide-y divide-slate-800/80 rounded-xl border border-slate-800/80">
          {items.map((item) => (
            <li
              key={item.productId}
              className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-bold text-slate-100">{item.name}</p>
                <p className="text-[11px] text-slate-500">
                  +{formatUnits(item.qtyReceived)} {stockUnitLabel(item.unitType)} from floor ·{' '}
                  {formatUnits(item.kitchenPrepQty)} in prep now
                </p>
              </div>
              <Button variant="primary" className="text-xs py-2">
                <ChefHat className="h-3.5 w-3.5" />
                Use in prep
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
    </section>
  );
}
