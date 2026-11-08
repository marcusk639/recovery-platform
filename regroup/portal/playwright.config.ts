import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Every test shares one set of emulators.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5199', viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure' },
  webServer: { command: 'node build/serve.mjs', url: 'http://127.0.0.1:5199', reuseExistingServer: false },
});
