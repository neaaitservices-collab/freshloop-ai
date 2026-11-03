import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveLaborRatePerHour } from '@/lib/domains/manufacturing/resolveLaborRate';

describe('resolveLaborRatePerHour', () => {
  it('prefers staff hourly wage over recipe and store defaults', () => {
    assert.equal(
      resolveLaborRatePerHour({
        staffHourlyRate: 19.25,
        recipeLaborRate: 17.6,
        storeDefaultLaborRate: 18,
      }),
      19.25
    );
  });

  it('falls back to recipe then store', () => {
    assert.equal(
      resolveLaborRatePerHour({
        staffHourlyRate: null,
        recipeLaborRate: 17.6,
        storeDefaultLaborRate: 18,
      }),
      17.6
    );
  });
});
