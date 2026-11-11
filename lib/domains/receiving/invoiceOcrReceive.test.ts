import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST as postReceivingBatch } from '@/app/api/receiving-logs/batch/route';
import { setReceivingStaffTestAuth } from '@/lib/auth/receivingStaffTestAuth';
import {
  draftReceiveBlock,
  OCR_CLIENT_COPY_REJECTED,
  OCR_DRAFT_NOT_ACCEPTED,
  payloadWithPostedLines,
  receiveAcceptedInvoiceOcr,
  type InvoiceOcrPostEntry,
  type OcrDraftRecord,
} from '@/lib/domains/receiving/invoiceOcrReceive';
import type { OcrDraftPayload } from '@/lib/domains/receiving/invoiceOcrCommit';
import type { ReceivingLogPostResult } from '@/lib/domains/receiving/receivingLogPost';

const DELIVERY_ID = '33333333-3333-4333-8333-333333333333';

function storedDraft(): OcrDraftRecord {
  return {
    id: 'draft-1',
    staffId: 'clerk-1',
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    payload: {
      vendorName: 'Tony Deodato',
      invoiceNumber: 'INV-100',
      invoiceDate: '2026-11-08',
      totalAmount: 36,
      departmentBreakdown: { PRODUCE: 36 },
      lines: [
        {
          product_id: 'sku-apple',
          quantity: 3,
          quantity_kind: 'cases',
          unit_cost: 12,
          line_name: 'Honeycrisp Apples',
          department: 'PRODUCE',
          case_pack_size: 40,
          line_confidence: 0.96,
          requires_approval: false,
        },
      ],
    },
  };
}

function browserCopy(overrides: Record<string, unknown> = {}) {
  return {
    draftLineIndex: 0,
    externalLogId: DELIVERY_ID,
    itemName: 'Honeycrisp Apples',
    productId: 'sku-apple',
    casesReceived: 3,
    caseCost: 12,
    packSize: 40,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 2.5,
    ...overrides,
  };
}

function deps(draft: OcrDraftRecord | null, posted: InvoiceOcrPostEntry[]) {
  return {
    findDraft: async () => draft,
    postLines: async (input: { entries: InvoiceOcrPostEntry[] }) => {
      posted.push(...input.entries);
      return input.entries.map(
        (entry): ReceivingLogPostResult => ({
          externalLogId: entry.line.externalLogId,
          itemName: entry.line.itemName,
          stock: {
            posted: true,
            unitsAdded: entry.line.casesReceived,
            onHand: entry.line.casesReceived,
            productId: entry.line.productId ?? '',
            productName: entry.line.itemName,
            transactionId: 'tx-1',
          },
        })
      );
    },
  };
}

test('an accepted server draft posts its stored quantity and cost', async () => {
  const posted: InvoiceOcrPostEntry[] = [];
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      supplierId: 'sup-1',
      items: [browserCopy()],
    },
    deps: deps(storedDraft(), posted),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(posted.length, 1);
  assert.equal(posted[0]?.line.casesReceived, 3);
  assert.equal(posted[0]?.line.caseCost, 12);
  assert.equal(posted[0]?.line.itemName, 'Honeycrisp Apples');
  assert.equal(posted[0]?.line.productId, 'sku-apple');
  assert.equal(outcome.results[0]?.stock.posted, true);
  if (outcome.results[0]?.stock.posted) {
    assert.equal(outcome.results[0].stock.unitsAdded, 3);
  }
});

test('client-only invoice data is rejected', async () => {
  let lookedUp = false;
  let wrote = false;
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      items: [browserCopy({ casesReceived: 40, caseCost: 1 })],
    },
    deps: {
      findDraft: async () => {
        lookedUp = true;
        return storedDraft();
      },
      postLines: async () => {
        wrote = true;
        return [];
      },
    },
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 400);
  assert.equal(outcome.error, OCR_CLIENT_COPY_REJECTED);
  assert.equal(lookedUp, false);
  assert.equal(wrote, false);
});

test('a client packSize of 1000 does not change the posted quantity', async () => {
  const posted: InvoiceOcrPostEntry[] = [];
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'someone-else',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      supplierId: 'sup-1',
      items: [browserCopy({ packSize: 1000, splitFactor: 0.001 })],
    },
    deps: deps(storedDraft(), posted),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const line = posted[0]?.line;
  assert.equal(line?.packSize, 40);
  assert.equal(line?.splitFactor, 1);
  assert.equal(line?.casesReceived, 3);
  assert.equal((line?.casesReceived ?? 0) * ((line?.packSize ?? 0) / (line?.splitFactor ?? 1)), 120);
});

test('a clerk changing the pack is blocked', async () => {
  let wrote = false;
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      supplierId: 'sup-1',
      resolutions: { lines: [{ index: 0, packSize: 10, splitFactor: 2 }] },
      items: [browserCopy()],
    },
    deps: {
      findDraft: async () => storedDraft(),
      postLines: async () => {
        wrote = true;
        return [];
      },
    },
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 409);
  assert.match(outcome.error, /pack is 10 and split is 2/);
  assert.equal(wrote, false);
});

test('a manager may change the pack and the editor is recorded', async () => {
  const seen: OcrDraftPayload[] = [];
  const posted: InvoiceOcrPostEntry[] = [];
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'manager-1',
    actorIsManager: true,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      supplierId: 'sup-1',
      resolutions: { lines: [{ index: 0, packSize: 10 }] },
      items: [browserCopy({ packSize: 1000 })],
    },
    deps: {
      findDraft: async () => storedDraft(),
      postLines: async (input) => {
        seen.push(input.resolved);
        posted.push(...input.entries);
        return posted.map((entry) => ({
          externalLogId: entry.line.externalLogId,
          itemName: entry.line.itemName,
          stock: {
            posted: true as const,
            unitsAdded: entry.line.casesReceived,
            onHand: entry.line.casesReceived,
            productId: entry.line.productId ?? '',
            productName: entry.line.itemName,
            transactionId: 'tx-1',
          },
        }));
      },
    },
  });
  assert.equal(outcome.ok, true);
  assert.equal(posted[0]?.line.packSize, 10);
  assert.equal(posted[0]?.line.casesReceived, 3);
  assert.equal(seen[0]?.lines[0]?.pack_edited_by, 'manager-1');
  assert.equal(seen[0]?.lines[0]?.case_pack_size, 10);
});

test('a clerk with only manualReviewOverride cannot change the pack', async () => {
  let wrote = false;
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-2',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      manualReviewOverride: true,
      supplierId: 'sup-1',
      resolutions: { lines: [{ index: 0, packSize: 10 }] },
      items: [browserCopy()],
    },
    deps: {
      findDraft: async () => storedDraft(),
      postLines: async () => {
        wrote = true;
        return [];
      },
    },
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 409);
  assert.match(outcome.error, /pack is 10/);
  assert.equal(wrote, false);
});

test('a clerk can post the other lines after a manager approves one pack change', async () => {
  const draft = storedDraft();
  const payload = draft.payload as OcrDraftPayload;
  payload.lines.push({
    ...payload.lines[0]!,
    product_id: 'sku-pear',
    line_name: 'Pears',
    quantity: 2,
    case_pack_size: 20,
  });
  let saved: OcrDraftPayload | null = null;
  const manager = await receiveAcceptedInvoiceOcr({
    actorId: 'manager-1',
    actorIsManager: true,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      supplierId: 'sup-1',
      resolutions: { lines: [{ index: 0, packSize: 10 }] },
      items: [browserCopy()],
    },
    deps: {
      findDraft: async () => draft,
      postLines: async (input) => {
        saved = input.resolved;
        return input.entries.map((entry) => ({
          externalLogId: entry.line.externalLogId,
          itemName: entry.line.itemName,
          stock: {
            posted: true as const,
            unitsAdded: entry.line.casesReceived,
            onHand: 1,
            productId: entry.line.productId ?? '',
            productName: entry.line.itemName,
            transactionId: 'tx-1',
          },
        }));
      },
    },
  });
  assert.equal(manager.ok, true);
  assert.ok(saved);
  const approved = saved as unknown as OcrDraftPayload;
  assert.equal(approved.lines[0]?.pack_edited_by, 'manager-1');
  const posted: InvoiceOcrPostEntry[] = [];
  const clerk = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-2',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      supplierId: 'sup-1',
      items: [
        browserCopy({
          draftLineIndex: 1,
          externalLogId: '44444444-4444-4444-8444-444444444444',
          itemName: 'Pears',
          productId: 'sku-pear',
        }),
      ],
    },
    deps: {
      findDraft: async () => ({ ...draft, payload: approved }),
      postLines: async (input) => {
        posted.push(...input.entries);
        return input.entries.map((entry) => ({
          externalLogId: entry.line.externalLogId,
          itemName: entry.line.itemName,
          stock: {
            posted: true as const,
            unitsAdded: entry.line.casesReceived,
            onHand: 1,
            productId: entry.line.productId ?? '',
            productName: entry.line.itemName,
            transactionId: 'tx-2',
          },
        }));
      },
    },
  });
  assert.equal(clerk.ok, true);
  if (!clerk.ok) return;
  assert.equal(posted.length, 1);
  assert.equal(posted[0]?.line.itemName, 'Pears');
  assert.equal(posted[0]?.line.packSize, 20);
  assert.equal(posted[0]?.line.casesReceived, 2);
});

test('the posting gate sees the resolved quantity and pack', async () => {
  const draft = storedDraft();
  const payload = draft.payload as { lines: Array<Record<string, unknown>> };
  payload.lines[0]!.quantity = 0;
  payload.lines[0]!.quantity_unreadable = true;
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      resolutions: { lines: [{ index: 0, quantity: 6, packSize: 12 }] },
      items: [browserCopy()],
    },
    deps: {
      findDraft: async () => draft,
      postLines: async () => [],
    },
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.match(outcome.error, /pack is 12 and split is 1/);
  assert.equal(outcome.error.includes('quantity_unreadable'), false);
});

test('an out-of-range pack resolution is rejected', async () => {
  let wrote = false;
  const rejected = await receiveAcceptedInvoiceOcr({
    actorId: 'manager-1',
    actorIsManager: true,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      resolutions: { lines: [{ index: 0, packSize: 1_000_001 }] },
      items: [browserCopy()],
    },
    deps: {
      findDraft: async () => storedDraft(),
      postLines: async () => {
        wrote = true;
        return [];
      },
    },
  });
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.equal(rejected.status, 400);
  assert.equal(rejected.code, 'OCR_RESOLUTION_INVALID');
  assert.equal(wrote, false);
});

test('postedBy records the actor next to the posted line indexes', () => {
  const stored = storedDraft().payload as OcrDraftPayload;
  const raw = {
    ...stored,
    postedLineIndexes: [1],
    postedBy: [{ index: 1, actorId: 'clerk-1', at: '2026-11-01T00:00:00.000Z' }],
  };
  const next = payloadWithPostedLines(stored, raw, [0], 'manager-9', '2026-11-11T05:00:00.000Z');
  assert.deepEqual(next.postedLineIndexes, [1, 0]);
  assert.deepEqual(next.postedBy, [
    { index: 1, actorId: 'clerk-1', at: '2026-11-01T00:00:00.000Z' },
    { index: 0, actorId: 'manager-9', at: '2026-11-11T05:00:00.000Z' },
  ]);
});

test('a missing draft line index is rejected', async () => {
  let wrote = false;
  const { draftLineIndex: _ignored, ...item } = browserCopy();
  void _ignored;
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      supplierId: 'sup-1',
      items: [item],
    },
    deps: {
      findDraft: async () => storedDraft(),
      postLines: async () => {
        wrote = true;
        return [];
      },
    },
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 400);
  assert.equal(outcome.code, 'OCR_LINE_NOT_ON_DRAFT');
  assert.equal(wrote, false);
});

test('an expired draft fails once and does not post', async () => {
  let wrote = false;
  const draft = storedDraft();
  draft.expiresAt = new Date(Date.now() - 1_000);
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      items: [browserCopy()],
    },
    deps: {
      findDraft: async () => draft,
      postLines: async () => {
        wrote = true;
        return [];
      },
    },
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 409);
  assert.equal(outcome.code, 'OCR_DRAFT_EXPIRED');
  assert.match(outcome.error, /expired/i);
  assert.equal(wrote, false);
  const again = draftReceiveBlock({
    consumedAt: draft.consumedAt,
    expiresAt: draft.expiresAt,
    payload: { invoiceNumber: 'INV-100' },
  });
  assert.equal(again?.code, 'OCR_DRAFT_EXPIRED');
});

test('a consumed draft is blocked before stock is written', async () => {
  const draft = storedDraft();
  draft.consumedAt = new Date();
  const block = draftReceiveBlock({
    consumedAt: draft.consumedAt,
    expiresAt: draft.expiresAt,
    payload: { invoiceNumber: 'INV-100' },
  });
  assert.equal(block?.status, 409);
  assert.equal(block?.code, 'DRAFT_ALREADY_RECEIVED');
  let wrote = false;
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: { invoiceOcr: true, draftId: 'draft-1', acceptDraft: true, items: [browserCopy()] },
    deps: {
      findDraft: async () => draft,
      postLines: async () => {
        wrote = true;
        return [];
      },
    },
  });
  assert.equal(outcome.ok, false);
  assert.equal(wrote, false);
});

test('a tampered client payload is ignored and the stored draft is posted', async () => {
  const posted: InvoiceOcrPostEntry[] = [];
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      supplierId: 'sup-1',
      items: [
        browserCopy({
          itemName: 'Free apples',
          productId: 'evil-sku',
          casesReceived: 99,
          caseCost: 0.01,
          unit_cost: 0.01,
          quantity: 99,
        }),
      ],
    },
    deps: deps(storedDraft(), posted),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(posted.length, 1);
  assert.equal(posted[0]?.line.casesReceived, 3);
  assert.equal(posted[0]?.line.caseCost, 12);
  assert.equal(posted[0]?.line.itemName, 'Honeycrisp Apples');
  assert.equal(posted[0]?.line.productId, 'sku-apple');
  assert.notEqual(posted[0]?.line.casesReceived, 99);
  assert.notEqual(posted[0]?.line.caseCost, 0.01);
});

test('an unaccepted draft is rejected', async () => {
  let wrote = false;
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      supplierId: 'sup-1',
      items: [browserCopy()],
    },
    deps: {
      findDraft: async () => storedDraft(),
      postLines: async () => {
        wrote = true;
        return [];
      },
    },
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 409);
  assert.equal(outcome.error, OCR_DRAFT_NOT_ACCEPTED);
  assert.equal(wrote, false);
});

test('a clerk cannot post a cost-guardrail line by sending an override flag', async () => {
  let wrote = false;
  const draft = storedDraft();
  const payload = draft.payload as { lines: Array<{ requires_approval: boolean }> };
  payload.lines[0]!.requires_approval = true;
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      manualReviewOverride: true,
      supplierId: 'sup-1',
      items: [browserCopy()],
    },
    deps: {
      findDraft: async () => draft,
      postLines: async () => {
        wrote = true;
        return [];
      },
    },
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.status, 409);
  assert.equal(wrote, false);
});

test('a sanctioned quantity correction is posted and the browser quantity is not', async () => {
  const posted: InvoiceOcrPostEntry[] = [];
  const outcome = await receiveAcceptedInvoiceOcr({
    actorId: 'clerk-1',
    actorIsManager: false,
    body: {
      invoiceOcr: true,
      draftId: 'draft-1',
      acceptDraft: true,
      supplierId: 'sup-1',
      resolutions: { lines: [{ index: 0, quantity: 5 }] },
      items: [browserCopy({ casesReceived: 99, caseCost: 0.01 })],
    },
    deps: deps(storedDraft(), posted),
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(posted[0]?.line.casesReceived, 5);
  assert.equal(posted[0]?.line.caseCost, 12);
});

test('POST /api/receiving-logs/batch rejects a browser invoice copy with no draft', async (t) => {
  setReceivingStaffTestAuth(async () => ({
    id: 'clerk-1',
    name: 'Clerk',
    email: 'clerk@example.com',
    role: 'RECEIVING_CLERK',
    position: 'Receiver',
    hourlyRate: null,
  }));
  t.after(() => setReceivingStaffTestAuth(null));
  const response = await postReceivingBatch(
    new NextRequest('http://localhost:3000/api/receiving-logs/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        invoiceOcr: true,
        supplierId: 'sup-1',
        items: [browserCopy({ casesReceived: 99, caseCost: 0.01 })],
      }),
    })
  );
  const body = (await response.json()) as { success?: boolean; error?: string; code?: string };
  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.code, 'OCR_DRAFT_REQUIRED');
  assert.match(body.error ?? '', /browser copy/i);
});
