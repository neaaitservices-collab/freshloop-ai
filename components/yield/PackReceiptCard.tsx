'use client';

import React from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import type { ReceivingLog, RetailUnit, YieldQuote } from '@/lib/yieldPricing';
import { formatCurrency, formatPercent, formatUnits, marginTone } from '@/lib/yieldPricing';

function ReceiptRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800/80 py-2.5 last:border-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`text-right font-mono text-sm ${emphasis ? 'text-base font-black text-emerald-300' : 'font-bold text-white'}`}>
        {value}
      </dd>
    </div>
  );
}

export function PackReceiptCard({
  log,
  retailUnit,
  quote,
  currentRetailPrice,
  saving,
  savedMessage,
  errorMessage,
  stockOnHand,
  stockMatched,
  onSave,
}: {
  log: ReceivingLog;
  retailUnit: RetailUnit;
  quote: YieldQuote;
  currentRetailPrice: number;
  saving: boolean;
  savedMessage: string | null;
  errorMessage: string | null;
  stockOnHand: number | null;
  stockMatched: boolean;
  onSave: () => void;
}) {
  const tone = marginTone(quote.currentMarginPct);
  const marginClass =
    tone === 'healthy' ? 'text-emerald-300' : tone === 'thin' ? 'text-orange-300' : 'text-zinc-400';
  const perCase = quote.totalRetailUnits;
  const deliveryUnits = perCase !== null ? log.casesReceived * perCase : null;
  const posted = Boolean(savedMessage);
  const inStockAfter =
    stockOnHand !== null && deliveryUnits !== null && !posted
      ? stockOnHand + deliveryUnits
      : stockOnHand;

  return (
    <aside className="lg:sticky lg:top-24">
      <div className="overflow-hidden rounded-3xl border border-emerald-500/25 bg-zinc-900/90 shadow-2xl shadow-black/30">
        <div className="border-b border-zinc-800 px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/80">
            Receipt confirmation
          </p>
          <h2 className="mt-1 text-lg font-black leading-tight text-white">{log.itemName}</h2>
          <p className="mt-1 text-sm text-zinc-300">
            1 case = {formatUnits(perCase)} {retailUnit}
          </p>
          <p className="text-xs text-zinc-500">{log.casesReceived} cases received</p>
        </div>

        <dl className="px-5 py-1">
          <ReceiptRow label="Case cost" value={formatCurrency(log.caseCost)} />
          <ReceiptRow label="Unit cost" value={formatCurrency(quote.unitCost)} />
          <ReceiptRow
            label="This delivery"
            value={deliveryUnits === null ? '—' : `${formatUnits(deliveryUnits)} ${retailUnit}`}
            emphasis
          />
          <ReceiptRow
            label={posted ? 'In stock' : 'In stock now'}
            value={
              stockOnHand === null
                ? 'Checking…'
                : `${formatUnits(stockOnHand)} ${retailUnit}`
            }
          />
          {!posted ? (
            <ReceiptRow
              label="In stock after save"
              value={
                inStockAfter === null
                  ? 'Checking…'
                  : `${formatUnits(inStockAfter)} ${retailUnit}`
              }
              emphasis
            />
          ) : null}
          {!posted && stockOnHand !== null && !stockMatched ? (
            <p className="py-2 text-[11px] leading-relaxed text-zinc-400">
              This item is not in inventory yet. Save starts the count from this delivery.
            </p>
          ) : null}
          <ReceiptRow label="Target SRP" value={formatCurrency(quote.targetSrp)} />
          <ReceiptRow label="Current retail" value={formatCurrency(currentRetailPrice)} />
        </dl>

        <div className={`mx-5 mb-4 rounded-2xl px-4 py-3 ${tone === 'thin' ? 'bg-orange-500/10' : 'bg-emerald-500/10'}`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Profit margin</p>
          <p className={`font-mono text-2xl font-black ${marginClass}`}>
            {formatPercent(quote.currentMarginPct)}%
          </p>
        </div>

        <div className="space-y-2 border-t border-zinc-800 px-5 py-4">
          {savedMessage ? (
            <p className="flex items-center gap-2 text-xs font-bold text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {savedMessage}
            </p>
          ) : null}
          {errorMessage ? <p className="text-xs font-bold text-orange-300">{errorMessage}</p> : null}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || quote.totalRetailUnits === null}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save &amp; Update Inventory
          </button>
        </div>
      </div>
    </aside>
  );
}
