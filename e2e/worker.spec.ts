import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

declare global {
  interface Window {
    __toolpaLive: {
      renderInWorker: (
        chain: unknown,
        durationSeconds: number,
      ) => Promise<{ hash?: string; wavSha256?: string; frames?: number; error?: string }>;
    };
  }
}

const port = process.env.LIVE_PROBE_PORT ?? '43117';
const sine = JSON.parse(readFileSync('packages/audio/goldens/sine.json', 'utf8')) as {
  hash: string;
  wavSha256: string;
};
const sineChain = {
  kind: 'chain',
  version: 1,
  sampleRate: 44100,
  source: { type: 'sine', frequencyHz: 440 },
  effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 },
};

test('the worker WAV matches the Node render on Chromium', async ({ page, browserName }) => {
  test.setTimeout(60_000);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaLive !== undefined);
  const rendered = await page.evaluate(
    ([chain]) => window.__toolpaLive.renderInWorker(chain, 0.25),
    [sineChain] as const,
  );
  expect(rendered.error).toBeUndefined();
  expect(rendered.hash).toBe(sine.hash);
  if (browserName === 'chromium') {
    expect(rendered.wavSha256).toBe(sine.wavSha256);
  } else if (rendered.wavSha256 !== sine.wavSha256) {
    mkdirSync('tmp', { recursive: true });
    writeFileSync(
      'tmp/non-gating.json',
      `${JSON.stringify({
        check: 'worker-wav',
        browser: browserName,
        gating: false,
        message: `worker wav ${rendered.wavSha256} differs from node ${sine.wavSha256}`,
      })}\n`,
    );
  } else {
    expect(rendered.wavSha256).toBe(sine.wavSha256);
  }

  const missing = await page.evaluate(() =>
    window.__toolpaLive.renderInWorker(
      {
        kind: 'chain',
        version: 1,
        sampleRate: 44100,
        source: { type: 'sample', sha256: 'a'.repeat(64), playbackRate: 1 },
        effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 },
      },
      0.1,
    ),
  );
  expect(missing.wavSha256).toBeUndefined();
  expect(missing.error ?? '').toMatch(/missing/);
});