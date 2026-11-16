import { execSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

function pulseServer(): string | undefined {
  if (process.env.PULSE_SERVER) return process.env.PULSE_SERVER;
  try {
    const info = execSync('pactl info', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = info.split('\n').find((entry) => entry.startsWith('Server String:'));
    const value = line?.slice('Server String:'.length).trim();
    if (!value) return undefined;
    return value.startsWith('/') ? `unix:${value}` : value;
  } catch {
    return undefined;
  }
}

const pulse = pulseServer();
if (pulse) process.env.PULSE_SERVER = pulse;

const tracePort = process.env.TRACE_PROBE_PORT ?? '43119';
const samplePort = process.env.SAMPLE_PROBE_PORT ?? '43118';
const livePort = process.env.LIVE_PROBE_PORT ?? '43117';
const playgroundPort = process.env.PLAYGROUND_PORT ?? '47291';
const opfsPort = process.env.OPFS_PROBE_PORT ?? '43116';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.SLICE_GATE ? [['list'], ['json', { outputFile: 'tmp/playwright.json' }]] : 'list',
  timeout: 30_000,
  use: {
    trace: 'off',
  },
  webServer: [
    {
      command: 'node packages/trace/browser/serve.mjs',
      url: `http://127.0.0.1:${tracePort}/`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'node packages/samples/browser/serve.mjs',
      url: `http://127.0.0.1:${samplePort}/`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'node packages/audio/browser/serve.mjs',
      url: `http://127.0.0.1:${livePort}/`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'node packages/artifact/browser/serve.mjs',
      url: `http://127.0.0.1:${opfsPort}/`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @toolpa/playground dev',
      url: `http://127.0.0.1:${playgroundPort}/`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
