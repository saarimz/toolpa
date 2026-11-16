import { defineConfig, devices } from '@playwright/test';

const tracePort = process.env.TRACE_PROBE_PORT ?? '43119';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    trace: 'off',
  },
  webServer: {
    command: 'node packages/trace/browser/serve.mjs',
    url: `http://127.0.0.1:${tracePort}/`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
