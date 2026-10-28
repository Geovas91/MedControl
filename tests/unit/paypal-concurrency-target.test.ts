import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const args of [[], ['--container', 'supabase_db_CliniControl'], ['--container', 'supabase_db_RestoPilot']]) {
  test(`concurrency harness rejects an unspecified or non-disposable target: ${args.join(' ')}`, () => {
    const result = spawnSync(process.execPath, ['scripts/test-paypal-creation-concurrency.mjs', ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Explicit disposable V1-02 container required/);
  });
}
