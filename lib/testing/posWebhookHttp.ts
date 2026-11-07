import { NextRequest } from 'next/server';

export const POS_WEBHOOK_TEST_SECRET = 'integration-pos-webhook-secret';

export type PosWebhookHttpOptions = {
  secret?: string;
  omitAuth?: boolean;
  clientIp?: string;
};

export function posWebhookJsonRequest(
  body: unknown,
  options: PosWebhookHttpOptions = {}
): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (!options.omitAuth) {
    headers.authorization = `Bearer ${options.secret ?? POS_WEBHOOK_TEST_SECRET}`;
  }
  if (options.clientIp) {
    headers['x-forwarded-for'] = options.clientIp;
  }
  return new NextRequest('http://localhost:3000/api/pos/webhook', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export async function readJsonResponse(res: Response): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body: json };
}
