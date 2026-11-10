import assert from 'node:assert/strict';
import test from 'node:test';
import { InventoryLocation, TransactionType } from '@prisma/client';
import { POST } from '@/app/api/pos/webhook/route';
import { getCurrentStock, prisma } from '@/lib/domains/inventory/ledger';
import { postProductReceipt } from '@/lib/domains/inventory/stock';
import { rebuildLotsFromLedger } from '@/lib/domains/inventory/rebuildLots';
import {
  POS_WEBHOOK_TEST_SECRET,
  posWebhookJsonRequest,
  readJsonResponse,
} from '@/lib/testing/posWebhookHttp';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

function withPosSecret<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.POS_WEBHOOK_SECRET;
  process.env.POS_WEBHOOK_SECRET = POS_WEBHOOK_TEST_SECRET;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.POS_WEBHOOK_SECRET;
    else process.env.POS_WEBHOOK_SECRET = prev;
  });
}

test('POS webhook rejects missing Authorization', async () => {
  await withPosSecret(async () => {
    const req = posWebhookJsonRequest(
      { externalRef: 'REF-AUTH', lines: [{ productId: 'prod-1', quantity: 1 }] },
      { omitAuth: true, clientIp: 'pos-test-auth' }
    );
    const res = await POST(req);
    const { status, body } = await readJsonResponse(res);
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });
});

test('POS webhook rejects wrong bearer secret', async () => {
  await withPosSecret(async () => {
    const req = posWebhookJsonRequest(
      { externalRef: 'REF-BAD-SECRET', lines: [{ productId: 'prod-1', quantity: 1 }] },
      { secret: 'wrong-secret', clientIp: 'pos-test-bad-secret' }
    );
    const res = await POST(req);
    const { status, body } = await readJsonResponse(res);
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });
});

test('POS webhook Zod validation returns 400', async () => {
  await withPosSecret(async () => {
    const ip = 'pos-test-validation';

    const missingRef = await readJsonResponse(
      await POST(
        posWebhookJsonRequest({ lines: [{ productId: 'p1', quantity: 1 }] }, { clientIp: ip })
      )
    );
    assert.equal(missingRef.status, 400);
    assert.equal(missingRef.body.success, false);

    const emptyLines = await readJsonResponse(
      await POST(
        posWebhookJsonRequest({ externalRef: 'REF-EMPTY', lines: [] }, { clientIp: `${ip}-2` })
      )
    );
    assert.equal(emptyLines.status, 400);

    const negativeQty = await readJsonResponse(
      await POST(
        posWebhookJsonRequest(
          { externalRef: 'REF-NEG', lines: [{ productId: 'p1', quantity: -2 }] },
          { clientIp: `${ip}-3` }
        )
      )
    );
    assert.equal(negativeQty.status, 400);

    const missingLineId = await readJsonResponse(
      await POST(
        posWebhookJsonRequest(
          { externalRef: 'REF-NO-SKU', lines: [{ quantity: 2 }] },
          { clientIp: `${ip}-4` }
        )
      )
    );
    assert.equal(missingLineId.status, 400);

    const invalidJson = posWebhookJsonRequest('{ not-json ', { clientIp: `${ip}-5` });
    const badJson = await readJsonResponse(await POST(invalidJson));
    assert.equal(badJson.status, 400);
  });
});

test('POS webhook sale ingestion and idempotency (requires DATABASE_URL)', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable (offline or wrong DATABASE_URL).');
    return;
  }

  await withPosSecret(async () => {
    const stamp = `pos-webhook-${Date.now()}`;
    const externalRef = `POS-REF-${stamp}`;
    const clientIp = `pos-test-ledger-${stamp}`;

    const product = await prisma.product.create({
      data: {
        name: `POS Webhook Test SKU ${stamp}`,
        department: 'PRODUCE',
        standardCost: 2,
        retailPrice: 4.5,
        shelfLifeDays: 7,
      },
    });

    t.after(async () => {
      await prisma.ledgerIdempotencyKey.deleteMany({
        where: { key: { endsWith: `:${externalRef}` } },
      });
      await prisma.inventoryLot.deleteMany({ where: { productId: product.id } });
      await prisma.inventoryTransaction.deleteMany({
        where: {
          OR: [{ productId: product.id }, { referenceId: externalRef }],
        },
      });
      await prisma.product.delete({ where: { id: product.id } });
    });

    await postProductReceipt({
      productId: product.id,
      quantityUnits: 12,
      unitCostAtTime: 2,
      staffId: 'test-staff',
      referenceId: `TEST-RCV-${stamp}`,
    });
    await rebuildLotsFromLedger({ productIds: [product.id] });

    const floorBefore = await getCurrentStock(product.id, InventoryLocation.Retail_Floor);
    assert.equal(floorBefore, 12);

    const payload = {
      externalRef,
      lines: [{ productId: product.id, quantity: 3, location: 'floor' as const }],
    };

    const first = await readJsonResponse(await POST(posWebhookJsonRequest(payload, { clientIp })));
    assert.equal(first.status, 200);
    assert.equal(first.body.success, true);
    assert.equal(first.body.idempotent, false);
    assert.equal(first.body.processed, 1);

    const floorAfterFirst = await getCurrentStock(product.id, InventoryLocation.Retail_Floor);
    assert.equal(floorAfterFirst, 9);

    const saleCount = await prisma.inventoryTransaction.count({
      where: {
        productId: product.id,
        referenceId: externalRef,
        transactionType: TransactionType.Sale,
      },
    });
    assert.equal(saleCount, 1);

    const second = await readJsonResponse(await POST(posWebhookJsonRequest(payload, { clientIp })));
    assert.equal(second.status, 200);
    assert.equal(second.body.success, true);
    assert.equal(second.body.idempotent, true);

    const floorAfterDup = await getCurrentStock(product.id, InventoryLocation.Retail_Floor);
    assert.equal(floorAfterDup, 9);

    const saleCountAfterDup = await prisma.inventoryTransaction.count({
      where: {
        productId: product.id,
        referenceId: externalRef,
        transactionType: TransactionType.Sale,
      },
    });
    assert.equal(saleCountAfterDup, 1);
  });
});
