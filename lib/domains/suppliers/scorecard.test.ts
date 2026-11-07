import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSupplierScorecard, computeReliabilityScore } from '@/lib/domains/suppliers/scorecard';

test('computeReliabilityScore penalizes risk rates', () => {
  const high = computeReliabilityScore({
    ocrLowConfidenceRate: 0,
    discrepancyRate: 0,
    priceVarianceRate: 0,
    spoilageRate: 0,
  });
  assert.equal(high, 100);
  const low = computeReliabilityScore({
    ocrLowConfidenceRate: 50,
    discrepancyRate: 20,
    priceVarianceRate: 10,
    spoilageRate: 5,
  });
  assert.ok(low < 80);
});

test('buildSupplierScorecard returns bounded rates', () => {
  const card = buildSupplierScorecard({
    supplierId: 's',
    supplierName: 'Vendor',
    lookbackDays: 30,
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-01-30'),
    invoiceCount: 2,
    invoiceLineCount: 10,
    ocrLowConfidenceCount: 1,
    unmatchedLineCount: 0,
    notReceivedCount: 1,
    priceVarianceCount: 2,
    avgPriceVariancePct: 12,
    spoilageCount: 0,
    receivingVolume: 10,
  });
  assert.ok(card.ocrLowConfidenceRate <= 100);
  assert.ok(card.reliabilityScore >= 0 && card.reliabilityScore <= 100);
});
