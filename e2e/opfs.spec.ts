import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __toolpaOpfs: {
      snapshot: () => Array<{ name: string }>;
      roundTrip: () => Promise<
        | {
            ok: true;
            childId: string;
            parentId: string;
            loadedParents: string[];
            walked: string[];
            sampleBytes: number[] | null;
            missing: number[] | null;
            listed: boolean;
            backend: string;
          }
        | { ok: false; steps: string[]; message: string }
      >;
    };
  }
}

const port = process.env.OPFS_PROBE_PORT ?? '43116';

test('storage keeps an artifact, its parent, and its sample bytes', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('blob:') || url.startsWith('data:')) return;
    const host = new URL(url).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') external.push(url);
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaOpfs !== undefined);
  const result = await page.evaluate(() => window.__toolpaOpfs.roundTrip());
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) return;
  expect(result.loadedParents).toEqual([result.parentId]);
  expect(result.walked).toEqual([result.childId, result.parentId]);
  expect(result.sampleBytes).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(result.missing).toBeNull();
  expect(result.listed).toBe(true);
  expect(result.backend === 'opfs' || result.backend === 'idb').toBe(true);

  const names = await page.evaluate(() => window.__toolpaOpfs.snapshot().map((record) => record.name));
  expect(names).toContain('artifact.saved');
  expect(names).toContain('artifact.loaded');
  expect(external).toEqual([]);
});
