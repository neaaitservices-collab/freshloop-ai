import { singleSupplierEmail } from '@/components/features/orders/supplierMail';

export function purchaseOrderFromAddress(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const wrapped = value.match(/^.*<([^<>]+)>\s*$/);
  return singleSupplierEmail((wrapped?.[1] ?? value).trim());
}

/** Staff display name plus the verified From address. Special characters are quoted. */
export function formatPurchaseOrderFrom(staffName: string, fromAddress: string): string {
  const name = staffName.replace(/[\r\n\0]+/g, ' ').trim();
  if (!name) return fromAddress;
  if (/^[\p{L}\p{M}\p{N} .'-]+$/u.test(name)) {
    return `${name} <${fromAddress}>`;
  }
  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}" <${fromAddress}>`;
}

/** Staff email, then PO_REPLY_TO. Null means send with no Reply-To. */
export function purchaseOrderReplyTo(staffEmail: string, fallback: string | undefined): string | null {
  const staff = singleSupplierEmail(staffEmail);
  if (staff) return staff;
  return singleSupplierEmail(fallback ?? '');
}

export function purchaseOrderEmailConfig():
  | { ok: true; fromAddress: string; apiKey: string }
  | { ok: false; error: string } {
  const rawFrom = process.env.PO_FROM_EMAIL?.trim() ?? '';
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? '';
  const missing = [rawFrom ? null : 'PO_FROM_EMAIL', apiKey ? null : 'RESEND_API_KEY'].filter(
    (name): name is string => Boolean(name)
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Purchase order email is not configured. Set ${missing.join(', ')}.`,
    };
  }
  const fromAddress = purchaseOrderFromAddress(rawFrom);
  if (!fromAddress) {
    return { ok: false, error: 'PO_FROM_EMAIL must be one email address.' };
  }
  return { ok: true, fromAddress, apiKey };
}

export async function sendPurchaseOrderViaResend(
  input: {
    apiKey: string;
    from: string;
    replyTo: string | null;
    to: string;
    subject: string;
    body: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<{ id: string }> {
  const payload: {
    from: string;
    to: string[];
    reply_to?: string;
    subject: string;
    text: string;
  } = {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    text: input.body,
  };
  if (input.replyTo) payload.reply_to = input.replyTo;

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Email provider error: ${raw.slice(0, 200)}`);
  }
  let id = '';
  try {
    const parsed = JSON.parse(raw) as { id?: unknown };
    if (typeof parsed.id === 'string') id = parsed.id.trim();
  } catch {
    id = '';
  }
  if (!id) throw new Error('Email provider did not return an id.');
  return { id };
}
