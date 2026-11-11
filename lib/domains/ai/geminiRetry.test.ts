import assert from 'node:assert/strict';
import test from 'node:test';
import { generateContentWithFallback, geminiBackoffMs, shouldUseSdkAfterRest } from '@/lib/domains/ai/gemini';
import { invoiceOcrThinkingConfig } from '@/lib/domains/ai/geminiModels';

test('a 429 triggers exactly one retry and does not use the SDK', async () => {
  assert.equal(shouldUseSdkAfterRest(true), false);
  assert.equal(shouldUseSdkAfterRest(false), true);
  assert.ok(geminiBackoffMs('2') >= 2000);

  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{"error":{"code":429}}', {
      status: 429,
      headers: { 'Retry-After': '0' },
    });
  };
  try {
    await assert.rejects(
      () =>
        generateContentWithFallback(
          'read this invoice',
          { data: 'abc', mimeType: 'image/jpeg' },
          ['gemini-3.8-flash'],
          {
            skipModelDiscovery: true,
            maxModelsToTry: 1,
            preferRestApi: true,
            attemptTimeoutMs: 5000,
            deadlineAtMs: Date.now() + 5000,
          }
        ),
      /429/
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('invoice OCR thinking is the lowest level the flash model accepts', () => {
  assert.deepEqual(invoiceOcrThinkingConfig('gemini-3.8-flash'), {
    thinkingLevel: 'LOW',
    includeThoughts: false,
  });
  assert.deepEqual(invoiceOcrThinkingConfig('gemini-2.5-flash'), {
    thinkingBudget: 0,
    includeThoughts: false,
  });
  assert.deepEqual(invoiceOcrThinkingConfig('gemini-1.5-flash'), {
    thinkingBudget: 0,
    includeThoughts: false,
  });
});
