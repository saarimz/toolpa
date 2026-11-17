import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __toolpaTrace: {
      snapshot: () => Array<{ kind: string; name: string }>;
      ping: () => void;
      tryFetch: (url: string) => Promise<'allowed' | 'blocked'>;
    };
  }
}

const port = process.env.TRACE_PROBE_PORT ?? '43119';

test('ring buffer records events and any network call is blocked', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') external.push(request.url());
  });

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaTrace !== undefined);

  const result = await page.evaluate(async () => {
    window.__toolpaTrace.ping();
    const fetchResult = await window.__toolpaTrace.tryFetch('https://example.com/telemetry');
    const names = window.__toolpaTrace.snapshot().map((record) => record.name);
    return { fetchResult, names };
  });

  expect(result.fetchResult).toBe('blocked');
  expect(result.names).toContain('trace.ready');
  expect(result.names).toContain('probe.ping');
  expect(result.names).toContain('net.blocked');
  expect(external).toEqual([]);
});
