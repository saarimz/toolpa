import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

declare global {
  interface Window {
    __toolpaLive: {
      snapshot: () => Array<{ name: string }>;
      play: () => Promise<{ hash: string; state: string; sampleRate: number; baseLatencyMs: number; running: boolean }>;
      started: () => { hash: string; state: string; sampleRate: number; baseLatencyMs: number; running: boolean } | null;
      startError: () => string | null;
      waitForPeak: () => Promise<{ peak: number; running: boolean; underruns: number; baseLatencyMs: number; outputLatencyMs: number; hash: string }>;
      stop: () => Promise<{ underruns: number; peak: number; hash: string }>;
      offlineHash: () => Promise<{ hash: string; wavSha256: string }>;
      forceStall: () => Promise<{ first: boolean; second: boolean; stalls: number }> | { first: boolean; second: boolean; stalls: number };
    };
  }
}

const port = process.env.LIVE_PROBE_PORT ?? '43117';

test('a sine chain plays live and hashes the same as offline', async ({ page, browserName }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('blob:') || url.startsWith('data:')) return;
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') external.push(url);
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaLive !== undefined);
  await page.click('#play');
  await page.waitForFunction(() => window.__toolpaLive.started() !== null || window.__toolpaLive.startError() !== null);
  const startError = await page.evaluate(() => window.__toolpaLive.startError());
  expect(startError).toBeNull();
  const started = await page.evaluate(() => window.__toolpaLive.started());
  if (!started) throw new Error('live session did not start');
  expect(started.state).toBe('running');
  expect(started.sampleRate).toBe(44100);
  expect(started.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(Number.isFinite(started.baseLatencyMs)).toBe(true);

  const heard = await page.evaluate(() => window.__toolpaLive.waitForPeak());
  expect(heard.running).toBe(true);
  expect(heard.peak).toBeGreaterThan(0.05);
  expect(heard.underruns).toBe(0);
  const stall = await page.evaluate(() => window.__toolpaLive.forceStall());
  expect(stall).toEqual({ first: true, second: false, stalls: 1 });
  mkdirSync('tmp', { recursive: true });
  writeFileSync(
    `tmp/live-${browserName}.json`,
    `${JSON.stringify({
      baseLatencyMs: heard.baseLatencyMs,
      outputLatencyMs: heard.outputLatencyMs,
      underruns: heard.underruns,
      peak: heard.peak,
    })}\n`,
  );

  const stopped = await page.evaluate(() => window.__toolpaLive.stop());
  expect(stopped.peak).toBeGreaterThan(0.05);
  const names = await page.evaluate(() => window.__toolpaLive.snapshot().map((record) => record.name));
  expect(names).toContain('playback.started');
  expect(names).toContain('playback.stopped');
  expect(names).toContain('playback.underruns');

  const offline = await page.evaluate(() => window.__toolpaLive.offlineHash());
  expect(offline.hash).toBe(started.hash);
  expect(external).toEqual([]);
});
