import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

declare global {
  interface Window {
    __toolpaLive: {
      renderInWorker: (
        chain: unknown,
        durationSeconds: number,
        format?: 'pcm16' | 'pcm24' | 'float32',
      ) => Promise<{
        hash?: string;
        wavSha256?: string;
        frames?: number;
        error?: string;
        itok?: { version: number; hash: string } | null;
        standardDecoder?: boolean;
      }>;
    };
  }
}

const port = process.env.LIVE_PROBE_PORT ?? '43117';
const sine = JSON.parse(readFileSync('packages/audio/goldens/sine.json', 'utf8')) as {
  hash: string;
  wavSha256: string;
};
const formats = JSON.parse(readFileSync('packages/audio/goldens/formats.json', 'utf8')) as {
  pcm16: string;
  pcm24: string;
  float32: string;
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
  for (const format of ['pcm16', 'pcm24', 'float32'] as const) {
    const rendered = await page.evaluate(
      ([chain, next]) => window.__toolpaLive.renderInWorker(chain, 0.25, next),
      [sineChain, format] as const,
    );
    expect(rendered.error).toBeUndefined();
    expect(rendered.hash).toBe(sine.hash);
    expect(rendered.itok).toEqual({ version: 1, hash: sine.hash });
    expect(rendered.standardDecoder).toBe(true);
    const expected = formats[format];
    if (browserName === 'chromium') {
      expect(rendered.wavSha256).toBe(expected);
    } else if (rendered.wavSha256 !== expected) {
      mkdirSync('tmp', { recursive: true });
      writeFileSync(
        'tmp/non-gating.json',
        `${JSON.stringify({
          check: 'worker-wav',
          browser: browserName,
          format,
          gating: false,
          message: `worker wav ${rendered.wavSha256} differs from node ${expected}`,
        })}\n`,
      );
    } else {
      expect(rendered.wavSha256).toBe(expected);
    }
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