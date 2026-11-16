import { expect, test } from '@playwright/test';

const port = process.env.SUITE_PORT ?? '43120';

test('the midi parser agrees in the browser', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const result = await page.evaluate(() => window.__toolpaSuite.midi());
  expect(result).toEqual({ events: 3, transposed: 62, key: 60, channel: 3 });
});

test('a rack rejects an effect placed before the instrument', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const result = await page.evaluate(() => window.__toolpaSuite.rack());
  expect(result.illegal).toBe('RACK_ORDER');
  expect(result.effects).toBe(1);
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
});

test('a prompt generator agrees in the browser', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const result = await page.evaluate(() => window.__toolpaSuite.generate());
  expect(result.pulses).toBe(3);
  expect(result.same).toBe(true);
  expect(result.remote).toBe('NOT_CONFIGURED');
  expect(result.first).toBeGreaterThan(0);
});

declare global {
  interface Window {
    __toolpaSuite: {
      midi: () => { events: number; transposed: number; key: number; channel: number };
      generate: () => { pulses: number; first: number; same: boolean; remote: string };
      rack: () => Promise<{ effects: number; illegal: string; hash: string }>;
    };
  }
}
