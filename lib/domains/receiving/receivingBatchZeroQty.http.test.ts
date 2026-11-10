import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/receiving-logs/batch/route';
import { setReceivingStaffTestAuth } from '@/lib/auth/receivingStaffTestAuth';

function batchRequest(items: unknown[]) {
  return new NextRequest('http://localhost:3000/api/receiving-logs/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

test('a zero-quantity line does not reject the rest of the receiving batch', async (t) => {
  setReceivingStaffTestAuth(async () => ({
    id: 'recv-zero',
    name: 'Clerk',
    email: 'clerk@example.com',
    role: 'RECEIVING_CLERK',
    position: 'Receiver',
    hourlyRate: null,
  }));
  t.after(() => setReceivingStaffTestAuth(null));
  const response = await POST(
    batchRequest([
      {
        itemName: 'Avocados Hass',
        casesReceived: 4,
        caseCost: 3,
        packSize: 1,
        splitFactor: 1,
        retailUnit: 'units',
        marginMode: '40',
        currentRetailPrice: 2,
        externalLogId: 'line-INV-2026-1020-TD',
      },
      {
        itemName: 'Lemons',
        casesReceived: 0,
        caseCost: 3,
        packSize: 1,
        splitFactor: 1,
        retailUnit: 'units',
        marginMode: '40',
        currentRetailPrice: 2,
        externalLogId: '11111111-1111-4111-8111-111111111111',
      },
    ])
  );
  const body = (await response.json()) as {
    success?: boolean;
    savedCount?: number;
    results?: Array<{ itemName?: string; stock?: { posted?: boolean; reason?: string } }>;
  };
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.savedCount, 0);
  const lemons = body.results?.find((row) => row.itemName === 'Lemons');
  const avocados = body.results?.find((row) => row.itemName === 'Avocados Hass');
  assert.equal(lemons?.stock?.posted, false);
  assert.match(lemons?.stock?.reason ?? '', /not read/i);
  assert.equal(avocados?.stock?.posted, false);
  assert.match(avocados?.stock?.reason ?? '', /preview only/i);
});
