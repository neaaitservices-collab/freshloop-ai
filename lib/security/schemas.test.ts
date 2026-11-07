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
import { signupBodySchema } from '@/lib/security/schemas/auth';
import { posWebhookBodySchema } from '@/lib/security/schemas/posWebhook';

describe('security schemas', () => {
  it('rejects unknown keys on manufacturing body', () => {
    assert.throws(() =>
      manufacturingPostBodySchema.parse({
        recipe_id: 'abc',
        batch_output: 10,
        staff_id: 'evil',
      })
    );
  });

  it('accepts valid manufacturing payload', () => {
    const parsed = manufacturingPostBodySchema.parse({
      recipe_id: 'recipe-1',
      batch_output: 12,
      enforce_stock_check: true,
    });
    assert.equal(parsed.batch_output, 12);
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

  it('sanitizes signup name control chars', () => {
    const parsed = signupBodySchema.parse({
      name: 'Chef\x00One',
      email: 'chef@freshloop.test',
      password: 'freshloop1',
      role: 'DELI_CHEF',
    });
    assert.equal(parsed.name, 'ChefOne');
    assert.equal(parsed.role, 'DELI_CHEF');
  });
});
