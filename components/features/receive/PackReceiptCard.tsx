'use client';

import React from 'react';
import type { ReceivingLog, RetailUnit, YieldQuote } from '@/lib/domains/receiving/yieldPricing';
import { formatCurrency, formatPercent, formatUnits, marginTone } from '@/lib/domains/receiving/yieldPricing';
import { ReceiptActionFooter } from '@/components/features/receive/ReceiptActionFooter';

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
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-800/80 py-2.5 last:border-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd
        className={`text-right font-mono text-sm tabular-nums ${emphasis ? 'text-base font-black text-emerald-300' : 'font-bold text-white'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Receipt summary + sticky action tray (stacked receive workflow). */
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
  alreadyInInventory = false,
  dispositionBusy = false,
  saveAllLabel = null,
  saveAllProgress = null,
  onSave,
  onSaveAll,
  onNotReceived,
  onRemoveFromList,
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
  alreadyInInventory?: boolean;
  dispositionBusy?: boolean;
  saveAllLabel?: string | null;
  saveAllProgress?: string | null;
  onSave: () => void;
  onSaveAll?: () => void;
  onNotReceived: () => void;
  onRemoveFromList: () => void;
}) {
  const tone = marginTone(quote.currentMarginPct);
  const marginClass =
    tone === 'healthy' ? 'text-emerald-300' : tone === 'thin' ? 'text-orange-300' : 'text-slate-400';
  const perCase = quote.totalRetailUnits;
  const deliveryUnits = perCase !== null ? log.casesReceived * perCase : null;
  const posted = Boolean(savedMessage);
  const inStockAfter =
    stockOnHand !== null && deliveryUnits !== null && !posted
      ? stockOnHand + deliveryUnits
      : stockOnHand;
  const lineTotal = Number((log.casesReceived * log.caseCost).toFixed(2));

  const footerProps = {
    savedMessage,
    errorMessage,
    saving,
    dispositionBusy,
    alreadyInInventory,
    saveDisabled: quote.totalRetailUnits === null,
    saveAllLabel,
    saveAllProgress,
    onSave,
    onSaveAll,
    onNotReceived,
    onRemoveFromList,
  };

  return (
    <section className="min-w-0 space-y-4" aria-label="Receipt confirmation">
      <div className="overflow-hidden rounded-3xl border border-emerald-500/25 bg-slate-900/90">
        <div className="border-b border-slate-800 px-4 py-3 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/80">
            Receipt confirmation
          </p>
          <p className="mt-1 text-sm text-slate-300">
            1 case = {formatUnits(perCase)} {retailUnit} · {log.casesReceived} cases on this line
          </p>
        </div>

        <dl className="grid gap-0 px-4 sm:grid-cols-2 sm:gap-x-6 sm:px-5">
          <ReceiptRow label="Case cost (invoice)" value={formatCurrency(log.caseCost)} />
          <ReceiptRow label="Line total (cost)" value={formatCurrency(lineTotal)} />
          <ReceiptRow label="Unit cost" value={formatCurrency(quote.unitCost)} />
          <ReceiptRow
            label="This delivery"
            value={deliveryUnits === null ? '—' : `${formatUnits(deliveryUnits)} ${retailUnit}`}
            emphasis
          />
          <ReceiptRow
            label={posted ? 'In stock' : 'In stock now'}
            value={
              stockOnHand === null ? 'Checking…' : `${formatUnits(stockOnHand)} ${retailUnit}`
            }
          />
          {!posted ? (
            <ReceiptRow
              label="In stock after save"
              value={
                inStockAfter === null ? 'Checking…' : `${formatUnits(inStockAfter)} ${retailUnit}`
              }
              emphasis
            />
          ) : null}
          <ReceiptRow label="Target SRP" value={formatCurrency(quote.targetSrp)} />
          <ReceiptRow label="Retail floor" value={formatCurrency(currentRetailPrice)} />
        </dl>

        {!posted && stockOnHand !== null && !stockMatched ? (
          <p className="px-4 pb-2 text-[11px] leading-relaxed text-slate-400 sm:px-5">
            Not in catalog yet — save posts this delivery to inventory.
          </p>
        ) : null}

        <div
          className={`mx-4 mb-4 flex items-center justify-between gap-4 rounded-2xl px-4 py-3 sm:mx-5 ${tone === 'thin' ? 'bg-orange-500/10' : 'bg-emerald-500/10'}`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross margin</p>
          <p className={`font-mono text-2xl font-black tabular-nums ${marginClass}`}>
            {formatPercent(quote.currentMarginPct)}%
          </p>
        </div>
      </div>

      {/**
       * Pin to the viewport bottom (`bottom-0`) so the tray background is continuous with the tab bar.
       * Reserve space with padding-bottom = measured nav height (not `bottom: nav-h`, which left a body-colored strip).
       */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-3 pt-3 pb-[max(0.75rem,var(--freshloop-mobile-nav-h,3.5rem))] shadow-[0_-8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md md:static md:bottom-auto md:inset-auto md:rounded-2xl md:border md:p-3 md:pb-3 md:shadow-lg md:shadow-black/20"
      >
        <div className="mx-auto max-w-3xl">
          <ReceiptActionFooter {...footerProps} />
        </div>
      </div>
      {/** Reserve scroll space for sticky tray + mobile tab bar */}
      <div
        className="min-h-[calc(11rem+var(--freshloop-mobile-nav-h))] md:hidden"
        aria-hidden
      />
    </section>
  );
}
