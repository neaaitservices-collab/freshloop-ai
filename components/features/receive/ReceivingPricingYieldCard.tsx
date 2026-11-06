'use client';

import React from 'react';
import type { ReceivingLog, MarginMode, RetailUnit, YieldQuote } from '@/lib/domains/receiving/yieldPricing';
import { PricingYieldCard } from '@/components/ui/PricingYieldCard';

/** Receive flow wrapper around shared pricing & yield controls. */
export function ReceivingPricingYieldCard({
  log,
  packSize,
  splitFactor,
  packUnit,
  yieldUnit,
  caseShelfPrice,
  currentRetailPrice,
  marginMode,
  customMarginPercent,
  quote,
  savedPrefsHint,
  onPackSize,
  onSplitFactor,
  onPackUnit,
  onYieldUnit,
  onCaseShelfPrice,
  onMarginMode,
  onCustomMargin,
  onRetailFloorPrice,
  compactHeader = false,
}: {
  log: ReceivingLog;
  packSize: string;
  splitFactor: string;
  packUnit: RetailUnit;
  yieldUnit: RetailUnit;
  caseShelfPrice: string;
  currentRetailPrice: string;
  marginMode: MarginMode;
  customMarginPercent: string;
  quote: YieldQuote;
  savedPrefsHint: string | null;
  onPackSize: (value: string) => void;
  onSplitFactor: (value: string) => void;
  onPackUnit: (value: RetailUnit) => void;
  onYieldUnit: (value: RetailUnit) => void;
  onCaseShelfPrice: (value: string) => void;
  onMarginMode: (mode: MarginMode) => void;
  onCustomMargin: (value: string) => void;
  onRetailFloorPrice: (value: string) => void;
  compactHeader?: boolean;
}) {
  return (
    <PricingYieldCard
      compactHeader={compactHeader}
      itemName={compactHeader ? undefined : log.itemName}
      itemSubtitle={
        compactHeader || !log.invoiceLineName ? null : `Invoice line: ${log.invoiceLineName}`
      }
      caseCost={log.caseCost}
      middleStats={[{ label: 'Cases received', value: String(log.casesReceived) }]}
      packSize={packSize}
      splitFactor={splitFactor}
      packUnit={packUnit}
      yieldUnit={yieldUnit}
      caseShelfPrice={caseShelfPrice}
      currentRetailPrice={currentRetailPrice}
      marginMode={marginMode}
      customMarginPercent={customMarginPercent}
      quote={quote}
      savedPrefsHint={savedPrefsHint}
      onPackSize={onPackSize}
      onSplitFactor={onSplitFactor}
      onPackUnit={onPackUnit}
      onYieldUnit={onYieldUnit}
      onCaseShelfPrice={onCaseShelfPrice}
      onMarginMode={onMarginMode}
      onCustomMargin={onCustomMargin}
      onRetailFloorPrice={onRetailFloorPrice}
      idPrefix="receive"
    />
  );
}
