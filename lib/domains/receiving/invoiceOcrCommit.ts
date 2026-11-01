import { Department, InventoryLocation } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { postProductReceipt } from '@/lib/domains/inventory/stock';

export type OcrQuantityKind = 'units' | 'cases';

export interface OcrCommitLine {
  product_id: string;
  quantity: number;
  quantity_kind?: OcrQuantityKind;
  unit_cost: number;
  to_location?: InventoryLocation;
  line_name?: string;
  department?: Department;
  case_pack_size?: number;
}

export interface OcrInvoiceMeta {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  departmentBreakdown: Record<string, number>;
  rawOcrJson?: unknown;
}

function resolveRetailUnits(line: OcrCommitLine, casePackSize: number): number {
  const raw = Math.abs(Number(line.quantity) || 0);
  if (!(raw > 0)) return 0;
  const kind = line.quantity_kind ?? 'units';
  if (kind === 'cases') {
    const pack = line.case_pack_size && line.case_pack_size > 0 ? line.case_pack_size : casePackSize;
    return Number((raw * pack).toFixed(4));
  }
  return Number(raw.toFixed(4));
}

export async function commitInvoiceOcrReceipts(input: {
  staffId: string;
  referenceId: string;
  confirmedItems: OcrCommitLine[];
  invoiceMeta?: OcrInvoiceMeta | null;
}) {
  const receipts = [];
  let invoiceId: string | null = null;

  if (input.invoiceMeta) {
    const meta = input.invoiceMeta;
    const invoice = await prisma.vendorInvoice.create({
      data: {
        vendorName: meta.vendorName,
        invoiceNumber: meta.invoiceNumber,
        invoiceDate: new Date(meta.invoiceDate),
        totalAmount: meta.totalAmount,
        departmentBreakdown: meta.departmentBreakdown,
        rawOcrJson: meta.rawOcrJson ?? undefined,
        status: 'RECEIVED',
      },
    });
    invoiceId = invoice.id;
  }

  for (const item of input.confirmedItems) {
    const productId = String(item.product_id ?? '').trim();
    if (!productId) continue;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { casePackSize: true, name: true, department: true },
    });
    if (!product) continue;

    const pack = product.casePackSize && product.casePackSize > 0 ? product.casePackSize : 1;
    const units = resolveRetailUnits(item, pack);
    if (!(units > 0)) continue;

    const receipt = await postProductReceipt({
      productId,
      quantityUnits: units,
      unitCostAtTime: Number(item.unit_cost) || 0,
      staffId: input.staffId,
      referenceId: input.referenceId,
      toLocation: item.to_location ?? InventoryLocation.Retail_Floor,
      notes: 'Confirmed Invoice OCR Receipt',
    });
    receipts.push(receipt);

    if (invoiceId) {
      await prisma.invoiceLineItem.create({
        data: {
          invoiceId,
          name: item.line_name ?? product.name,
          department: item.department ?? product.department,
          quantity: units,
          unit: 'units',
          unitCost: Number(item.unit_cost) || 0,
          totalCost: Number(((Number(item.unit_cost) || 0) * units).toFixed(2)),
          casePackSize: pack,
        },
      });
    }
  }

  return {
    invoiceId,
    receipts,
    transactionsCreated: receipts.length,
  };
}
