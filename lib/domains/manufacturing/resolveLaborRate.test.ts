import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveLaborRate, resolveLaborRatePerHour } from '@/lib/domains/manufacturing/resolveLaborRate';

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

  it('marks the store rate and the $17.60 stand-in as defaults', () => {
    const store = resolveLaborRate({
      staffHourlyRate: null,
      recipeLaborRate: null,
      storeDefaultLaborRate: 18,
    });
    assert.equal(store.ratePerHour, 18);
    assert.equal(store.isDefault, true);

    const fallback = resolveLaborRate({
      staffHourlyRate: null,
      recipeLaborRate: null,
      storeDefaultLaborRate: null,
    });
    assert.equal(fallback.ratePerHour, 17.6);
    assert.equal(fallback.isDefault, true);
    assert.equal(
      resolveLaborRate({ staffHourlyRate: 19.25, recipeLaborRate: 17.6, storeDefaultLaborRate: 18 })
        .isDefault,
      false
    );
    assert.equal(
      resolveLaborRate({ staffHourlyRate: null, recipeLaborRate: 17.6, storeDefaultLaborRate: 18 })
        .isDefault,
      false
    );
  });
});
