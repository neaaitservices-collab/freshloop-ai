import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

test('cleanup script refuses without the flag before it opens a database', () => {
  const env = { ...process.env };
  delete env.FRESHLOOP_ALLOW_DEMO_FUSION_CLEANUP;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', path.join('scripts', 'cleanup-legacy-demo-fusion.ts')],
    {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
    }
  );
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert.equal(result.status, 1, output);
  assert.match(output, /Refusing to run/);
  assert.equal(output.includes('server-only'), false);
});
