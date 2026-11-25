import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { PATCH as patchInventory } from '@/app/api/inventory/route';
import { POST as postRecipeFusion } from '@/app/api/recipe-fusion/route';
import { setKitchenStaffTestAuth } from '@/lib/auth/kitchenStaffTestAuth';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import {
  AiUnavailableError,
  fusionRecipesFromModelPayload,
  processRecipeFusion,
  setFusionModelReaderForTest,
} from '@/lib/domains/ai/gemini';
import { fusionRecipeCreateData } from '@/lib/domains/kitchen/recipeFusionStore';
import { isVolumetricScrapLedgerRow } from '@/lib/domains/inventory/volumetricScrapLedger';
import { VOLUMETRIC_SCRAP_REF_PREFIX } from '@/lib/domains/inventory/ledger';
import {
  computeWastePct,
  MIN_GROSS_SALES_FOR_WASTE_RATIO,
  officialWastePctLabel,
} from '@/lib/domains/stats/wasteKpi';
import { supplierNameKey } from '@/lib/domains/suppliers/vendorAnalytics';
import { readJsonResponse } from '@/lib/testing/posWebhookHttp';

const chef: AuthSessionUser = {
  id: 'fusion-http',
  name: 'Chef',
  email: 'fusion-http@example.com',
  role: 'DELI_CHEF',
  position: 'Deli',
  hourlyRate: null,
};

function statExists(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

test('the legacy catalog files are gone', () => {
  const root = process.cwd();
  assert.equal(statExists(path.join(root, 'lib/legacy/mockData.ts')), false);
  assert.equal(statExists(path.join(root, 'lib/legacy/db.ts')), false);
});

test('PATCH /api/inventory is retired and returns no demo stock', async () => {
  const response = await patchInventory();
  assert.equal(response.status, 410);
  const body = (await response.json()) as { success?: boolean; error?: string; items?: unknown };
  assert.equal(body.success, false);
  assert.equal(body.items, undefined);
  assert.match(String(body.error), /POST \/api\/inventory\/move/);
});

test('waste percent turns on at $100 sales and stays withheld at $99.99', () => {
  assert.equal(MIN_GROSS_SALES_FOR_WASTE_RATIO, 100);
  assert.equal(computeWastePct(50, 99.99), null);
  assert.equal(officialWastePctLabel(computeWastePct(50, 99.99)), '—');
  assert.equal(computeWastePct(50, 100), 50);
  assert.equal(computeWastePct(0, 100), 0);
  assert.equal(computeWastePct(0, 0), null);
});

test('recipe fusion refuses a missing key and bad model JSON', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';
  await assert.rejects(() => processRecipeFusion([]), (error: unknown) => {
    assert.ok(error instanceof AiUnavailableError);
    return true;
  });

  process.env.GEMINI_API_KEY = 'test-key-not-used';
  setFusionModelReaderForTest(async () => 'this is not json');
  try {
    await assert.rejects(() => processRecipeFusion([]), (error: unknown) => {
      assert.ok(error instanceof AiUnavailableError);
      return true;
    });
    assert.throws(() => fusionRecipesFromModelPayload({ nope: true }), AiUnavailableError);

    const mixed = fusionRecipesFromModelPayload([
      { id: 'existing-uuid', recipeName: 'Bad' },
      {
        id: 'existing-uuid',
        recipeName: 'Herb soup',
        category: 'Soup',
        ingredientsUsed: [
          { name: 'Basil', quantity: '1 bunch', department: 'PRODUCE', estimatedCost: 1.25 },
        ],
        estimatedYield: '4 cups',
        estimatedCost: 1.25,
        targetRetailPrice: 6,
        grossMarginPct: 70,
        instructions: ['Chop the basil'],
        prepTimeMinutes: 10,
      },
    ]);
    assert.equal(mixed.length, 1);
    assert.equal(mixed[0]?.recipeName, 'Herb soup');
    assert.equal(mixed[0]?.id, '');
    const created = fusionRecipeCreateData(mixed[0]!);
    assert.equal('id' in created, false);
    assert.equal(created.recipeName, 'Herb soup');
    assert.equal(created.status, 'PROPOSED');
  } finally {
    setFusionModelReaderForTest(null);
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test('spoilage treats scrap reference ids and scrap notes as not product waste', () => {
  assert.equal(
    isVolumetricScrapLedgerRow({ referenceId: `${VOLUMETRIC_SCRAP_REF_PREFIX}-9`, notes: null }),
    true
  );
  assert.equal(isVolumetricScrapLedgerRow({ referenceId: null, notes: 'cubeta 2' }), true);
  assert.equal(
    isVolumetricScrapLedgerRow({ referenceId: null, notes: 'Volumetric scrap from prep' }),
    true
  );
  assert.equal(
    isVolumetricScrapLedgerRow({ referenceId: null, notes: '{"kind":"SCRAP_VOLUMETRIC_BUCKET"}' }),
    true
  );
  assert.equal(
    isVolumetricScrapLedgerRow({ referenceId: 'WASTE-1', notes: 'moldy berries' }),
    false
  );
  assert.equal(isVolumetricScrapLedgerRow({ referenceId: null, notes: null }), false);
});

test('supplier name matching trims and case-folds both sides', () => {
  assert.equal(supplierNameKey('  Lakelee '), supplierNameKey('lakelee'));
  assert.equal(supplierNameKey(null), '');
  assert.equal(supplierNameKey('  '), '');
});

test('POST /api/recipe-fusion rejects a bad body before a model call', async (t) => {
  setKitchenStaffTestAuth(async () => chef);
  t.after(() => setKitchenStaffTestAuth(null));
  const response = await readJsonResponse(
    await postRecipeFusion(
      new NextRequest('http://localhost/api/recipe-fusion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pullDays: 'soon', extra: true }),
      })
    )
  );
  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});
