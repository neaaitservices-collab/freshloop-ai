import assert from 'node:assert/strict';
import test from 'node:test';
import { createPeriodLoader } from '@/lib/domains/stats/adminPeriodClient';

const FIGURES = {
  rescuedValue: 1,
  lostValue: 3,
  scrapDollars: 1.5,
  scrapBuckets: 1,
  sales: 20,
};

function jsonResponse(period: object, status = 200) {
  return new Response(JSON.stringify({ success: true, period }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('period fetch asks only for period figures and ignores a stale response', async () => {
  const urls: string[] = [];
  let releaseDay: () => void = () => {};
  const dayGate = new Promise<void>((resolve) => {
    releaseDay = resolve;
  });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    assert.equal(url.includes('scope=period'), true);
    assert.equal(url.includes('inventory'), false);
    if (url.includes('preset=day')) {
      await dayGate;
      if (init?.signal?.aborted) {
        const aborted = new Error('aborted');
        aborted.name = 'AbortError';
        throw aborted;
      }
    }
    const rescuedValue = url.includes('preset=week') ? 7 : 1;
    return jsonResponse({ ...FIGURES, rescuedValue });
  };

  const loader = createPeriodLoader(fetchImpl);
  const first = loader.load('day');
  const second = loader.load('week');
  releaseDay();
  const [stale, current] = await Promise.all([first, second]);

  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.aborted, true);
  assert.equal(current.ok, true);
  if (current.ok) {
    assert.equal(current.preset, 'week');
    assert.equal(current.figures.rescuedValue, 7);
    assert.equal('inventoryValue' in current.figures, false);
  }

  const cached = await loader.load('week');
  assert.equal(cached.ok, true);
  if (cached.ok) assert.equal(cached.figures.rescuedValue, 7);
  assert.equal(urls.length, 2);
});

test('prefetch does not cancel the period request already in flight', async () => {
  let releaseDay: () => void = () => {};
  const dayGate = new Promise<void>((resolve) => {
    releaseDay = resolve;
  });
  let dayAborted = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('preset=day')) {
      init?.signal?.addEventListener('abort', () => {
        dayAborted = true;
      });
      await dayGate;
    }
    return jsonResponse({ ...FIGURES, rescuedValue: 4 });
  };

  const loader = createPeriodLoader(fetchImpl);
  const pending = loader.load('day');
  await loader.prefetch('month');
  assert.equal(dayAborted, false);
  releaseDay();
  const result = await pending;
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.figures.rescuedValue, 4);
  assert.equal(loader.peek('month')?.rescuedValue, 4);
});

test('a period payload that includes inventory value is ignored', async () => {
  const fetchImpl: typeof fetch = async () =>
    jsonResponse({
      ...FIGURES,
      inventoryValue: 99,
    });
  const result = await createPeriodLoader(fetchImpl).load('month');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.aborted, false);
});
