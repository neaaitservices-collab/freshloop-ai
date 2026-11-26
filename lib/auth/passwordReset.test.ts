import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { passwordResetBlocked } from '@/lib/auth/passwordReset';

test('password reset links are not issued for a deactivated account', () => {
  assert.equal(passwordResetBlocked(null), false);
  assert.equal(passwordResetBlocked(undefined), false);
  assert.equal(passwordResetBlocked(new Date('2026-11-26T12:00:00.000Z')), true);
  const source = readFileSync('lib/auth/passwordReset.ts', 'utf8');
  assert.match(source, /passwordResetBlocked\(user\.deactivatedAt\)/);
  assert.equal(source.match(/passwordResetBlocked\(user\.deactivatedAt\)/g)?.length, 2);
});
