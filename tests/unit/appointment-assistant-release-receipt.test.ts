import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { artifactFingerprint, safeReceipt, verifyReceipt, type ReleaseReceipt } from '../../scripts/qa/assistant-release.ts';

// Junctions exercise the same isSymbolicLink rejection on Windows without
// requiring developer-mode file-symlink privileges; Linux uses npm-style files.
function fixtureLink(root: string, relative: string) {
  const target = path.join(root, 'target');
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, 'runtime.js'), 'synthetic');
  const link = path.join(root, relative);
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(process.platform === 'win32' ? target : path.join(target, 'runtime.js'), link, process.platform === 'win32' ? 'junction' : 'file');
}

test('release excludes top-level and nested npm .bin symlinks deterministically while hashing runtime dependencies', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-release-shims-'));
  try {
    mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    writeFileSync(path.join(dir, 'node_modules', 'runtime.js'), 'covered');
    const baseline = artifactFingerprint(dir, false, ['node_modules']);
    for (const relative of [
      'node_modules/.bin/top',
      'node_modules/eslint-config-next/node_modules/.bin/semver',
      'node_modules/postcss-import/node_modules/.bin/resolve',
      'node_modules/tsconfig-paths/node_modules/.bin/json5',
      'node_modules/node-exports-info/node_modules/.bin/semver',
      'node_modules/tailwindcss/node_modules/.bin/resolve',
      'node_modules/@babel/core/node_modules/.bin/semver',
      'node_modules/@babel/helper-compilation-targets/node_modules/.bin/semver'
    ]) fixtureLink(dir, relative);
    assert.deepEqual(artifactFingerprint(dir, false, ['node_modules']), baseline);
    assert.deepEqual(artifactFingerprint(dir, false, ['node_modules']), baseline);
    writeFileSync(path.join(dir, 'node_modules', 'runtime.js'), 'changed-runtime');
    assert.notEqual(artifactFingerprint(dir, false, ['node_modules']).artifact, baseline.artifact);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('release rejects symlinks outside npm shim boundaries, including runtime dependencies and application artifacts', () => {
  for (const relative of [
    'node_modules/pkg/runtime.js',
    'node_modules/pkg/node_modules/dependency/runtime.js',
    'node_modules/pkg/.bin/runtime.js',
    'node_modules/pkg/not_node_modules/.bin/runtime.js',
    '.next/server/runtime.js',
    'public/node_modules/.bin/runtime.js'
  ]) {
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-release-symlink-'));
    try {
      fixtureLink(dir, relative);
      assert.throws(() => artifactFingerprint(dir, false, [relative.split('/')[0]]), /release_symlink/, relative);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('release dotenv loader works with Node CommonJS interop and preserves existing OpenAI settings', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-release-env-'));
  try {
    writeFileSync(path.join(dir, '.env.production'), 'APP_ENV=staging\nAPPOINTMENT_OUTBOUND_MODE=isolated\nAPPOINTMENT_ASSISTANT_LLM_ENABLED=false\n');
    const moduleUrl = new URL('../../scripts/qa/assistant-release.ts', import.meta.url).href;
    const code = `import { loadReleaseEnvironment } from ${JSON.stringify(moduleUrl)}; loadReleaseEnvironment(process.cwd()); console.log(JSON.stringify({staging:process.env.APP_ENV==='staging',isolated:process.env.APPOINTMENT_OUTBOUND_MODE==='isolated',plannerPreserved:process.env.APPOINTMENT_ASSISTANT_LLM_ENABLED==='true'}));`;
    const output = execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', code], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { PATH: process.env.PATH, NODE_ENV: 'production', APPOINTMENT_ASSISTANT_LLM_ENABLED: 'true' } });
    assert.deepEqual(JSON.parse(output), { staging: true, isolated: true, plannerPreserved: true });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('release fingerprint detects modified and added runtime artifacts without emitting contents', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'qa-release-'));
  try {
    writeFileSync(path.join(dir, 'runtime.js'), 'private-compiled-content');
    const initial = artifactFingerprint(dir, false, ['runtime.js']);
    assert.throws(() => artifactFingerprint(dir, true, ['runtime.js']));
    assert.equal(initial.files, 1); assert.ok(!JSON.stringify(initial).includes('private'));
    writeFileSync(path.join(dir, 'runtime.js'), 'changed');
    assert.notEqual(artifactFingerprint(dir, false, ['runtime.js']).artifact, initial.artifact);
    writeFileSync(path.join(dir, 'extra.js'), 'extra');
    assert.notEqual(artifactFingerprint(dir, false, ['runtime.js', 'extra.js']).artifact, initial.artifact);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('release receipt rejects tampering, mismatched build, missing files and invalid source metadata', () => {
  const actual = { artifact: 'a'.repeat(64), files: 5 };
  const receipt: ReleaseReceipt = { version: 1, ...actual, source: 'b'.repeat(40), build: createHash('sha256').update('build').digest('hex'), node: 'd'.repeat(64), createdAt: new Date().toISOString() };
  verifyReceipt(receipt, actual, 'build', receipt.node);
  const withPrivateFields = { ...receipt, token: 'private-do-not-echo', patient: 'private-name' };
  assert.ok(!JSON.stringify(safeReceipt(withPrivateFields)).includes('private'));
  assert.throws(() => verifyReceipt({ ...receipt, createdAt: 'private-do-not-echo' }, actual, 'build', receipt.node));
  assert.throws(() => verifyReceipt({ ...receipt, source: 'caller-approved' }, actual, 'build', receipt.node));
  assert.throws(() => verifyReceipt(receipt, { ...actual, files: 4 }, 'build', receipt.node));
  assert.throws(() => verifyReceipt(receipt, actual, 'different', receipt.node));
  assert.throws(() => verifyReceipt({ ...receipt, artifact: 'c'.repeat(64) }, actual, 'build', receipt.node));
  assert.throws(() => verifyReceipt(receipt, actual, 'build', 'changed-runtime'));
});
