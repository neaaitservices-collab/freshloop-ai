'use client';

import React, { useCallback, useId, useState } from 'react';
import { ModalShell } from '@/components/ui/layout/ModalShell';
import { cn } from '@/lib/utils/cn';
import {
  DELIVERY_DAY_TODAY,
  DELIVERY_DAY_YESTERDAY,
  DELIVERY_WEEKDAYS,
  INVOICE_DATE_FIELD_LABEL,
  PICK_DELIVERY_DAY_LABEL,
  TORONTO_TIME_CAPTION,
  deliveryMonthModel,
  formatInvoiceDeliveryDay,
  invoiceDateButtonLabel,
  invoiceDateToday,
  invoiceDateYesterday,
  isSelectableDeliveryDay,
  shiftDeliveryMonth,
} from '@/lib/domains/receiving/invoiceDatePicker';

export function InvoiceDateField({
  value,
  onChange,
  label = INVOICE_DATE_FIELD_LABEL,
}: {
  value: string;
  onChange: (ymd: string) => void;
  label?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => invoiceDateToday());
  const today = invoiceDateToday();
  const buttonLabel = invoiceDateButtonLabel(value);
  const unset = buttonLabel === PICK_DELIVERY_DAY_LABEL;
  const model = deliveryMonthModel(month, today);

  const close = useCallback(() => setOpen(false), []);

  const openSheet = () => {
    const nowToday = invoiceDateToday();
    const anchor = isSelectableDeliveryDay(value, nowToday) ? value : nowToday;
    setMonth(anchor);
    setOpen(true);
  };

  const choose = (ymd: string) => {
    const nowToday = invoiceDateToday();
    if (!isSelectableDeliveryDay(ymd, nowToday)) return;
    onChange(ymd);
    setOpen(false);
  };

  return (
    <div>
      <p className="text-xs font-bold text-slate-300">{label}</p>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unset ? `${label}. ${PICK_DELIVERY_DAY_LABEL}` : `${label}. ${buttonLabel}`
        }
        onClick={openSheet}
        className={cn(
          'mt-1.5 flex min-h-11 w-full items-center justify-between rounded-xl border bg-slate-950 px-3.5 py-3 text-left text-[15px] font-bold',
          unset ? 'text-slate-500' : 'text-slate-50',
          open ? 'border-emerald-400' : 'border-slate-700'
        )}
      >
        <span>{buttonLabel}</span>
        <span className="ml-2 text-[11px] text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      <ModalShell
        open={open}
        onClose={close}
        labelledBy={titleId}
        zIndexClass="z-[60]"
        width="sm"
        overlayClassName="bg-slate-950/60 p-0 backdrop-blur-[1px] sm:items-end sm:p-0"
        panelClassName="max-h-[min(92dvh,40rem)] max-w-md !rounded-b-none !rounded-t-[28px] border-slate-800 bg-slate-900 shadow-[0_-16px_40px_rgba(0,0,0,0.45)]"
      >
        <div className="min-h-0 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mx-auto mb-2.5 mt-1 h-1.5 w-11 rounded-full bg-slate-700" />
          <h2 id={titleId} className="mb-3 text-center text-base font-extrabold text-slate-50">
            {label}
          </h2>
          <div className="mb-3.5 flex gap-2">
            <button
              type="button"
              className="min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-2 py-2.5 text-[13px] font-bold text-slate-200"
              onClick={() => choose(invoiceDateToday())}
            >
              {DELIVERY_DAY_TODAY}
            </button>
            <button
              type="button"
              className="min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-2 py-2.5 text-[13px] font-bold text-slate-200"
              onClick={() => choose(invoiceDateYesterday())}
            >
              {DELIVERY_DAY_YESTERDAY}
            </button>
          </div>
          <div className="mb-2.5 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-slate-700 bg-slate-950 text-base font-bold text-slate-200"
              onClick={() => setMonth((current) => shiftDeliveryMonth(current, -1))}
            >
              ‹
            </button>
            <h3 className="text-[15px] font-extrabold text-slate-50">{model.label}</h3>
            <button
              type="button"
              aria-label="Next month"
              disabled={!model.canGoNext}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-[10px] border text-base font-bold',
                model.canGoNext
                  ? 'border-slate-700 bg-slate-950 text-slate-200'
                  : 'cursor-not-allowed border-slate-800 bg-slate-900 text-slate-700'
              )}
              onClick={() => {
                if (!model.canGoNext) return;
                setMonth((current) => shiftDeliveryMonth(current, 1));
              }}
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7" aria-hidden="true">
            {DELIVERY_WEEKDAYS.map((letter, index) => (
              <span key={`${letter}-${index}`} className="py-1 text-center text-[11px] font-bold text-slate-500">
                {letter}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {model.cells.map((cell, index) =>
              cell.kind === 'empty' ? (
                <span key={`empty-${index}`} className="h-9" />
              ) : (
                <button
                  key={cell.ymd}
                  type="button"
                  disabled={cell.disabled}
                  aria-current={cell.isToday ? 'date' : undefined}
                  aria-label={
                    cell.disabled
                      ? `${formatInvoiceDeliveryDay(cell.ymd)}, unavailable`
                      : formatInvoiceDeliveryDay(cell.ymd)
                  }
                  className={cn(
                    'flex h-9 items-center justify-center rounded-[10px] text-[13px] font-bold',
                    cell.disabled ? 'cursor-not-allowed font-semibold text-slate-700/40' : 'text-slate-50',
                    cell.isToday && 'bg-emerald-950 text-emerald-400 shadow-[inset_0_0_0_2px_#34d399]'
                  )}
                  onClick={() => choose(cell.ymd)}
                >
                  {cell.day}
                </button>
              )
            )}
          </div>
          <p className="mt-2.5 text-center text-[11px] font-semibold text-slate-500">{TORONTO_TIME_CAPTION}</p>
        </div>
      </ModalShell>
    </div>
  );
}
