/**
 * Browser-safe invoice delivery ids. No Node builtins: the receive screen
 * builds these ids while stashing a scan.
 */

export const RECEIVING_INVOICE_NAMESPACE = 'f5e51000-4e17-4111-8111-0000c0de0001';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDeliveryUuid(value: string): boolean {
  const id = value.trim();
  if (id === '00000000-0000-0000-0000-000000000000') return false;
  return UUID_RE.test(id);
}

export function normalizeDeliveryUuid(value: string): string | null {
  const id = value.trim().toLowerCase();
  return isDeliveryUuid(id) ? id : null;
}

/**
 * Invoice numbers keep punctuation and meaningful spaces. `1001/A` and `1001-A`
 * are different documents. `A 12` and `A12` are different documents. Only the
 * ends are trimmed, repeated spaces collapse to one space, and letters are
 * casefolded. The date is a separate exact key and is not folded into this string.
 */
export function canonicalInvoiceNumber(invoiceNumber: string | null | undefined): string | null {
  const collapsed = (invoiceNumber ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!collapsed || collapsed === 'unread' || collapsed === 'unknown' || collapsed === 'n/a' || collapsed === 'na') {
    return null;
  }
  return collapsed;
}

/** Comparison fingerprint only. Never use this as the stored invoice identity. */
export function compactInvoiceNumber(invoiceNumber: string): string {
  return invoiceNumber.replace(/\s+/g, '');
}

/**
 * Exact date text. No day window and no format guessing. A missing or unread
 * date is not a match for a stored date.
 */
export function canonicalInvoiceDate(invoiceDate: string | null | undefined): string | null {
  const text = (invoiceDate ?? '').trim().toLowerCase();
  if (!text || text === 'unread' || text === 'unknown' || text === 'n/a' || text === 'na') return null;
  return text;
}

/** @deprecated Use canonicalInvoiceNumber. Punctuation is preserved. */
export function normalizeInvoiceIdentity(invoiceNumber: string | null | undefined): string | null {
  return canonicalInvoiceNumber(invoiceNumber);
}

/** Printed invoice line text. Not a catalog match and not a commercial hash. */
export function canonicalPrintedLine(name: string | null | undefined): string | null {
  const value = (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return value || null;
}

export const SUPPLIER_REQUIRED_ERROR =
  'Select a saved supplier before this invoice can be received. The vendor name printed on the scan is not a supplier id.';

export const INVOICE_NUMBER_REUSE_POLICY =
  'The same saved supplier, invoice number, and exact invoice date replay. A different date, a missing date, or a number that differs by spaces is a conflict until someone confirms it. Confirming a different dated delivery creates a separate document. Nothing is replayed or posted before that confirmation.';

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function sha1(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(message);
  data[message.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotl(
        words[index - 3]! ^ words[index - 8]! ^ words[index - 14]! ^ words[index - 16]!,
        1
      );
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f = 0;
      let k = 0;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const next = (rotl(a, 5) + (f >>> 0) + e + k + words[index]!) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = next;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  return out;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(left.length + right.length);
  out.set(left);
  out.set(right, left.length);
  return out;
}

/** RFC 4122 UUID v5 from a namespace and a durable name. */
export function uuidV5(name: string, namespace = RECEIVING_INVOICE_NAMESPACE): string {
  const nameBytes = new TextEncoder().encode(name);
  const digest = sha1(concatBytes(uuidToBytes(namespace), nameBytes));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
