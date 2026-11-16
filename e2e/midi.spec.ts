import { expect, test } from '@playwright/test';

const port = process.env.SUITE_PORT ?? '43120';

test('a fake Web MIDI port lists a device and a 24-tick clock', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const result = await page.evaluate(() => window.__toolpaSuite.webmidi());
  expect(result.names).toEqual(['Fake Keyboard']);
  expect(result.ticks).toBe(24);
  expect(result.quarters).toBe(1);
  expect(result.hotplug).toBe('note');
});

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

test('JSX, DSL, and JSON share one document id', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const result = await page.evaluate(() => window.__toolpaSuite.author());
  expect(result.same).toBe(true);
  expect(result.nodes).toBe(2);
  expect(result.documentId).toMatch(/^[a-f0-9]{64}$/);
});

test('an IR const hash is stable and a cycle is rejected', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const result = await page.evaluate(() => window.__toolpaSuite.ir());
  expect(result.keyedStable).toBe(true);
  expect(result.cycle).toBe('V10');
  expect(result.constHash).toBeGreaterThan(0);
});

test('an SMF export starts with the MIDI header', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const result = await page.evaluate(() => window.__toolpaSuite.smf());
  expect(result.header).toBe('MThd');
  expect(result.bytes).toBe(42);
});

test('the agent builds a rack from a prompt', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const result = await page.evaluate(() => window.__toolpaSuite.agent());
  expect(result.provider).toBe('mock');
  expect(result.budget).toBe('AGENT_BUDGET');
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
});

test('a configured model builds a rack and notes stay local', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__toolpaSuite !== undefined);
  const hosted = await page.evaluate(() => window.__toolpaSuite.hosted());
  const prompt = await page.evaluate(() => window.__toolpaSuite.prompt());
  expect(hosted.provider).toBe('remote');
  expect(hosted.called).toBe(true);
  expect(hosted.blocked).toBe('NOT_CONFIGURED');
  expect(hosted.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(prompt.notes).toBe(2);
  expect(prompt.midi).toBe(60);
  expect(prompt.remote).toBe('NOT_CONFIGURED');
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
      hosted: () => Promise<{ provider: string; hash: string; called: boolean; blocked: string }>;
      prompt: () => Promise<{ notes: number; midi: number; remote: string }>;
      rack: () => Promise<{ effects: number; illegal: string; hash: string }>;
      agent: () => Promise<{ hash: string; budget: string; provider: string }>;
      smf: () => { bytes: number; header: string };
      ir: () => { constHash: number; keyedStable: boolean; cycle: string };
      author: () => Promise<{ same: boolean; nodes: number; documentId: string }>;
      webmidi: () => { names: string[]; ticks: number; quarters: number; hotplug: string };
    };
  }
}
