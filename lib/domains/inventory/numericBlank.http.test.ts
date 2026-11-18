import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { PATCH as patchLevels } from '@/app/api/inventory/levels/route';
import { POST as postReceiving } from '@/app/api/receiving-logs/route';
import { setOperationalStaffTestAuth } from '@/lib/auth/operationalStaffTestAuth';
import { setReceivingStaffTestAuth } from '@/lib/auth/receivingStaffTestAuth';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { readJsonResponse } from '@/lib/testing/posWebhookHttp';

const staff: AuthSessionUser = {
  id: 'numeric-blank',
  name: 'Admin',
  email: 'numeric-blank@example.com',
  role: 'ADMIN',
  position: 'Admin',
  hourlyRate: null,
};

test('PATCH /api/inventory/levels rejects a blank casesOnHand and parCases', async (t) => {
  setOperationalStaffTestAuth(async () => staff);
  t.after(() => setOperationalStaffTestAuth(null));
  for (const body of [
    { productId: 'prod_1', casesOnHand: '' },
    { productId: 'prod_1', parCases: ' ' },
  ]) {
    const response = await readJsonResponse(
      await patchLevels(
        new NextRequest('http://localhost/api/inventory/levels', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    );
    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
  }
});

test('POST /api/receiving-logs rejects a blank case cost and retail price', async (t) => {
  setReceivingStaffTestAuth(async () => staff);
  t.after(() => setReceivingStaffTestAuth(null));
  const base = {
    itemName: 'Apples',
    casesReceived: 2,
    packSize: 12,
    splitFactor: 1,
    retailUnit: 'lbs',
    marginMode: '40',
    externalLogId: '33333333-3333-4333-8333-333333333333',
  };
  for (const extra of [{ caseCost: '', currentRetailPrice: 1.5 }, { caseCost: 10, currentRetailPrice: ' ' }]) {
    const response = await readJsonResponse(
      await postReceiving(
        new NextRequest('http://localhost/api/receiving-logs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...base, ...extra }),
        })
      )
    );
    assert.equal(response.status, 400, JSON.stringify(extra));
    assert.equal(response.body.success, false);
  }
});
