import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/domains/inventory/ledger';
import { saveInvoiceOcrDraft } from '@/lib/domains/receiving/invoiceOcrCommit';
import {
  discardOpenInvoiceScan,
  loadOpenInvoiceScan,
} from '@/lib/domains/receiving/openInvoiceScanStore';

function scratchDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (!url || process.env.FRESHLOOP_DB_TESTS === '0') return null;
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return url;
  } catch {
    return null;
  }
  return null;
}

const hasScratchDb = Boolean(scratchDatabaseUrl());

test('an open invoice scan survives a reload until it is discarded', { skip: !hasScratchDb }, async (t) => {
  const staffId = `scan-draft-${Date.now()}`;
  try {
    await prisma.$connect();
  } catch {
    t.skip('Scratch database unreachable.');
    return;
  }
  t.after(async () => {
    await prisma.invoiceOcrDraft.deleteMany({ where: { staffId } });
  });

  const saved = await saveInvoiceOcrDraft(staffId, {
    vendorName: 'North Market',
    invoiceNumber: `INV-${staffId}`,
    invoiceDate: '2026-11-02',
    totalAmount: 12,
    departmentBreakdown: { PRODUCE: 12 },
    lines: [
      {
        product_id: '',
        quantity: 3,
        quantity_kind: 'cases',
        unit_cost: 4,
        line_name: 'Bananas',
        department: 'PRODUCE',
        case_pack_size: 40,
        line_confidence: 0.91,
        requires_approval: false,
      },
    ],
  });

  const restored = await loadOpenInvoiceScan(staffId);
  assert.equal(restored?.draftId, saved.id);
  assert.equal(restored?.invoiceNumber, `INV-${staffId}`);
  assert.equal(restored?.lineItems[0]?.name, 'Bananas');
  assert.equal(restored?.lineItems[0]?.quantity, 3);

  assert.equal(await discardOpenInvoiceScan(staffId, saved.id), true);
  assert.equal(await loadOpenInvoiceScan(staffId), null);
  assert.equal(await discardOpenInvoiceScan(staffId, saved.id), false);
});
