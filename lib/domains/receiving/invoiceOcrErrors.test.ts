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

  it('rejects an encrypted PDF with 400', async () => {
    const res = invoiceOcrErrorResponse(new Error('This PDF is encrypted. Send an unlocked copy.'));
    assert.ok(res);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /encrypted/);
  });

  it('rejects a PDF with no ending marker with 400', async () => {
    const res = invoiceOcrErrorResponse(
      new Error('This PDF is incomplete. The file has no ending marker.')
    );
    assert.ok(res);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /ending marker/);
  });

  it('maps an invalid API key that also says INVALID_ARGUMENT to the key message', async () => {
    const res = invoiceOcrErrorResponse(
      new Error(
        'gemini-3.8-flash: key 400 {"error":{"status":"INVALID_ARGUMENT","message":"API key not valid. Please pass a valid API key.","reason":"API_KEY_INVALID"}}'
      )
    );
    assert.ok(res);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.match(body.error, /GEMINI_API_KEY/);
    assert.match(body.error, /rejected/);
    assert.doesNotMatch(body.error, /Couldn't read this file/);
  });

  it('maps a model INVALID_ARGUMENT to 422', async () => {
    const res = invoiceOcrErrorResponse(
      new Error('gemini-3.8-flash: key 400 {"error":{"status":"INVALID_ARGUMENT"}}')
    );
    assert.ok(res);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.match(body.error, /Couldn't read this file/);
  });

  it('maps an invoice with no stock lines to 422', async () => {
    const res = invoiceOcrErrorResponse(new Error('No stock lines on this invoice'));
    assert.ok(res);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.match(body.error, /No stock lines/);
  });

  it('names a PDF that is too large', async () => {
    const res = invoiceOcrErrorResponse(new Error('This PDF is too large. Send a smaller file.'));
    assert.ok(res);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /too large/);
  });

  it('returns null for unknown errors', () => {
    assert.equal(invoiceOcrErrorResponse(new Error('database exploded')), null);
  });

  it('keeps a scan timeout worded as a timeout', async () => {
    const res = invoiceOcrErrorResponse(
      new Error(
        'The invoice reader timed out before a result came back. Try a closer photo of the line items.'
      )
    );
    assert.ok(res);
    assert.equal(res.status, 504);
    const body = await res.json();
    assert.match(body.error, /timed out/i);
    assert.doesNotMatch(body.error, /supplier/i);
  });
});
