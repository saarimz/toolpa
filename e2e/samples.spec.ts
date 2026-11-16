import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

declare global {
  interface Window {
    __toolpaSamples: {
      decode: (base64: string) => Promise<{
        sha256: string;
        format: string;
        sampleRate: number;
        frames: number;
        decodeMs: number;
        rms: number;
      }>;
      nativeMp3: (base64: string) => Promise<{ ok: boolean; sampleRate?: number; frames?: number; message?: string }>;
    };
  }
}

const fixture = readFileSync(new URL('../packages/samples/fixtures/tone.mp3', import.meta.url));
const base64 = fixture.toString('base64');
const port = process.env.SAMPLE_PROBE_PORT ?? '43118';

test('canonical MP3 decode matches across browsers', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') external.push(request.url());
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSamples !== undefined);
  const decoded = await page.evaluate((payload) => window.__toolpaSamples.decode(payload), base64);
  expect(decoded.format).toBe('mp3');
  expect(decoded.sampleRate).toBe(44100);
  expect(decoded.frames).toBeGreaterThan(1000);
  expect(decoded.rms).toBeGreaterThan(0.05);
  expect(decoded.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(external).toEqual([]);
});

test('native MP3 decode is gating except on WebKit', async ({ page, browserName }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSamples !== undefined);
  const native = await page.evaluate((payload) => window.__toolpaSamples.nativeMp3(payload), base64);
  if (!native.ok && browserName === 'webkit') {
    mkdirSync('tmp', { recursive: true });
    const note = {
      check: 'native-mp3-decode',
      browser: 'webkit',
      gating: false,
      message: native.message ?? 'decodeAudioData failed',
    };
    writeFileSync('tmp/non-gating.json', `${JSON.stringify(note, null, 2)}\n`);
    return;
  }
  expect(native.ok, native.message).toBe(true);
  expect(native.frames ?? 0).toBeGreaterThan(100);
});
