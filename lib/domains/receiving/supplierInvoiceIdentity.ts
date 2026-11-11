import { Prisma } from '@prisma/client';
import { AuthError } from '@/lib/auth/session';
import { prisma } from '@/lib/domains/inventory/ledger';
import type { RoleName } from '@/lib/utils/roles';
import { normalizeProductPackFields } from '@/lib/domains/inventory/stock';
import {
  canonicalInvoiceDate,
  canonicalInvoiceNumber,
  canonicalPrintedLine,
  compactInvoiceNumber,
  INVOICE_NUMBER_REUSE_POLICY,
  SUPPLIER_REQUIRED_ERROR,
} from '@/lib/domains/receiving/invoiceDeliveryId';
import {
  assertReceivingDepartmentsChosen,
  postReceivingLogToInventory,
  type ReceivingLogPostInput,
  type ReceivingLogPostResult,
} from '@/lib/domains/receiving/receivingLogPost';
import { getSupplierNameById } from '@/lib/domains/suppliers/suppliers';

export const INVOICE_NUMBER_REQUIRED_ERROR =
  'This scan has no invoice number, so it was not given a delivery id. Enter the number from the paper and scan again.';

export const SUPPLIER_UNKNOWN_ERROR =
  'That supplier is not in the directory. Choose a saved supplier before receiving this invoice.';

export const DATE_REQUIRED_ERROR =
  'Enter the invoice date from the paper before this invoice can be received. A missing date was not matched to another delivery.';

export const DATE_CONFLICT_ERROR =
  'This supplier already has that invoice number on a different date. Stock was not posted. Confirm that this is the same invoice, or confirm that it is a different dated delivery.';

export const WHITESPACE_CONFLICT_ERROR =
  'This invoice number is not the same as a saved number just because the spaces differ. Stock was not posted. Confirm whether they are the same invoice or two different numbers.';

export const LEGACY_RECEIPT_ERROR =
  'This invoice number was already received under an older receipt. Stock was not posted. Confirm the earlier receipt to attach it without adding stock.';

export const LINES_NEED_CONFIRMATION_ERROR =
  'The scan includes printed lines that are not on the saved invoice yet. Nothing was added. Confirm to add only those missing lines.';

export const RENAME_AMBIGUOUS_ERROR =
  'A printed line no longer matches the saved invoice, and a different line appeared. That can be a rename. No new receipt was created. Map the renamed line onto the saved line before receiving it.';

export const AMBIGUOUS_DOCUMENT_ERROR =
  'More than one saved invoice matches that supplier and number. No document was chosen and stock was not posted.';

export { INVOICE_NUMBER_REUSE_POLICY, SUPPLIER_REQUIRED_ERROR };

export type SupplierInvoiceFailure =
  | 'SUPPLIER_REQUIRED'
  | 'SUPPLIER_UNKNOWN'
  | 'INVOICE_NUMBER_REQUIRED'
  | 'DATE_REQUIRED'
  | 'DATE_CONFLICT'
  | 'WHITESPACE_CONFLICT'
  | 'LEGACY_RECEIPT_PRESENT'
  | 'LINE_MISMATCH'
  | 'LINES_NEED_CONFIRMATION'
  | 'RENAME_AMBIGUOUS'
  | 'PRINTED_LINE_REQUIRED'
  | 'AMBIGUOUS_DOCUMENT'
  | 'DELIVERY_CONFLICT';

export interface ResolvedInvoiceLine {
  deliveryId: string;
  printedKey: string;
  occurrence: number;
  ordinal: number;
  alreadyReceived?: boolean;
}

export interface InvoiceIdentityDetails {
  storedDates?: string[];
  siblingKeys?: string[];
  legacyReceipts?: { key: string; vendor: string; invoice: string }[];
  newPrintedNames?: string[];
  unmatchedStored?: string[];
  unmatchedStoredLines?: { id: string; printedKey: string }[];
}

export type ResolveSupplierInvoiceResult =
  | { ok: true; created: boolean; invoiceKey: string; documentId: string; lines: ResolvedInvoiceLine[] }
  | { ok: false; code: SupplierInvoiceFailure; error: string; details?: InvoiceIdentityDetails };

export interface InvoiceIdentityLineInput {
  printedName: string;
}

type Tx = Prisma.TransactionClient;

type DocumentGraph = Prisma.SupplierInvoiceDocumentGetPayload<{
  include: { lines: true; dateLinks: true; keyAliases: true; lineAliases: true };
}>;

function lineSlots(lines: InvoiceIdentityLineInput[]): { printedKey: string; occurrence: number }[] | null {
  const counts = new Map<string, number>();
  const slots: { printedKey: string; occurrence: number }[] = [];
  for (const line of lines) {
    const printedKey = canonicalPrintedLine(line.printedName);
    if (!printedKey) return null;
    const occurrence = counts.get(printedKey) ?? 0;
    counts.set(printedKey, occurrence + 1);
    slots.push({ printedKey, occurrence });
  }
  return slots;
}

function fail(
  code: SupplierInvoiceFailure,
  error: string,
  details?: InvoiceIdentityDetails
): ResolveSupplierInvoiceResult {
  return { ok: false, code, error, ...(details ? { details } : {}) };
}

export function parseLegacyInvoiceKey(key: string): { vendor: string; invoice: string } | null {
  if (!key.startsWith('invoice:')) return null;
  const rest = key.slice('invoice:'.length);
  const split = rest.lastIndexOf(':');
  if (split <= 0 || split === rest.length - 1) return null;
  return { vendor: rest.slice(0, split), invoice: rest.slice(split + 1) };
}

function exactLegacyKeys(supplierName: string, invoiceNumber: string): string[] {
  const vendor = supplierName.trim().toLowerCase();
  const rawInvoice = invoiceNumber.trim().toLowerCase();
  const canonical = canonicalInvoiceNumber(invoiceNumber);
  const keys = new Set<string>();
  if (vendor && rawInvoice) keys.add(`invoice:${vendor}:${rawInvoice}`);
  if (vendor && canonical && canonical !== rawInvoice) keys.add(`invoice:${vendor}:${canonical}`);
  return [...keys];
}

export function legacyKeyMatchesSupplier(key: string, supplierName: string, invoiceNumber: string): boolean {
  const parsed = parseLegacyInvoiceKey(key.trim());
  if (!parsed) return false;
  const vendor = supplierName.trim().toLowerCase();
  if (parsed.vendor !== vendor) return false;
  return exactLegacyKeys(supplierName, invoiceNumber).includes(key.trim().toLowerCase());
}

/** Exact `invoice:vendor:number` rows for this supplier name. Other vendors are ignored. */
async function legacyReceipts(db: Tx | typeof prisma, supplierName: string, invoiceNumber: string) {
  const keys = exactLegacyKeys(supplierName, invoiceNumber);
  if (keys.length === 0) return [];
  const rows = await db.ledgerIdempotencyKey.findMany({
    where: { key: { in: keys } },
    select: { key: true },
  });
  return rows.flatMap((row) => {
    const parsed = parseLegacyInvoiceKey(row.key);
    if (!parsed || !legacyKeyMatchesSupplier(row.key, supplierName, invoiceNumber)) return [];
    return [{ key: row.key, vendor: parsed.vendor, invoice: parsed.invoice }];
  });
}

async function loadCandidates(tx: Tx, supplierId: string, invoiceKey: string, compact: string) {
  return tx.supplierInvoiceDocument.findMany({
    where: {
      supplierId,
      OR: [{ invoiceKey }, { invoiceKeyCompact: compact }, { keyAliases: { some: { invoiceKey } } }],
    },
    include: { lines: true, dateLinks: true, keyAliases: true, lineAliases: true },
  });
}

function documentMatchesKey(document: DocumentGraph, invoiceKey: string): boolean {
  return document.invoiceKey === invoiceKey || document.keyAliases.some((alias) => alias.invoiceKey === invoiceKey);
}

function documentMatchesDate(document: DocumentGraph, dateKey: string): boolean {
  return document.invoiceDateKey === dateKey || document.dateLinks.some((link) => link.dateKey === dateKey);
}

function toLines(document: DocumentGraph, slots: { printedKey: string; occurrence: number }[]): ResolveSupplierInvoiceResult {
  const unused = document.lines.map((line) => ({
    line,
    aliases: document.lineAliases.filter((alias) => alias.lineId === line.id),
  }));
  const resolved: ResolvedInvoiceLine[] = [];
  const unmatchedScan: string[] = [];
  for (const [ordinal, slot] of slots.entries()) {
    const exact = unused.findIndex(
      (entry) => entry.line.printedKey === slot.printedKey && entry.line.occurrence === slot.occurrence
    );
    const alias = unused.findIndex((entry) =>
      entry.aliases.some((item) => item.printedKey === slot.printedKey && item.occurrence === slot.occurrence)
    );
    const index = exact >= 0 ? exact : alias;
    if (index < 0) {
      unmatchedScan.push(slot.printedKey);
      continue;
    }
    const chosen = unused.splice(index, 1)[0]!;
    resolved.push({
      deliveryId: chosen.line.id,
      printedKey: slot.printedKey,
      occurrence: slot.occurrence,
      ordinal,
      alreadyReceived: chosen.line.heldByLegacy,
    });
  }
  if (unmatchedScan.length === 0) {
    return {
      ok: true,
      created: false,
      invoiceKey: document.invoiceKey,
      documentId: document.id,
      lines: resolved,
    };
  }
  if (unused.length > 0) {
    return fail('RENAME_AMBIGUOUS', RENAME_AMBIGUOUS_ERROR, {
      newPrintedNames: unmatchedScan,
      unmatchedStored: unused.map((entry) => entry.line.printedKey),
      unmatchedStoredLines: unused.map((entry) => ({ id: entry.line.id, printedKey: entry.line.printedKey })),
    });
  }
  return fail('LINES_NEED_CONFIRMATION', LINES_NEED_CONFIRMATION_ERROR, {
    newPrintedNames: unmatchedScan,
  });
}

async function recordEvent(
  tx: Tx,
  input: { documentId?: string | null; supplierId: string; actorId: string; action: string; detail: Prisma.InputJsonValue }
) {
  await tx.supplierInvoiceEvent.create({
    data: {
      documentId: input.documentId ?? null,
      supplierId: input.supplierId,
      actorId: input.actorId,
      action: input.action,
      detail: input.detail,
    },
  });
}

/**
 * First confirmed sight of supplier + invoice number + exact date assigns line UUIDs.
 * A later scan with the same three values reuses those rows.
 * A different date, a missing date, or a spacing collision does not post and does not create a document.
 */
export async function resolveSupplierInvoice(input: {
  supplierId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  lines: InvoiceIdentityLineInput[];
}): Promise<ResolveSupplierInvoiceResult> {
  const supplierId = input.supplierId?.trim() ?? '';
  if (!supplierId) return fail('SUPPLIER_REQUIRED', SUPPLIER_REQUIRED_ERROR);
  const invoiceKey = canonicalInvoiceNumber(input.invoiceNumber);
  if (!invoiceKey) return fail('INVOICE_NUMBER_REQUIRED', INVOICE_NUMBER_REQUIRED_ERROR);
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (!supplier) return fail('SUPPLIER_UNKNOWN', SUPPLIER_UNKNOWN_ERROR);
  const dateKey = canonicalInvoiceDate(input.invoiceDate);
  if (!dateKey) return fail('DATE_REQUIRED', DATE_REQUIRED_ERROR);
  const slots = lineSlots(input.lines);
  if (!slots) {
    return fail('PRINTED_LINE_REQUIRED', 'Each invoice line needs the printed description before it can be identified.');
  }

  const compact = compactInvoiceNumber(invoiceKey);

  try {
    return await writeResolved(
      supplierId,
      supplier.name,
      invoiceKey,
      compact,
      dateKey,
      input.invoiceNumber ?? invoiceKey,
      input.invoiceDate ?? dateKey,
      slots
    );
  } catch (error) {
    const unique =
      typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
    if (!unique) throw error;
    return writeResolved(
      supplierId,
      supplier.name,
      invoiceKey,
      compact,
      dateKey,
      input.invoiceNumber ?? invoiceKey,
      input.invoiceDate ?? dateKey,
      slots
    );
  }
}

async function writeResolved(
  supplierId: string,
  supplierName: string,
  invoiceKey: string,
  compact: string,
  dateKey: string,
  invoiceNumber: string,
  invoiceDate: string,
  slots: { printedKey: string; occurrence: number }[]
): Promise<ResolveSupplierInvoiceResult> {
  return prisma.$transaction(async (tx) => {
    const legacy = await legacyReceipts(tx, supplierName, invoiceNumber);
    const candidates = await loadCandidates(tx, supplierId, invoiceKey, compact);
    const exact = candidates.filter(
      (document) => documentMatchesKey(document, invoiceKey) && documentMatchesDate(document, dateKey)
    );
    if (exact.length > 1) return fail('AMBIGUOUS_DOCUMENT', AMBIGUOUS_DOCUMENT_ERROR);
    if (exact.length === 1) return toLines(exact[0]!, slots);

    const sameNumber = candidates.filter((document) => documentMatchesKey(document, invoiceKey));
    if (sameNumber.length > 0) {
      return fail('DATE_CONFLICT', DATE_CONFLICT_ERROR, {
        storedDates: sameNumber.map((document) => document.invoiceDateKey ?? ''),
      });
    }
    const spelledApart = candidates.filter(
      (document) => document.invoiceKeyCompact === compact && !documentMatchesKey(document, invoiceKey)
    );
    if (spelledApart.length > 0) {
      return fail('WHITESPACE_CONFLICT', WHITESPACE_CONFLICT_ERROR, {
        siblingKeys: [...new Set(spelledApart.map((document) => document.invoiceKey))],
        storedDates: [...new Set(spelledApart.map((document) => document.invoiceDateKey ?? ''))],
      });
    }
    if (legacy.length > 0) {
      return fail('LEGACY_RECEIPT_PRESENT', LEGACY_RECEIPT_ERROR, { legacyReceipts: legacy });
    }

    const created = await tx.supplierInvoiceDocument.create({
      data: {
        supplierId,
        invoiceKey,
        invoiceKeyCompact: compact,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: invoiceDate.trim(),
        invoiceDateKey: dateKey,
        lines: {
          create: slots.map((slot, ordinal) => ({
            printedKey: slot.printedKey,
            occurrence: slot.occurrence,
            ordinal,
          })),
        },
      },
      include: { lines: true, dateLinks: true, keyAliases: true, lineAliases: true },
    });
    return {
      ok: true as const,
      created: true,
      invoiceKey,
      documentId: created.id,
      lines: created.lines
        .slice()
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((line) => ({
          deliveryId: line.id,
          printedKey: line.printedKey,
          occurrence: line.occurrence,
          ordinal: line.ordinal,
        })),
    };
  });
}

export type ReconcileAction =
  | 'link-date'
  | 'separate-document'
  | 'link-spelling'
  | 'separate-spelling'
  | 'add-lines'
  | 'map-line'
  | 'adopt-legacy';

const MANAGER_RECONCILE_ACTIONS = new Set<ReconcileAction>([
  'link-date',
  'adopt-legacy',
  'link-spelling',
  'map-line',
]);

export function reconcileActionRequiresManager(action: ReconcileAction): boolean {
  return MANAGER_RECONCILE_ACTIONS.has(action);
}

export async function reconcileSupplierInvoice(input: {
  actorId: string;
  actorRole: RoleName;
  action: ReconcileAction;
  supplierId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  lines: InvoiceIdentityLineInput[];
  confirmNewPrintedNames?: string[];
  legacyKey?: string | null;
  fromLineId?: string | null;
  mappedPrintedName?: string | null;
}): Promise<ResolveSupplierInvoiceResult> {
  const supplierId = input.supplierId?.trim() ?? '';
  if (!supplierId) return fail('SUPPLIER_REQUIRED', SUPPLIER_REQUIRED_ERROR);
  const invoiceKey = canonicalInvoiceNumber(input.invoiceNumber);
  if (!invoiceKey) return fail('INVOICE_NUMBER_REQUIRED', INVOICE_NUMBER_REQUIRED_ERROR);
  const dateKey = canonicalInvoiceDate(input.invoiceDate);
  if (!dateKey) return fail('DATE_REQUIRED', DATE_REQUIRED_ERROR);
  const slots = lineSlots(input.lines);
  if (!slots && input.action !== 'adopt-legacy') {
    return fail('PRINTED_LINE_REQUIRED', 'Each invoice line needs the printed description before it can be identified.');
  }
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (!supplier) return fail('SUPPLIER_UNKNOWN', SUPPLIER_UNKNOWN_ERROR);
  if (
    reconcileActionRequiresManager(input.action) &&
    input.actorRole !== 'ADMIN' &&
    input.actorRole !== 'STORE_MANAGER'
  ) {
    throw new AuthError('Only a store manager or the owner can confirm this invoice match.', 403);
  }
  const compact = compactInvoiceNumber(invoiceKey);
  const actorId = input.actorId.trim() || 'staff';

  const run = () => prisma.$transaction(async (tx) => {
    const candidates = await loadCandidates(tx, supplierId, invoiceKey, compact);
    const exact = candidates.filter(
      (document) => documentMatchesKey(document, invoiceKey) && documentMatchesDate(document, dateKey)
    );

    if (input.action === 'adopt-legacy') {
      const legacyKey = input.legacyKey?.trim() ?? '';
      const parsed = parseLegacyInvoiceKey(legacyKey);
      const known = await tx.ledgerIdempotencyKey.findUnique({ where: { key: legacyKey } });
      if (!parsed || !known || !legacyKeyMatchesSupplier(legacyKey, supplier.name, input.invoiceNumber ?? invoiceKey)) {
        return fail(
          'LEGACY_RECEIPT_PRESENT',
          'That earlier receipt is not an exact vendor and invoice match for the selected supplier. It was not attached, and stock was not changed.'
        );
      }
      let document = exact[0];
      if (!document) {
        if (exact.length > 1) return fail('AMBIGUOUS_DOCUMENT', AMBIGUOUS_DOCUMENT_ERROR);
        document = await tx.supplierInvoiceDocument.create({
          data: {
            supplierId,
            invoiceKey,
            invoiceKeyCompact: compact,
            invoiceNumber: (input.invoiceNumber ?? invoiceKey).trim(),
            invoiceDate: (input.invoiceDate ?? dateKey).trim(),
            invoiceDateKey: dateKey,
            legacyKey,
            adoptedAt: new Date(),
            adoptedBy: actorId,
            lines: {
              create: (slots ?? []).map((slot, ordinal) => ({
                printedKey: slot.printedKey,
                occurrence: slot.occurrence,
                ordinal,
                heldByLegacy: true,
              })),
            },
          },
          include: { lines: true, dateLinks: true, keyAliases: true, lineAliases: true },
        });
      } else if (document.legacyKey && document.legacyKey !== legacyKey) {
        return fail(
          'LEGACY_RECEIPT_PRESENT',
          'This invoice is already attached to a different earlier receipt. Stock was not posted.'
        );
      } else if (!document.legacyKey) {
        await tx.supplierInvoiceDocument.update({
          where: { id: document.id },
          data: { legacyKey, adoptedAt: new Date(), adoptedBy: actorId },
        });
        await tx.supplierInvoiceLine.updateMany({
          where: { documentId: document.id },
          data: { heldByLegacy: true },
        });
        document = {
          ...document,
          legacyKey,
          lines: document.lines.map((line) => ({ ...line, heldByLegacy: true })),
        };
      }
      await recordEvent(tx, {
        documentId: document.id,
        supplierId,
        actorId,
        action: 'ADOPT_LEGACY',
        detail: { legacyKey, invoiceKey, dateKey },
      });
      return toLines({ ...document, legacyKey }, slots ?? []);
    }

    if (input.action === 'link-date' || input.action === 'separate-document') {
      const sameNumber = candidates.filter((document) => documentMatchesKey(document, invoiceKey));
      if (input.action === 'link-date') {
        if (sameNumber.length !== 1) return fail('AMBIGUOUS_DOCUMENT', AMBIGUOUS_DOCUMENT_ERROR, {
          storedDates: sameNumber.map((document) => document.invoiceDateKey ?? ''),
        });
        const document = sameNumber[0]!;
        if (!documentMatchesDate(document, dateKey)) {
          await tx.supplierInvoiceDateLink.create({
            data: { documentId: document.id, dateKey, actorId },
          });
          document.dateLinks.push({
            id: 'pending',
            documentId: document.id,
            dateKey,
            actorId,
            createdAt: new Date(),
          });
        }
        await recordEvent(tx, {
          documentId: document.id,
          supplierId,
          actorId,
          action: 'LINK_DATE',
          detail: { invoiceKey, dateKey, storedDate: document.invoiceDateKey },
        });
        return toLines(document, slots ?? []);
      }
      if (exact.length === 1) return toLines(exact[0]!, slots ?? []);
      const created = await tx.supplierInvoiceDocument.create({
        data: {
          supplierId,
          invoiceKey,
          invoiceKeyCompact: compact,
          invoiceNumber: (input.invoiceNumber ?? invoiceKey).trim(),
          invoiceDate: (input.invoiceDate ?? dateKey).trim(),
          invoiceDateKey: dateKey,
          lines: {
            create: (slots ?? []).map((slot, ordinal) => ({
              printedKey: slot.printedKey,
              occurrence: slot.occurrence,
              ordinal,
            })),
          },
        },
        include: { lines: true, dateLinks: true, keyAliases: true, lineAliases: true },
      });
      await recordEvent(tx, {
        documentId: created.id,
        supplierId,
        actorId,
        action: 'SEPARATE_DOCUMENT',
        detail: { invoiceKey, dateKey },
      });
      return {
        ok: true as const,
        created: true,
        invoiceKey,
        documentId: created.id,
        lines: created.lines.map((line) => ({
          deliveryId: line.id,
          printedKey: line.printedKey,
          occurrence: line.occurrence,
          ordinal: line.ordinal,
        })),
      };
    }

    if (input.action === 'link-spelling' || input.action === 'separate-spelling') {
      const siblings = candidates.filter(
        (document) => document.invoiceKeyCompact === compact && !documentMatchesKey(document, invoiceKey)
      );
      if (input.action === 'link-spelling') {
        if (siblings.length !== 1) return fail('AMBIGUOUS_DOCUMENT', AMBIGUOUS_DOCUMENT_ERROR, {
          siblingKeys: siblings.map((document) => document.invoiceKey),
        });
        const document = siblings[0]!;
        if (!document.keyAliases.some((alias) => alias.invoiceKey === invoiceKey)) {
          await tx.supplierInvoiceKeyAlias.create({
            data: { documentId: document.id, invoiceKey, actorId },
          });
          document.keyAliases.push({
            id: 'pending',
            documentId: document.id,
            invoiceKey,
            actorId,
            createdAt: new Date(),
          });
        }
        await recordEvent(tx, {
          documentId: document.id,
          supplierId,
          actorId,
          action: 'LINK_SPELLING',
          detail: { invoiceKey, storedKey: document.invoiceKey, dateKey, storedDate: document.invoiceDateKey },
        });
        if (!documentMatchesDate(document, dateKey)) {
          return fail('DATE_CONFLICT', DATE_CONFLICT_ERROR, {
            storedDates: [document.invoiceDateKey ?? ''],
          });
        }
        return toLines(document, slots ?? []);
      }
      const created = await tx.supplierInvoiceDocument.create({
        data: {
          supplierId,
          invoiceKey,
          invoiceKeyCompact: compact,
          invoiceNumber: (input.invoiceNumber ?? invoiceKey).trim(),
          invoiceDate: (input.invoiceDate ?? dateKey).trim(),
          invoiceDateKey: dateKey,
          lines: {
            create: (slots ?? []).map((slot, ordinal) => ({
              printedKey: slot.printedKey,
              occurrence: slot.occurrence,
              ordinal,
            })),
          },
        },
        include: { lines: true, dateLinks: true, keyAliases: true, lineAliases: true },
      });
      await recordEvent(tx, {
        documentId: created.id,
        supplierId,
        actorId,
        action: 'SEPARATE_SPELLING',
        detail: { invoiceKey, dateKey, siblingKeys: siblings.map((document) => document.invoiceKey) },
      });
      return {
        ok: true as const,
        created: true,
        invoiceKey,
        documentId: created.id,
        lines: created.lines.map((line) => ({
          deliveryId: line.id,
          printedKey: line.printedKey,
          occurrence: line.occurrence,
          ordinal: line.ordinal,
        })),
      };
    }

    if (exact.length !== 1) {
      return exact.length === 0
        ? fail('DATE_CONFLICT', DATE_CONFLICT_ERROR)
        : fail('AMBIGUOUS_DOCUMENT', AMBIGUOUS_DOCUMENT_ERROR);
    }
    const document = exact[0]!;

    if (input.action === 'map-line') {
      const printedKey = canonicalPrintedLine(input.mappedPrintedName);
      const fromLineId = input.fromLineId?.trim() ?? '';
      const line = document.lines.find((item) => item.id === fromLineId);
      if (!printedKey || !line) {
        return fail('RENAME_AMBIGUOUS', RENAME_AMBIGUOUS_ERROR);
      }
      const taken = document.lines.some(
        (item) => item.id !== line.id && item.printedKey === printedKey && item.occurrence === line.occurrence
      );
      const aliasTaken = document.lineAliases.some(
        (alias) => alias.printedKey === printedKey && alias.occurrence === line.occurrence && alias.lineId !== line.id
      );
      if (taken || aliasTaken) return fail('RENAME_AMBIGUOUS', RENAME_AMBIGUOUS_ERROR);
      const aliasOccurrence = (slots ?? []).find((slot) => slot.printedKey === printedKey)?.occurrence ?? 0;
      if (line.printedKey !== printedKey || line.occurrence !== aliasOccurrence) {
        await tx.supplierInvoiceLineAlias.create({
          data: {
            documentId: document.id,
            lineId: line.id,
            printedKey,
            occurrence: aliasOccurrence,
            actorId,
          },
        });
        document.lineAliases.push({
          id: 'pending',
          documentId: document.id,
          lineId: line.id,
          printedKey,
          occurrence: aliasOccurrence,
          actorId,
          createdAt: new Date(),
        });
      }
      await recordEvent(tx, {
        documentId: document.id,
        supplierId,
        actorId,
        action: 'MAP_LINE',
        detail: { fromLineId: line.id, printedKey },
      });
      return toLines(document, slots ?? []);
    }

    const aligned = toLines(document, slots ?? []);
    if (aligned.ok || aligned.code !== 'LINES_NEED_CONFIRMATION') return aligned;
    const needed = aligned.details?.newPrintedNames ?? [];
    const confirmed = (input.confirmNewPrintedNames ?? [])
      .map((name) => canonicalPrintedLine(name))
      .filter((name): name is string => Boolean(name));
    const sameList =
      needed.length > 0 &&
      needed.length === confirmed.length &&
      needed.every((name, index) => name === confirmed[index]);
    if (!sameList) return aligned;
    const occurrence = new Map<string, number>();
    for (const line of document.lines) {
      occurrence.set(line.printedKey, Math.max(occurrence.get(line.printedKey) ?? 0, line.occurrence + 1));
    }
    for (const alias of document.lineAliases) {
      occurrence.set(alias.printedKey, Math.max(occurrence.get(alias.printedKey) ?? 0, alias.occurrence + 1));
    }
    const startOrdinal = document.lines.reduce((max, line) => Math.max(max, line.ordinal), -1) + 1;
    const createdLines = [];
    for (const [index, printedKey] of needed.entries()) {
      const nextOccurrence = occurrence.get(printedKey) ?? 0;
      occurrence.set(printedKey, nextOccurrence + 1);
      createdLines.push(
        await tx.supplierInvoiceLine.create({
          data: {
            documentId: document.id,
            printedKey,
            occurrence: nextOccurrence,
            ordinal: startOrdinal + index,
          },
        })
      );
    }
    await recordEvent(tx, {
      documentId: document.id,
      supplierId,
      actorId,
      action: 'ADD_LINES',
      detail: { printedKeys: needed },
    });
    document.lines.push(...createdLines);
    return toLines(document, slots ?? []);
  });

  try {
    return await run();
  } catch (error) {
    const unique =
      typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
    if (!unique) throw error;
    try {
      return await run();
    } catch (retryError) {
      const retryUnique =
        typeof retryError === 'object' &&
        retryError !== null &&
        'code' in retryError &&
        (retryError as { code?: string }).code === 'P2002';
      if (!retryUnique) throw retryError;
      return fail(
        'AMBIGUOUS_DOCUMENT',
        'That confirmation raced another save. Nothing else was posted. Submit the same confirmation again.'
      );
    }
  }
}

export interface NumberedInvoicePostLine {
  printedName: string;
  productId?: string | null;
  quantity: number;
  unitCost: number;
  quantityKind?: 'units' | 'cases';
  casePackSize?: number | null;
  department?: string | null;
  departmentAssumed?: boolean;
  category?: string | null;
  screenDepartment?: string | null;
}

export async function invoiceLinePostInput(
  line: NumberedInvoicePostLine,
  deliveryId: string,
  supplierId: string
): Promise<ReceivingLogPostInput> {
  let pack = 1;
  if (line.quantityKind === 'cases') {
    const product = line.productId
      ? await prisma.product.findUnique({
          where: { id: line.productId },
          select: { receivePackSize: true, splitFactor: true, casePackSize: true },
        })
      : null;
    pack = product
      ? normalizeProductPackFields(product).casePackSize
      : line.casePackSize && line.casePackSize > 0
        ? line.casePackSize
        : 1;
  }
  return {
    itemName: line.printedName.trim(),
    productId: line.productId?.trim() || undefined,
    casesReceived: line.quantity,
    caseCost: line.unitCost,
    packSize: pack,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 0,
    externalLogId: deliveryId,
    supplierId,
    ...(line.department ? { department: line.department } : {}),
    ...(line.departmentAssumed ? { departmentAssumed: true } : {}),
    ...(line.category ? { category: line.category } : {}),
    ...(line.screenDepartment ? { screenDepartment: line.screenDepartment } : {}),
  };
}

/** Posts every resolved line in one transaction. A conflict rolls the whole post back. */
export async function postResolvedSupplierInvoice(input: {
  staffId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate?: string | null;
  lines: NumberedInvoicePostLine[];
}): Promise<
  | { ok: false; code: SupplierInvoiceFailure; error: string; details?: InvoiceIdentityDetails; committed?: false; results?: ReceivingLogPostResult[] }
  | { ok: true; invoiceKey: string; documentId: string; results: ReceivingLogPostResult[] }
> {
  const resolved = await resolveSupplierInvoice({
    supplierId: input.supplierId,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    lines: input.lines.map((line) => ({ printedName: line.printedName })),
  });
  if (!resolved.ok) return { ...resolved, committed: false };
  const posts: ReceivingLogPostInput[] = [];
  for (const [index, line] of input.lines.entries()) {
    const identity = resolved.lines[index];
    if (!identity) {
      return { ok: false, code: 'LINE_MISMATCH', error: RENAME_AMBIGUOUS_ERROR, committed: false };
    }
    posts.push(await invoiceLinePostInput(line, identity.deliveryId, input.supplierId));
  }
  const supplierName = await getSupplierNameById(input.supplierId);
  await assertReceivingDepartmentsChosen(posts, supplierName);
  try {
    const results = await prisma.$transaction(async (tx) => {
      const rows: ReceivingLogPostResult[] = [];
      for (const post of posts) {
        const row = await postReceivingLogToInventory(post, input.staffId, supplierName, tx, true);
        if (!row.stock.posted) {
          const error = new Error(row.stock.posted === false ? row.stock.reason : 'Stock was not updated.');
          (error as Error & { rows?: ReceivingLogPostResult[] }).rows = rows.concat(row);
          throw error;
        }
        rows.push(row);
      }
      return rows;
    });
    return { ok: true, invoiceKey: resolved.invoiceKey, documentId: resolved.documentId, results };
  } catch (error) {
    const rows = (error as { rows?: ReceivingLogPostResult[] }).rows;
    if (!rows) throw error;
    return {
      ok: false,
      code: 'DELIVERY_CONFLICT',
      error: error instanceof Error ? error.message : 'This invoice commit was rolled back.',
      committed: false,
      results: rows.map((row, index) =>
        index === rows.length - 1
          ? row
          : {
              ...row,
              stock: {
                posted: false,
                conflict: false,
                reason: 'Rolled back because a later line conflicted. Stock was not added for this line.',
              },
            }
      ),
    };
  }
}
