import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { manufacturingPostBodySchema } from '@/lib/security/schemas/manufacturing';
import {
  inventoryLevelsPatchSchema,
  inventoryMoveBodySchema,
  volumetricScrapBodySchema,
} from '@/lib/security/schemas/inventory';
import { buyForecastQuerySchema } from '@/lib/security/schemas/buyForecast';
import { supplierAnalyticsQuerySchema } from '@/lib/security/schemas/supplierAnalytics';
import { createStaffBodySchema } from '@/lib/security/schemas/staff';
import { recipeCreateBodySchema } from '@/lib/security/schemas/recipes';
import { signupBodySchema } from '@/lib/security/schemas/auth';
import { posWebhookBodySchema } from '@/lib/security/schemas/posWebhook';

describe('security schemas', () => {
  it('rejects unknown keys on manufacturing body', () => {
    assert.throws(() =>
      manufacturingPostBodySchema.parse({
        operation_id: '6f1c1b5a-1d4e-4a1e-9c1a-6b2d3e4f5a6b',
        recipe_id: 'abc',
        batch_output: 10,
        staff_id: 'evil',
      })
    );
  });

  it('requires a manufacturing operation id', () => {
    assert.throws(() =>
      manufacturingPostBodySchema.parse({
        recipe_id: 'recipe-1',
        batch_output: 12,
      })
    );
  });

  it('accepts valid manufacturing payload', () => {
    const parsed = manufacturingPostBodySchema.parse({
      operation_id: '6f1c1b5a-1d4e-4a1e-9c1a-6b2d3e4f5a6b',
      recipe_id: 'recipe-1',
      batch_output: 12,
      enforce_stock_check: true,
    });
    assert.equal(parsed.batch_output, 12);
    assert.equal(parsed.operation_id, '6f1c1b5a-1d4e-4a1e-9c1a-6b2d3e4f5a6b');
  });

  it('validates inventory move actions', () => {
    const parsed = inventoryMoveBodySchema.parse({
      productId: 'prod_1',
      action: 'rescue',
      quantity: 2,
    });
    assert.equal(parsed.action, 'rescue');
  });

  it('accepts offline clientMutationId on inventory mutations', () => {
    const move = inventoryMoveBodySchema.parse({
      productId: 'prod_1',
      action: 'waste',
      quantity: 1,
      clientMutationId: 'offline-mut-001',
    });
    assert.equal(move.clientMutationId, 'offline-mut-001');
    const patch = inventoryLevelsPatchSchema.parse({
      productId: 'prod_1',
      casesOnHand: 4,
      clientMutationId: 'offline-mut-002',
    });
    assert.equal(patch.casesOnHand, 4);
  });

  it('validates supplier analytics query', () => {
    const parsed = supplierAnalyticsQuerySchema.parse({ lookbackDays: '30' });
    assert.equal(parsed.lookbackDays, 30);
  });

  it('validates buy list forecast query', () => {
    const parsed = buyForecastQuerySchema.parse({
      lookbackDays: 7,
      leadTimeDays: 2,
      seasonalFactor: 1.2,
    });
    assert.equal(parsed.seasonalFactor, 1.2);
  });

  it('bounds volumetric scrap buckets', () => {
    assert.throws(() => volumetricScrapBodySchema.parse({ buckets: 0 }));
    assert.throws(() => volumetricScrapBodySchema.parse({ buckets: 9999 }));
  });

  it('rejects POS webhook lines without identifiers', () => {
    assert.throws(() =>
      posWebhookBodySchema.parse({
        externalRef: 'batch-1',
        lines: [{ quantity: 2 }],
      })
    );
  });

  it('rejects negative POS webhook quantities', () => {
    assert.throws(() =>
      posWebhookBodySchema.parse({
        externalRef: 'batch-2',
        lines: [{ productId: 'prod-1', quantity: -1 }],
      })
    );
  });

  it('accepts valid POS webhook batch', () => {
    const parsed = posWebhookBodySchema.parse({
      externalRef: 'POS-9001',
      lines: [{ productId: 'prod-1', quantity: 2, location: 'floor' }],
    });
    assert.equal(parsed.externalRef, 'POS-9001');
    assert.equal(parsed.lines[0]?.quantity, 2);
  });

  it('rejects blank inventory move quantities and accepts numeric strings', () => {
    const base = { productId: 'prod_1', action: 'rescue' as const };
    for (const quantity of ['', ' ', 'abc', Number.NaN, Number.POSITIVE_INFINITY, -1, 1e7]) {
      assert.equal(
        inventoryMoveBodySchema.safeParse({ ...base, quantity }).success,
        false,
        `quantity ${String(quantity)}`
      );
    }
    const whole = inventoryMoveBodySchema.parse({ ...base, quantity: '12' });
    const fractional = inventoryMoveBodySchema.parse({ ...base, quantity: '12.5' });
    assert.equal(whole.action, 'rescue');
    assert.equal(fractional.action, 'rescue');
    if (whole.action !== 'rescue' || fractional.action !== 'rescue') return;
    assert.equal(whole.quantity, 12);
    assert.equal(fractional.quantity, 12.5);
  });

  it('rejects a blank casesOnHand on inventory levels', () => {
    assert.equal(
      inventoryLevelsPatchSchema.safeParse({ productId: 'prod_1', casesOnHand: '' }).success,
      false
    );
    assert.equal(
      inventoryLevelsPatchSchema.safeParse({ productId: 'prod_1', parCases: ' ' }).success,
      false
    );
    assert.equal(
      inventoryLevelsPatchSchema.parse({ productId: 'prod_1', casesOnHand: '4' }).casesOnHand,
      4
    );
  });

  it('rejects a blank leadTimeDays on the buy forecast query', () => {
    assert.equal(buyForecastQuerySchema.safeParse({ leadTimeDays: '' }).success, false);
    assert.equal(buyForecastQuerySchema.safeParse({ safetyDays: '' }).success, false);
    assert.equal(buyForecastQuerySchema.safeParse({ leadTimeDays: ' ' }).success, false);
    const defaults = buyForecastQuerySchema.parse({});
    assert.equal(defaults.leadTimeDays, 2);
    assert.equal(defaults.safetyDays, 1);
    assert.equal(buyForecastQuerySchema.parse({ leadTimeDays: '0', safetyDays: '3' }).leadTimeDays, 0);
    assert.equal(buyForecastQuerySchema.parse({ safetyDays: '0' }).safetyDays, 0);
  });

  it('rejects a blank price alert threshold and accepts a numeric string', () => {
    assert.equal(
      supplierAnalyticsQuerySchema.safeParse({ priceAlertThresholdPct: '' }).success,
      false
    );
    assert.equal(
      supplierAnalyticsQuerySchema.parse({ priceAlertThresholdPct: '12.5' }).priceAlertThresholdPct,
      12.5
    );
  });

  it('rejects a blank hourly rate and accepts a numeric string', () => {
    const base = {
      name: 'Ada Lovelace',
      email: 'ada@freshloop.test',
      position: 'Receiver',
    };
    assert.equal(createStaffBodySchema.safeParse({ ...base, hourlyRate: '' }).success, false);
    assert.equal(createStaffBodySchema.parse({ ...base, hourlyRate: '12.5' }).hourlyRate, 12.5);
  });

  it('rejects blank recipe labor, packaging, and shelf price strings', () => {
    const base = {
      name: 'Banana bread',
      yieldPortions: 10,
      ingredients: [{ productId: 'flour', quantity: 1 }],
    };
    for (const field of ['laborHours', 'laborRate', 'packagingCostPerUnit', 'targetRetailPrice'] as const) {
      assert.equal(recipeCreateBodySchema.safeParse({ ...base, [field]: '' }).success, false, field);
      assert.equal(recipeCreateBodySchema.safeParse({ ...base, [field]: ' ' }).success, false, field);
    }
    const parsed = recipeCreateBodySchema.parse({
      ...base,
      laborHours: '0.5',
      laborRate: '17.6',
      packagingCostPerUnit: '1',
      targetRetailPrice: '7.99',
    });
    assert.equal(parsed.laborHours, 0.5);
    assert.equal(parsed.laborRate, 17.6);
    assert.equal(parsed.packagingCostPerUnit, 1);
    assert.equal(parsed.targetRetailPrice, 7.99);
    assert.equal(recipeCreateBodySchema.parse(base).laborHours, undefined);
  });

  it('sanitizes signup name control chars and drops a client role', () => {
    const parsed = signupBodySchema.parse({
      name: 'Chef\x00One',
      email: 'chef@freshloop.test',
      password: 'freshloop1',
      role: 'Owner',
    });
    assert.equal(parsed.name, 'ChefOne');
    assert.equal('role' in parsed, false);
  });
});
