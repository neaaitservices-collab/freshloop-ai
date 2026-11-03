import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCRAP_VOLUMETRIC_BUCKET_KIND,
  buildVolumetricScrapNotes,
  isVolumetricScrapNotes,
  serializeVolumetricScrapNotes,
} from '@/lib/domains/inventory/volumetricScrapLedger';

test('buildVolumetricScrapNotes uses store settings for preview economics', () => {
  const payload = buildVolumetricScrapNotes(2, {
    scrapBucketVolumeL: 20,
    estimatedWeightPerLiterKg: 0.65,
    defaultScrapCostPerKg: 1.5,
  });
  assert.equal(payload.kind, SCRAP_VOLUMETRIC_BUCKET_KIND);
  assert.equal(payload.buckets, 2);
  assert.equal(payload.totalVolumeL, 40);
  assert.equal(payload.totalKg, 26);
  assert.equal(payload.estimatedDollars, 39);
});

test('serializeVolumetricScrapNotes is detectable by isVolumetricScrapNotes', () => {
  const notes = serializeVolumetricScrapNotes(
    buildVolumetricScrapNotes(1, {
      scrapBucketVolumeL: 20,
      estimatedWeightPerLiterKg: 0.65,
      defaultScrapCostPerKg: 3.5,
    })
  );
  assert.ok(isVolumetricScrapNotes(notes));
  assert.ok(notes.includes(SCRAP_VOLUMETRIC_BUCKET_KIND));
});
