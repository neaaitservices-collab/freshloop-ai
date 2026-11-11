export function purchaseOrderEmailConfig():
  | { ok: true; from: string; replyTo: string; apiKey: string }
  | { ok: false; error: string } {
  const from = process.env.PO_FROM_EMAIL?.trim() ?? '';
  const replyTo = process.env.PO_REPLY_TO?.trim() ?? '';
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? '';
  const missing = [
    from ? null : 'PO_FROM_EMAIL',
    replyTo ? null : 'PO_REPLY_TO',
    apiKey ? null : 'RESEND_API_KEY',
  ].filter((name): name is string => Boolean(name));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Purchase order email is not configured. Set ${missing.join(', ')}.`,
    };
  }
  return { ok: true, from, replyTo, apiKey };
}

export async function sendPurchaseOrderViaResend(
  input: {
    apiKey: string;
    from: string;
    replyTo: string;
    to: string;
    subject: string;
    body: string;
  },
  fetchImpl: typeof fetch = fetch
): Promise<{ id: string }> {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      reply_to: input.replyTo,
      subject: input.subject,
      text: input.body,
    }),
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
