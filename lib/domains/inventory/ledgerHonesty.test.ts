import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PATCH as patchInventory } from '@/app/api/inventory/route';
import { wasteKpiFromLedgerTotals } from '@/lib/domains/inventory/ledger';
import {
  isDemoFusionRecipeId,
  visibleFusionRecipes,
} from '@/lib/domains/kitchen/recipeFusionStore';
import { selectManufacturingCatalog } from '@/lib/domains/manufacturing/buildCatalog';
import type { RecipeFusionResult } from '@/lib/types';
import { computeWastePct, officialWastePctLabel } from '@/lib/domains/stats/wasteKpi';

const root = process.cwd();

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

test('live TypeScript does not import the removed legacy catalog', () => {
  assert.equal(statExists(path.join(root, 'lib/legacy/mockData.ts')), false);
  assert.equal(statExists(path.join(root, 'lib/legacy/db.ts')), false);
  const offenders: string[] = [];
  for (const file of sourceFiles(root)) {
    if (file.endsWith('ledgerHonesty.test.ts')) continue;
    const text = readFileSync(file, 'utf8');
    if (
      text.includes('@/lib/legacy') ||
      text.includes('lib/legacy/mockData') ||
      text.includes('lib/legacy/db') ||
      text.includes('INITIAL_INVENTORY_ITEMS') ||
      text.includes('INITIAL_FUSION_RECIPES') ||
      text.includes('getMockRecipeFusion')
    ) {
      offenders.push(path.relative(root, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('PATCH /api/inventory is retired and returns no demo stock', async () => {
  const response = await patchInventory();
  assert.equal(response.status, 410);
  const body = (await response.json()) as { success?: boolean; error?: string; items?: unknown };
  assert.equal(body.success, false);
  assert.equal(body.items, undefined);
  assert.match(String(body.error), /POST \/api\/inventory\/move/);
  const source = readFileSync('app/api/inventory/route.ts', 'utf8');
  const patch = source.slice(source.indexOf('export async function PATCH'));
  assert.equal(patch.includes('prisma'), false);
  assert.equal(patch.includes('mockData'), false);
  assert.match(source, /getLedgerInventoryItems/);
  assert.doesNotMatch(source, /INITIAL_INVENTORY_ITEMS/);
});

test('recipe fusion GET lists stored rows and drops demo ids', () => {
  const route = readFileSync('app/api/recipe-fusion/route.ts', 'utf8');
  const getHandler = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  assert.match(getHandler, /listFusionRecipes\(\)/);
  assert.equal(getHandler.includes('processRecipeFusion'), false);
  assert.equal(getHandler.includes('prisma.'), false);
  assert.equal(isDemoFusionRecipeId('rec-mock-1-99'), true);
  assert.equal(isDemoFusionRecipeId('rec-gen-1'), false);
  const demo = { id: 'rec-mock-1', recipeName: 'Demo crisp' } as RecipeFusionResult;
  const live = { id: 'ck-real', recipeName: 'Herb soup' } as RecipeFusionResult;
  assert.deepEqual(visibleFusionRecipes([demo, live]).map((row) => row.id), ['ck-real']);
  assert.deepEqual(visibleFusionRecipes([]), []);
  assert.match(route, /isDemoFusionRecipeId/);
  assert.match(readFileSync('lib/domains/ai/gemini.ts', 'utf8'), /rejectProductionAiMock\('Recipe fusion'\)/);
});

test('an empty ledger reports zero waste dollars and withholds waste percent', () => {
  const empty = wasteKpiFromLedgerTotals({
    discardValue: 0,
    volumetricScrapValue: 0,
    volumetricScrapBucketsCount: 0,
    grossSalesRevenue: 0,
    targetWastePct: 2.5,
    legacyUnpricedSaleCount: 0,
    legacyUnpricedSaleUnits: 0,
    scrapInputs: { volumeL: 20, densityKgPerL: 0.65, costPerKg: 3.5 },
  });
  assert.equal(empty.totalWasteValue, 0);
  assert.equal(empty.totalDiscardValue, 0);
  assert.equal(empty.grossSalesRevenue, 0);
  assert.equal(empty.wastePct, null);
  assert.equal(empty.isExceedingTarget, false);
  assert.equal(empty.trafficLightStatus, 'GREEN');
  assert.equal(officialWastePctLabel(empty.wastePct), '—');
  assert.equal(computeWastePct(0, 0), null);

  const ratio = wasteKpiFromLedgerTotals({
    discardValue: 200,
    volumetricScrapValue: 50,
    volumetricScrapBucketsCount: 1,
    grossSalesRevenue: 10_000,
    targetWastePct: 2.5,
    legacyUnpricedSaleCount: 0,
    legacyUnpricedSaleUnits: 0,
    scrapInputs: { volumeL: 20, densityKgPerL: 0.65, costPerKg: 3.5 },
  });
  assert.equal(ratio.totalWasteValue, 250);
  assert.equal(ratio.wastePct, 2.5);
  assert.equal(ratio.grossSalesRevenue, 10_000);
});

test('waste percent SQL uses ledger sales and waste only', () => {
  const ledger = readFileSync('lib/domains/inventory/ledger.ts', 'utf8');
  const fn = ledger.slice(
    ledger.indexOf('export async function calculateRealTimeWastePct'),
    ledger.indexOf('const wasteKpiCache')
  );
  assert.match(fn, /Transaction_Type" = 'Waste'/);
  assert.match(fn, /TransactionType\.Sale, TransactionType\.POS_Sale/);
  assert.match(fn, /sumRecognizedGrossSales/);
  assert.match(fn, /wasteKpiFromLedgerTotals/);
  assert.equal(fn.includes('inventoryItem'), false);
  assert.equal(fn.includes('MarkdownEvent'), false);
  assert.equal(fn.includes('mockData'), false);
  assert.equal(fn.includes('revenueImpact'), false);
});

test('manufacturing catalog stays empty instead of demo recipes', () => {
  assert.deepEqual(selectManufacturingCatalog({ error: null, saved: [], fallback: [{ recipeId: 'rec-panzanella-001' } as never] }), []);
  assert.throws(() =>
    selectManufacturingCatalog({
      error: Object.assign(new Error("Can't reach database server"), { code: 'P1001' }),
      saved: [],
      fallback: [{ recipeId: 'rec-panzanella-001', fallback: true } as never],
    })
  );
});

test('empty-store screens name the empty state and keep skeletons and error boundaries', () => {
  const inventory = readFileSync('components/features/inventory/InventoryMasterDetail.tsx', 'utf8');
  const grid = readFileSync('components/features/inventory/InventoryDataGrid.tsx', 'utf8');
  const workspace = readFileSync('components/features/inventory/AdminInventoryWorkspace.tsx', 'utf8');
  const catalog = readFileSync('components/features/production/ProductionRecipeCatalogSection.tsx', 'utf8');
  const bom = readFileSync('components/features/production/ProductionActiveBomPanel.tsx', 'utf8');
  const voice = readFileSync('components/features/voice/VoiceLoggerModal.tsx', 'utf8');
  const slate = readFileSync('components/features/inventory/SlateInventory.tsx', 'utf8');
  assert.match(inventory, /No stock on the ledger/);
  assert.match(grid, /emptyLabel/);
  assert.match(workspace, /No catalog SKUs yet/);
  assert.match(catalog, /No saved recipes\./);
  assert.match(catalog, /Sample cards are not listed/);
  assert.match(bom, /No BOM recipes yet/);
  assert.match(bom, /summaryLoading \?/);
  assert.match(slate, /animate-pulse/);
  assert.equal(voice.includes('FALLBACK_CATALOG'), false);
  assert.equal(voice.includes('Avocados Hass'), false);
  assert.match(voice, /Sample SKUs are not shown/);
  for (const file of [
    'app/inventory/loading.tsx',
    'app/inventory/error.tsx',
    'app/admin/loading.tsx',
    'app/admin/error.tsx',
    'app/kitchen/loading.tsx',
    'app/kitchen/error.tsx',
    'app/operations/loading.tsx',
    'app/operations/error.tsx',
    'app/production/loading.tsx',
    'app/production/error.tsx',
  ]) {
    assert.equal(statExists(path.join(root, file)), true, file);
  }
  const readme = readFileSync('README.md', 'utf8');
  assert.match(readme, /Next\.js 16/);
  assert.match(readme, /Node\.js 24/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { engines: { node: string } };
  assert.equal(pkg.engines.node, '24.x');
  assert.equal(readFileSync('.nvmrc', 'utf8').trim(), '24');
  const devGuide = readFileSync('docs/FOR_DEVELOPERS.md', 'utf8');
  assert.match(devGuide, /InventoryTransaction/);
  assert.match(devGuide, /wasteKpiFromLedgerTotals/);
  assert.equal(devGuide.includes('blend **live ledger data**'), false);
});

function statExists(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}
