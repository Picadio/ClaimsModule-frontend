
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.live.ts',
  timeout: 150_000,
  use: {
    baseURL: process.env['CLAIMS_LIVE_BASE_URL'],
    channel: process.env['PLAYWRIGHT_CHANNEL'] || undefined,
    viewport: { width: 1280, height: 900 },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
});
