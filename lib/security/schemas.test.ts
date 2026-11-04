import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { manufacturingPostBodySchema } from '@/lib/security/schemas/manufacturing';
import { inventoryMoveBodySchema, volumetricScrapBodySchema } from '@/lib/security/schemas/inventory';
import { signupBodySchema } from '@/lib/security/schemas/auth';
import { staffCreateBodySchema, staffUpdateBodySchema } from '@/lib/security/schemas/staff';

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
    });
    assert.equal(parsed.name, 'ChefOne');
  });

  it('strips untrusted keys on staff create and update payloads', () => {
    const created = staffCreateBodySchema.parse({
      name: 'Alex Rivera',
      email: 'alex@freshloop.test',
      position: 'Production Chef',
      hourlyRate: '21.5',
      role: 'ADMIN',
      staffId: 'spoofed-id',
    });
    assert.equal(created.hourlyRate, 21.5);
    assert.equal('role' in created, false);
    assert.equal('staffId' in created, false);

    const updated = staffUpdateBodySchema.parse({
      name: 'Alex Rivera',
      email: 'alex@freshloop.test',
      hourlyRate: null,
      isAdmin: true,
    });
    assert.equal(updated.hourlyRate, null);
    assert.equal('isAdmin' in updated, false);
  });
});
