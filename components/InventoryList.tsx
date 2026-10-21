'use client';

import React from 'react';
import { ArrowRightLeft, Clock, Tag, Trash2 } from 'lucide-react';
import { DepartmentBadge } from '@/components/DepartmentBadge';
import { InventoryItem, InventoryStatusType } from '@/lib/types';

interface InventoryListProps {
  items: InventoryItem[];
  onStatusChange: (id: string, status: InventoryStatusType) => void;
}

function statusLabel(status: InventoryStatusType): string {
  if (status === 'PULL_RESCUE') return 'Kitchen';
  if (status === 'MARKDOWN') return '30% markdown';
  if (status === 'DISCARDED') return 'Waste';
  return 'Needs a pull';
}

function actionClass(active: boolean, tone: 'emerald' | 'rose' | 'zinc'): string {
  const base = 'flex h-11 w-11 items-center justify-center rounded-xl transition active:scale-95';
  if (tone === 'emerald') {
    return active
      ? `${base} bg-emerald-500 text-zinc-950`
      : `${base} border border-emerald-500/40 bg-emerald-950/70 text-emerald-300`;
  }
  if (tone === 'rose') {
    return active
      ? `${base} bg-rose-500 text-white`
      : `${base} border border-rose-500/40 bg-rose-950/70 text-rose-300`;
  }
  return `${base} border border-zinc-700 bg-zinc-900 text-zinc-400`;
}

export function InventoryList({ items, onStatusChange }: InventoryListProps) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-zinc-400">
        Nothing in this window needs a pull.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-800/80">
      {items.map((item) => {
        const casePack = item.casePackSize || 40;
        const subUnit = item.subUnit || 'lbs';
        const unitsOnHand = item.quantity * casePack;
        const lotCost = item.quantity * item.receivedCost;
        const urgent = item.daysRemaining <= 2;
        const inKitchen = item.status === 'PULL_RESCUE';
        const onMarkdown = item.status === 'MARKDOWN';

        return (
          <li
            key={item.id}
            className="flex items-center gap-2 bg-zinc-950/40 px-3 py-2 hover:bg-zinc-900/50 sm:gap-3 sm:px-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-white">{item.name}</h3>
                <DepartmentBadge department={item.department} size="sm" showIcon={false} />
                <span
                  className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    urgent
                      ? 'bg-rose-950 text-rose-300'
                      : 'bg-amber-950 text-amber-300'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  {item.daysRemaining}d
                </span>
              </div>
              <div className="mt-1 flex items-center gap-x-3 overflow-x-auto whitespace-nowrap text-[11px] text-zinc-400">
                <span>
                  <span className="text-zinc-500">Stock </span>
                  <strong className="font-semibold text-zinc-100">
                    {item.quantity} {item.quantity === 1 ? 'case' : 'cases'}
                  </strong>
                  <span> ({unitsOnHand} {subUnit})</span>
                </span>
                <span>
                  <span className="text-zinc-500">Lot cost </span>
                  <strong className="font-semibold text-emerald-300">${lotCost.toFixed(2)}</strong>
                </span>
                <span>
                  <span className="text-zinc-500">Case </span>
                  <strong className="font-semibold text-zinc-200">
                    1 = {casePack} {subUnit}
                  </strong>
                </span>
                <span className="text-amber-200/90">{statusLabel(item.status)}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-pressed={inKitchen}
                aria-label={
                  inKitchen
                    ? `${item.name} is in kitchen rescue`
                    : `Send ${item.name} to kitchen rescue`
                }
                title="Send to kitchen rescue"
                onClick={() => onStatusChange(item.id, 'PULL_RESCUE')}
                className={actionClass(inKitchen, 'emerald')}
              >
                <ArrowRightLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-pressed={onMarkdown}
                aria-label={
                  onMarkdown
                    ? `${item.name} is on a 30% markdown`
                    : `Mark ${item.name} down 30%`
                }
                title="Markdown 30%"
                onClick={() => onStatusChange(item.id, 'MARKDOWN')}
                className={actionClass(onMarkdown, 'rose')}
              >
                <Tag className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Discard ${item.name}`}
                title="Mark as waste"
                onClick={() => onStatusChange(item.id, 'DISCARDED')}
                className={actionClass(false, 'zinc')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
