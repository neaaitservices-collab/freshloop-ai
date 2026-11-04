import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { invoiceOcrErrorResponse } from '@/lib/domains/receiving/invoiceOcrErrors';

describe('invoiceOcrErrorResponse', () => {
  it('maps missing Gemini key to 503', async () => {
    const res = invoiceOcrErrorResponse(new Error('GEMINI_API_KEY missing or empty'));
    assert.ok(res);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /GEMINI_API_KEY/i);
  });

  it('passes through structured JSON parse failures as 422', async () => {
    const res = invoiceOcrErrorResponse(
      new Error(
        'The invoice text could not be parsed as structured JSON. Try a clearer photo of the line-item table.'
      )
    );
    assert.ok(res);
    assert.equal(res.status, 422);
  });

  it('returns null for unknown errors', () => {
    assert.equal(invoiceOcrErrorResponse(new Error('database exploded')), null);
  });
});
