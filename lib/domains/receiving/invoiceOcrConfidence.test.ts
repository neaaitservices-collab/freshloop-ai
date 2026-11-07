import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INVOICE_OCR_CONFIDENCE_THRESHOLD,
  combineLineConfidence,
  lineNeedsManualReview,
  matchConfidenceFromCatalogScore,
} from '@/lib/domains/receiving/invoiceOcrConfidence';
import { lowConfidenceCommitLines } from '@/lib/domains/receiving/invoiceOcrCommit';

test('matchConfidenceFromCatalogScore normalizes fuzzy match points', () => {
  assert.equal(matchConfidenceFromCatalogScore(82), 0.82);
  assert.equal(matchConfidenceFromCatalogScore(120), 1);
});

test('combineLineConfidence penalizes missing catalog match', () => {
  const blended = combineLineConfidence(0.92, null);
  assert.ok(blended < 0.92);
  assert.ok(blended < INVOICE_OCR_CONFIDENCE_THRESHOLD);
});

test('lineNeedsManualReview uses shared threshold', () => {
  assert.equal(lineNeedsManualReview(INVOICE_OCR_CONFIDENCE_THRESHOLD), false);
  assert.equal(lineNeedsManualReview(INVOICE_OCR_CONFIDENCE_THRESHOLD - 0.01), true);
});

test('lowConfidenceCommitLines respects line_confidence flag', () => {
  const low = lowConfidenceCommitLines(
    [{ product_id: 'p1', quantity: 1, unit_cost: 2, line_confidence: 0.4 }],
    new Map([['p1', 'Apples']])
  );
  assert.equal(low.length, 1);
});
