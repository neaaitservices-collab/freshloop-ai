import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadReceivingLogs,
  SAMPLE_RECEIVING_LOGS,
  unavailableReceivingLogs,
  unconfiguredReceivingLogs,
} from '@/lib/domains/receiving/receivingSheet';

function withoutSheetEnv<T>(run: () => Promise<T>): Promise<T> {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const key = process.env.GOOGLE_SHEETS_API_KEY;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  delete process.env.GOOGLE_SHEETS_API_KEY;
  return run().finally(() => {
    if (id === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = id;
    if (key === undefined) delete process.env.GOOGLE_SHEETS_API_KEY;
    else process.env.GOOGLE_SHEETS_API_KEY = key;
  });
}

test('missing sheet config returns no sample rows', async () => {
  const result = await withoutSheetEnv(() => loadReceivingLogs());
  assert.equal(result.source, 'unconfigured');
  assert.deepEqual(result.logs, []);
  assert.match(result.warning ?? '', /cannot be saved/i);
  assert.ok(SAMPLE_RECEIVING_LOGS.length > 0);
  assert.deepEqual(unconfiguredReceivingLogs().logs, []);
});

test('failed sheet reads do not substitute sample rows', async () => {
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'sheet-test';
  process.env.GOOGLE_SHEETS_API_KEY = 'key-test';
  try {
    const httpFailure = await loadReceivingLogs({
      fetch: async () =>
        new Response('denied', { status: 403 }),
    });
    assert.equal(httpFailure.source, 'unavailable');
    assert.deepEqual(httpFailure.logs, []);
    assert.match(httpFailure.warning ?? '', /403/);

    const networkFailure = await loadReceivingLogs({
      fetch: async () => {
        throw new Error('network down');
      },
    });
    assert.equal(networkFailure.source, 'unavailable');
    assert.deepEqual(networkFailure.logs, []);
    assert.match(networkFailure.warning ?? '', /network down/);
  } finally {
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    delete process.env.GOOGLE_SHEETS_API_KEY;
  }

  const built = unavailableReceivingLogs('timeout');
  assert.equal(built.source, 'unavailable');
  assert.deepEqual(built.logs, []);
});
