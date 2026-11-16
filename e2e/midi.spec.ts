import { expect, test } from '@playwright/test';

const port = process.env.SUITE_PORT ?? '43120';

test('the midi parser agrees in the browser', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const result = await page.evaluate(() => window.__toolpaSuite.midi());
  expect(result).toEqual({ events: 3, transposed: 62, key: 60, channel: 3 });
});

declare global {
  interface Window {
    __toolpaSuite: {
      midi: () => { events: number; transposed: number; key: number; channel: number };
    };
  }
}
