import { expect, test } from '@playwright/test';

const port = process.env.LIVE_PROBE_PORT ?? '43117';

test('an instrument renders twice through one lowpass', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`http://127.0.0.1:${port}/instrument`);
  await page.waitForFunction(() => window.__toolpaInstrument !== undefined);
  const result = await page.evaluate(() => window.__toolpaInstrument.run());
  expect(result.identical).toBe(true);
  expect(result.svf).toBe(1);
  expect(result.peak).toBeGreaterThan(0.01);
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.names).toContain('instrument.render');
  expect(result.names).toContain('voice.allocate');
});

test('a polysynth renders a band-limited saw through one filter', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`http://127.0.0.1:${port}/instrument`);
  await page.waitForFunction(() => window.__toolpaInstrument !== undefined);
  const result = await page.evaluate(() => window.__toolpaInstrument.synth());
  expect(result.svf).toBe(1);
  expect(result.peak).toBeGreaterThan(0.01);
  expect(result.rms).toBeGreaterThan(0.001);
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
});

declare global {
  interface Window {
    __toolpaInstrument: {
      run: () => Promise<{ hash: string; identical: boolean; svf: number; peak: number; names: string[] }>;
      synth: () => Promise<{ hash: string; svf: number; peak: number; rms: number }>;
    };
  }
}
