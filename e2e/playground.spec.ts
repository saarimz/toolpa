import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

declare global {
  interface Window {
    __toolpaPlayground: {
      snapshot: () => Array<{ name: string }>;
    };
  }
}

const port = process.env.PLAYGROUND_PORT ?? '47291';
const sine = JSON.parse(readFileSync('packages/audio/goldens/sine.json', 'utf8')) as { hash: string };

test('the playground plays the default sine chain and renders it', async ({ page }) => {
  test.setTimeout(60_000);
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('blob:') || url.startsWith('data:')) return;
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') external.push(url);
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.getByRole('heading', { name: 'One chain, heard two ways.' })).toBeVisible();
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => {
    const text = await page.getByTestId('level').innerText();
    return Number(text.split(' ')[0]);
  }).toBeGreaterThan(0.05);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('status')).toContainText('Stopped');

  await page.getByRole('button', { name: 'Noise' }).click();
  await expect(page.getByTestId('hash')).not.toHaveText(sine.hash);
  await page.getByRole('button', { name: 'Sine' }).click();
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);

  await page.getByRole('button', { name: 'Render 1s WAV' }).click();
  await expect(page.getByTestId('wav-sha')).toHaveText(/^[a-f0-9]{64}$/);
  await expect(page.getByTestId('status')).toContainText('realtime');

  const names = await page.evaluate(() => window.__toolpaPlayground.snapshot().map((record) => record.name));
  expect(names).toContain('playground.ready');
  expect(names).toContain('playback.started');
  expect(names).toContain('playback.stopped');
  expect(names).toContain('render.offline');
  expect(names).toContain('playground.render');
  expect(external).toEqual([]);
});
