
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4310',
    viewport: { width: 1280, height: 900 },
    channel: process.env['PLAYWRIGHT_CHANNEL'] || undefined,
  },
  webServer: {
    command: 'npm run start -- --host 127.0.0.1 --port 4310',
    url: 'http://127.0.0.1:4310',
    timeout: 90_000,
  },
});
