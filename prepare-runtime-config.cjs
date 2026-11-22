const { randomUUID } = require('node:crypto');
const { renameSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const browser = join(__dirname, 'dist', 'claims-module-frontend', 'browser');

function readApiOrigin() {
  const value = process.env.CLAIMS_API_ORIGIN?.trim();
  if (!value) {
    throw new Error('Set CLAIMS_API_ORIGIN to the public HTTPS origin of the API.');
  }

  const origin = URL.parse(value);
  if (!/^https:\/\/[^/?#\\\s]+\/?$/i.test(value) || !origin ||
      origin.protocol !== 'https:' || origin.username || origin.password) {
    throw new Error('CLAIMS_API_ORIGIN must be an HTTPS origin without credentials, a path, query, or fragment.');
  }
  return origin.origin;
}

function writeRuntimeConfig() {
  const apiOrigin = readApiOrigin();
  const demoHandlerId = process.env.CLAIMS_DEMO_HANDLER_ID?.trim() ?? '';
  if (!statSync(join(browser, 'index.html')).isFile()) {
    throw new Error('The Angular production build has no index.html.');
  }

  const path = join(browser, 'config.js');
  const temporaryPath = path + '.' + randomUUID() + '.tmp';
  const source = 'window.claimsSettings = ' + JSON.stringify({ apiOrigin, demoHandlerId }) + ';\n';
  try {
    writeFileSync(temporaryPath, source, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

try {
  writeRuntimeConfig();
} catch (error) {
  console.error('Could not prepare frontend configuration:', error.message);
  process.exitCode = 1;
}
