const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'claims-runtime-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const browser = join(root, 'dist', 'claims-module-frontend', 'browser');
  const config = join(browser, 'config.js');
  mkdirSync(browser, { recursive: true });
  writeFileSync(join(browser, 'index.html'), '<app-root></app-root>');
  writeFileSync(config, 'window.claimsSettings = {apiOrigin: ""};\n');
  const script = join(root, 'prepare-runtime-config.cjs');
  copyFileSync(join(__dirname, '..', 'prepare-runtime-config.cjs'), script);

  return {
    config,
    browser,
    run(env) {
      return spawnSync(process.execPath, [script], { env, cwd: browser, encoding: 'utf8' });
    },
  };
}

test('writes public API settings from the environment, independent of the working directory', t => {
  const { config, browser, run } = fixture(t);
  const result = run({
    CLAIMS_API_ORIGIN: ' https://CLAIMS-API.example/ ',
    CLAIMS_DEMO_HANDLER_ID: '0f0cd7d5-f164-40ec-b68f-93742deaefaa',
    UNRELATED_VALUE: 'do-not-publish',
  });
  assert.equal(result.status, 0, result.stderr);
  const source = readFileSync(config, 'utf8');
  const context = { window: {} };
  runInNewContext(source, context);
  assert.equal(context.window.claimsSettings.apiOrigin, 'https://claims-api.example');
  assert.equal(context.window.claimsSettings.demoHandlerId, '0f0cd7d5-f164-40ec-b68f-93742deaefaa');
  assert.doesNotMatch(source, /do-not-publish/);
  assert.deepEqual(readdirSync(browser).sort(), ['config.js', 'index.html']);
});

test('rejects absent or invalid origins without changing the published file', t => {
  const { config, run } = fixture(t);
  const original = readFileSync(config, 'utf8');
  for (const value of [
    '', 'http://example.com', 'https://user:secret@example.com', 'https://example.com/api',
    'https://example.com/x/..', 'https://example.com?', 'https://example.com#',
  ]) {
    const result = run(value ? { CLAIMS_API_ORIGIN: value } : {});
    assert.equal(result.status, 1, value);
    assert.match(result.stderr, /CLAIMS_API_ORIGIN/);
    assert.doesNotMatch(result.stderr, /example\.com|secret/);
    assert.equal(readFileSync(config, 'utf8'), original);
  }
});
