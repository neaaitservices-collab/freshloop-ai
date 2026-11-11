import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/admin/settings/route';
import { setManagerStaffTestAuth } from '@/lib/auth/managerStaffTestAuth';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { DEFAULT_PRICE_CHANGE_THRESHOLD_PCT } from '@/lib/domains/suppliers/priceChangeThreshold';
import { parsePlatformSettings, PLATFORM_DEFAULTS } from '@/lib/domains/stats/platformSettings';
import { storeSettingSafeSelect } from '@/lib/domains/stats/storeSettingSelect';
import {
  getPriceChangeThresholdPct,
  isMissingPriceChangeColumn,
} from '@/lib/domains/suppliers/priceChangeThreshold';
import { ROLES, type RoleName } from '@/lib/utils/roles';

function settingsBody(priceChangeThresholdPct: unknown) {
  return {
    storeName: 'FreshLoop Independent Market',
    targetWastePct: 2.5,
    scrapBucketVolumeL: 20,
    estimatedWeightPerLiterKg: 0.65,
    defaultScrapCostPerKg: 3.5,
    defaultLaborRatePerHour: 17.6,
    pullSensitivityDays: 3,
    costGuardrailVariancePct: 20,
    priceChangeThresholdPct,
    defaultParCases: 2,
  };
}

function user(role: RoleName): AuthSessionUser {
  return {
    id: `settings-${role}`,
    name: role,
    email: `${role.toLowerCase()}@example.com`,
    role,
    position: 'Staff',
    hourlyRate: null,
  };
}

test('store setting reads do not select the price change column', async () => {
  assert.equal(Object.hasOwn(storeSettingSafeSelect, 'priceChangeThresholdPct'), false);
  const fallback = await getPriceChangeThresholdPct(async () => {
    throw new Error('The column price_change_threshold_pct does not exist in the current database.');
  });
  assert.equal(fallback, 8);
  assert.equal(
    isMissingPriceChangeColumn(
      new Error('The column price_change_threshold_pct does not exist in the current database.')
    ),
    true
  );
  assert.equal(isMissingPriceChangeColumn(new Error('Database unreachable')), false);
  await assert.rejects(
    () => getPriceChangeThresholdPct(async () => {
      throw new Error('Database unreachable');
    }),
    /Database unreachable/
  );
});

test('price change alert accepts 0 through 100 and rejects anything outside', () => {
  assert.equal(PLATFORM_DEFAULTS.priceChangeThresholdPct, DEFAULT_PRICE_CHANGE_THRESHOLD_PCT);
  for (const value of [0, 8, 12.5, 100]) {
    const parsed = parsePlatformSettings(settingsBody(value));
    assert.equal('settings' in parsed, true, String(value));
    if ('settings' in parsed) assert.equal(parsed.settings.priceChangeThresholdPct, value);
  }
  for (const value of [-0.1, -1, 100.1, 250, Number.NaN, null, undefined]) {
    const parsed = parsePlatformSettings(settingsBody(value));
    assert.equal('error' in parsed, true, String(value));
    if ('error' in parsed) assert.match(parsed.error, /Price change alert/);
  }
});

test('settings save keeps the manager guard and rejects a bad price change alert', async () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/settings/route.ts'), 'utf8');
  const form = fs.readFileSync(path.join(process.cwd(), 'components/features/admin/AccountPage.tsx'), 'utf8');
  const patchAt = route.indexOf('export async function PATCH');
  assert.ok(patchAt >= 0);
  assert.ok(route.indexOf('requireManagerStaff', patchAt) < route.indexOf('savePlatformSettings', patchAt));
  const receiving = form.indexOf('Invoice cost alert (%)');
  const price = form.indexOf('Price change alert (%)');
  assert.ok(receiving >= 0 && price > receiving);
  assert.match(form, /priceChangeThresholdPct/);
  assert.match(form, /Receiving/);

  try {
    for (const role of ROLES) {
      setManagerStaffTestAuth(async () => user(role));
      const response = await PATCH(
        new NextRequest('http://localhost/api/admin/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(settingsBody(role === 'ADMIN' ? 101 : -1)),
        })
      );
      const body = (await response.json()) as { success?: boolean; error?: string };
      if (role === 'ADMIN' || role === 'STORE_MANAGER') {
        assert.equal(response.status, 400, role);
        assert.match(body.error ?? '', /Price change alert/);
      } else {
        assert.equal(response.status, 403, role);
      }
    }
  } finally {
    setManagerStaffTestAuth(null);
  }
});
