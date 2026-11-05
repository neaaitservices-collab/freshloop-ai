import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { manufacturingPostBodySchema } from '@/lib/security/schemas/manufacturing';
import { inventoryMoveBodySchema, volumetricScrapBodySchema } from '@/lib/security/schemas/inventory';
import { signupBodySchema } from '@/lib/security/schemas/auth';

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

  it('bounds volumetric scrap buckets', () => {
    assert.throws(() => volumetricScrapBodySchema.parse({ buckets: 0 }));
    assert.throws(() => volumetricScrapBodySchema.parse({ buckets: 9999 }));
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
