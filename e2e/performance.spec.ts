import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __toolpaPerformance: {
      snapshot: () => Array<{ name: string }>;
      play: () => Promise<{ hash: string; state: string; sampleRate: number; running: boolean }>;
      started: () => { hash: string; state: string; sampleRate: number; running: boolean } | null;
      startError: () => string | null;
      waitForPeak: () => Promise<{ peak: number; running: boolean; underruns: number; hash: string }>;
      learnCc: (cc: number) => { cc: number; param: string } | null;
    };
  }
}

const port = process.env.LIVE_PROBE_PORT ?? '43117';

test('a launched clip moves the live meter', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/performance`);
  await page.waitForFunction(() => window.__toolpaPerformance !== undefined);
  await page.click('#play');
  await page.waitForFunction(
    () => window.__toolpaPerformance.started() !== null || window.__toolpaPerformance.startError() !== null,
  );
  const startError = await page.evaluate(() => window.__toolpaPerformance.startError());
  expect(startError).toBeNull();
  const started = await page.evaluate(() => window.__toolpaPerformance.started());
  if (!started) throw new Error('the clip did not start');
  expect(started.state).toBe('running');
  expect(started.sampleRate).toBe(44100);
  expect(started.hash).toMatch(/^[a-f0-9]{64}$/);
  const heard = await page.evaluate(() => window.__toolpaPerformance.waitForPeak());
  expect(heard.running).toBe(true);
  expect(heard.peak).toBeGreaterThan(0.05);
  expect(heard.underruns).toBe(0);
  const names = await page.evaluate(() => window.__toolpaPerformance.snapshot().map((record) => record.name));
  expect(names).toContain('transport.launch');
  expect(names).toContain('playback.started');
});

test('scenes, MIDI learn, and a quantized launch', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/performance`);
  await page.waitForFunction(() => window.__toolpaPerformance !== undefined);
  await page.click('#scene-a');
  await expect(page.locator('#status')).toHaveText('scene scene-a');
  await page.click('#learn');
  await expect(page.locator('#status')).toHaveText('learning cutoff');
  await page.click('#cc');
  await expect(page.locator('#status')).toHaveText('mapped cutoff 74');
  await page.click('#launch');
  await expect(page.locator('#status')).toHaveText('launch scene-a 2');
  await page.click('#xrun');
  await expect(page.locator('#status')).toHaveText('xrun 1');
  const names = await page.evaluate(() => window.__toolpaPerformance.snapshot().map((record) => record.name));
  expect(names).toContain('performance.scene');
  expect(names).toContain('performance.learn');
  expect(names).toContain('performance.launch');
  expect(names).toContain('performance.xrun');
});
