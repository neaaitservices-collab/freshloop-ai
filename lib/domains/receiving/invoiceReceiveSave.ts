import { identifiedLineCanPost } from '@/lib/domains/receiving/receivingBridge';
import {
  normalizeDeliveryUuid,
  SUPPLIER_REQUIRED_ERROR,
} from '@/lib/domains/receiving/invoiceDeliveryId';

export const IDENTIFYING_INVOICE_LINES = 'Identifying these invoice lines for the saved supplier.';

export const QUANTITY_UNREAD_ERROR = 'Quantity was not read, so this line was not posted.';

export const ALREADY_RECORDED_LINE =
  'This delivery is already recorded. It is shown for reference and was not posted again.';

export type InvoiceIdentityPhase = 'idle' | 'loading' | 'ready' | 'held' | 'failed';

export interface AssignedDeliveryId {
  deliveryId?: string;
  ordinal?: number;
}

export interface PrintedSlotMatchLine {
  id: string;
  printedKey: string;
  occurrence: number;
  heldByLegacy?: boolean;
  aliases: readonly { printedKey: string; occurrence: number }[];
}

export interface MatchedPrintedLine {
  deliveryId: string;
  printedKey: string;
  occurrence: number;
  ordinal: number;
  alreadyReceived?: boolean;
}

/**
 * Pair scanned printed lines with saved invoice lines.
 * A line that matches keeps its delivery id even when another line on the same invoice does not.
 */
export function matchPrintedSlots(
  stored: readonly PrintedSlotMatchLine[],
  slots: readonly { printedKey: string; occurrence: number }[]
): {
  matched: MatchedPrintedLine[];
  unmatchedScan: string[];
  unused: { id: string; printedKey: string }[];
} {
  const unused = stored.map((line) => ({ line, aliases: line.aliases }));
  const matched: MatchedPrintedLine[] = [];
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
    matched.push({
      deliveryId: chosen.line.id,
      printedKey: slot.printedKey,
      occurrence: slot.occurrence,
      ordinal,
      alreadyReceived: chosen.line.heldByLegacy,
    });
  }
  return {
    matched,
    unmatchedScan,
    unused: unused.map((entry) => ({ id: entry.line.id, printedKey: entry.line.printedKey })),
  };
}

/** Copy server delivery ids onto the open invoice lines. Missing ordinals stay unassigned. */
export function applyServerDeliveryIds<
  T extends {
    id: string;
    invoiceNumber?: string | null;
    printedName?: string | null;
    casesReceived?: number;
    canPost?: boolean;
  },
>(logs: readonly T[], assigned: readonly AssignedDeliveryId[] | null | undefined): T[] {
  const byOrdinal = new Map<number, string>();
  (assigned ?? []).forEach((line, index) => {
    const deliveryId = line.deliveryId ? normalizeDeliveryUuid(line.deliveryId) : null;
    if (!deliveryId) return;
    const ordinal = Number.isInteger(line.ordinal) ? (line.ordinal as number) : index;
    byOrdinal.set(ordinal, deliveryId);
  });
  let ordinal = 0;
  return logs.map((log) => {
    if (!log.invoiceNumber || !log.printedName) return { ...log };
    const deliveryId = byOrdinal.get(ordinal);
    ordinal += 1;
    if (!deliveryId) return { ...log, canPost: false };
    return {
      ...log,
      id: deliveryId,
      canPost: identifiedLineCanPost(log.casesReceived),
    };
  });
}

export function lineHasServerDeliveryId(line: { id: string; canPost?: boolean }): boolean {
  return line.canPost !== false && Boolean(normalizeDeliveryUuid(line.id));
}

/** An open invoice line still waiting for the identity request to name its delivery. */
export function lineLacksServerDeliveryId(line: { id: string; invoiceNumber?: string | null }): boolean {
  return Boolean(line.invoiceNumber?.trim()) && !normalizeDeliveryUuid(line.id);
}

export interface ReceiveLineSaveGate {
  canSave: boolean;
  promptSupplier: boolean;
  showSupplierPicker: boolean;
  message: string | null;
}

/**
 * Why Save is blocked for one receive line.
 * A supplier is required only when the invoice line has no saved supplier yet.
 * After that, the line waits for a server delivery id, or shows the identity hold.
 */
export function receiveLineSaveGate(input: {
  invoiceNumber?: string | null;
  supplierId?: string | null;
  lineId: string;
  canPost?: boolean;
  identityPhase: InvoiceIdentityPhase;
  identityMessage?: string | null;
}): ReceiveLineSaveGate {
  const supplierId = input.supplierId?.trim() ?? '';
  const invoiceNumber = input.invoiceNumber?.trim() ?? '';
  const hasId = Boolean(normalizeDeliveryUuid(input.lineId));
  const postable = input.canPost !== false && hasId;

  if (!invoiceNumber) {
    if (postable) {
      return { canSave: true, promptSupplier: false, showSupplierPicker: false, message: null };
    }
    return {
      canSave: false,
      promptSupplier: false,
      showSupplierPicker: false,
      message: ALREADY_RECORDED_LINE,
    };
  }

  if (!supplierId) {
    return {
      canSave: false,
      promptSupplier: true,
      showSupplierPicker: true,
      message: SUPPLIER_REQUIRED_ERROR,
    };
  }

  if (postable) {
    return { canSave: true, promptSupplier: false, showSupplierPicker: false, message: null };
  }

  if (input.identityPhase === 'held' || input.identityPhase === 'failed') {
    return {
      canSave: false,
      promptSupplier: false,
      showSupplierPicker: true,
      message: input.identityMessage?.trim() || 'This invoice line does not have a server delivery id yet.',
    };
  }

  if (hasId && input.canPost === false) {
    return {
      canSave: false,
      promptSupplier: false,
      showSupplierPicker: false,
      message: QUANTITY_UNREAD_ERROR,
    };
  }

  if (input.identityPhase === 'loading' || input.identityPhase === 'idle') {
    return {
      canSave: false,
      promptSupplier: false,
      showSupplierPicker: true,
      message: IDENTIFYING_INVOICE_LINES,
    };
  }

  return {
    canSave: false,
    promptSupplier: false,
    showSupplierPicker: true,
    message: input.identityMessage?.trim() || 'This invoice line does not have a server delivery id yet.',
  };
}

export function unidentifiedInvoiceSaveMessage(input: {
  supplierId?: string | null;
  identityPhase: InvoiceIdentityPhase;
  identityMessage?: string | null;
  unidentifiedCount: number;
}): string {
  if (!input.supplierId?.trim()) return SUPPLIER_REQUIRED_ERROR;
  if (input.identityPhase === 'loading' || input.identityPhase === 'idle') return IDENTIFYING_INVOICE_LINES;
  const held = input.identityMessage?.trim();
  if (held) return held;
  return input.unidentifiedCount === 1
    ? 'This invoice line does not have a server delivery id yet.'
    : 'None of these invoice lines have a server delivery id yet.';
}
