import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { packToolpa } from '../packages/artifact/src/zip.ts';

const requireFromArtifact = createRequire(new URL('../packages/artifact/package.json', import.meta.url));
const { unzipSync, zipSync } = requireFromArtifact('fflate') as {
  unzipSync: (bytes: Uint8Array) => Record<string, Uint8Array>;
  zipSync: (files: Record<string, Uint8Array>, options?: { level?: number }) => Uint8Array;
};

declare global {
  interface Window {
    __toolpaPlayground: {
      snapshot: () => Array<{ name: string }>;
    };
  }
}

const port = process.env.PLAYGROUND_PORT ?? '47291';
const sine = JSON.parse(readFileSync('packages/audio/goldens/sine.json', 'utf8')) as { hash: string };

async function storeReady(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Save artifact' })).toBeEnabled({ timeout: 8_000 });
}

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
  expect(names).toContain('ui.action');
  expect(names).toContain('ctx.latency');
  expect(names).toContain('export.wav');
  await expect(page.getByTestId('trace')).toContainText('ui.action');
  expect(external).toEqual([]);
});

test('one chain hash renders the same WAV after a reload', async ({ page, browserName }) => {
  test.setTimeout(60_000);
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
  const render = page.getByRole('button', { name: 'Render 1s WAV' });
  await render.click();
  await expect(page.getByTestId('render-count')).toHaveText('1');
  const checksum = (await page.getByTestId('wav-sha').innerText()).trim();
  expect(checksum).toMatch(/^[a-f0-9]{64}$/);

  await storeReady(page);
  const save = page.getByRole('button', { name: 'Save artifact' });
  await save.click();
  await expect(page.getByTestId('status')).toContainText('Saved');
  const artifactId = await page.getByTestId('library').getByRole('button').last().getAttribute('aria-label');
  if (!artifactId) throw new Error('saved artifact has no id');
  await page.reload();
  await page.getByRole('button', { name: artifactId }).click();
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
  await page.getByRole('button', { name: 'Render 1s WAV' }).click();
  await expect(page.getByTestId('render-count')).toHaveText('1');
  await expect(page.getByTestId('wav-sha')).toHaveText(checksum);
});

test('a saved chain reloads from OPFS with the same hash', async ({ page, browserName }) => {
  test.setTimeout(60_000);
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
  await storeReady(page);
  const save = page.getByRole('button', { name: 'Save artifact' });
  await save.click();
  await expect(page.getByTestId('status')).toContainText('Saved');
  const artifactId = await page.getByTestId('library').getByRole('button').getAttribute('aria-label');
  if (!artifactId) throw new Error('saved artifact has no id');
  await page.reload();
  await page.getByRole('button', { name: artifactId }).click();
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
  await expect(page.getByTestId('status')).toContainText('Loaded');
});

test('saving a second version keeps the first cutoff and the same WAV', async ({ page, browserName }) => {
  test.setTimeout(90_000);
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
  await storeReady(page);

  await page.getByLabel('Cutoff Hz').fill('600');
  await expect(page.getByTestId('hash')).not.toHaveText(sine.hash);
  const hash = (await page.getByTestId('hash').innerText()).trim();
  await page.getByRole('button', { name: 'Render 1s WAV' }).click();
  await expect(page.getByTestId('wav-sha')).toHaveText(/^[a-f0-9]{64}$/);
  const checksum = (await page.getByTestId('wav-sha').innerText()).trim();

  const labels = () =>
    page.getByTestId('library').getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? ''));
  const before = await labels();
  await page.getByRole('button', { name: 'Save artifact' }).click();
  await expect(page.getByTestId('status')).toContainText('Saved');
  const v1 = (await labels()).find((id) => !before.includes(id));
  if (!v1) throw new Error('v1 has no id');

  await page.getByLabel('Gain amount').fill('0.5');
  await expect(page.getByTestId('hash')).not.toHaveText(hash);
  const savedStatus = await page.getByTestId('status').innerText();
  await page.getByRole('button', { name: 'Save artifact' }).click();
  await expect(page.getByTestId('status')).not.toHaveText(savedStatus);
  await expect(page.getByTestId('status')).toContainText('Saved');
  await expect(page.getByTestId('parents')).toHaveText(v1);
  await expect.poll(async () => (await labels()).find((id) => id !== v1 && !before.includes(id)) ?? '').not.toBe('');
  const v2 = (await labels()).find((id) => id !== v1 && !before.includes(id));
  if (!v2) throw new Error('v2 has no id');

  await page.reload();
  await storeReady(page);
  await page.getByRole('button', { name: v1 }).click();
  await expect(page.getByTestId('status')).toContainText('Loaded');
  await expect(page.getByLabel('Cutoff Hz')).toHaveValue('600');
  await expect(page.getByLabel('Gain amount')).toHaveValue('0.25');
  await expect(page.getByTestId('hash')).toHaveText(hash);
  await page.getByRole('button', { name: 'Render 1s WAV' }).click();
  await expect(page.getByTestId('wav-sha')).toHaveText(checksum);

  await page.getByRole('button', { name: v2 }).click();
  await expect(page.getByTestId('parents')).toHaveText(v1);
  await expect(page.getByLabel('Gain amount')).toHaveValue('0.5');
});

const tone = { type: 'tone' as const, cutoffHz: 600, q: 0.7071067811865476, gain: 0.25 };

async function tamperedToolpa(): Promise<Uint8Array> {
  const packed = await packToolpa({
    chain: {
      kind: 'chain',
      version: 1,
      sampleRate: 44100,
      source: { type: 'sine', frequencyHz: 440 },
      effect: tone,
    },
    title: 'Sine',
    name: 'sine',
    seq: 1,
  });
  const files = unzipSync(packed.bytes);
  const graph = files['graph.json']?.slice() ?? new Uint8Array();
  graph[10] = (graph[10] ?? 0) ^ 1;
  return zipSync(
    {
      'toolpa.json': files['toolpa.json'] ?? new Uint8Array(),
      'graph.json': graph,
      'previews/fingerprint.json': files['previews/fingerprint.json'] ?? new Uint8Array(),
      'verify.json': files['verify.json'] ?? new Uint8Array(),
    },
    { level: 0 },
  );
}

test('a downloaded .toolpa opens to the same hash and WAV', async ({ page, browserName }) => {
  test.setTimeout(60_000);
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
  await page.getByLabel('Cutoff Hz').fill('600');
  await expect(page.getByTestId('hash')).not.toHaveText(sine.hash);
  const hash = (await page.getByTestId('hash').innerText()).trim();
  const wavDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Render 1s WAV' }).click();
  await expect(page.getByTestId('render-count')).toHaveText('1');
  expect((await wavDownload).suggestedFilename()).toMatch(/\.wav$/);
  const checksum = (await page.getByTestId('wav-sha').innerText()).trim();
  expect(checksum).toMatch(/^[a-f0-9]{64}$/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .toolpa' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`sine-${hash.slice(0, 12)}.toolpa`);
  mkdirSync('tmp', { recursive: true });
  const saved = `tmp/roundtrip-${browserName}.toolpa`;
  await download.saveAs(saved);
  const exported = await page.evaluate(() => window.__toolpaPlayground.snapshot().map((record) => record.name));
  expect(exported).toContain('export.toolpa');

  await page.reload();
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
  await page.getByLabel('Open .toolpa').setInputFiles(saved);
  await expect(page.getByTestId('status')).toContainText('Opened');
  await expect(page.getByTestId('hash')).toHaveText(hash);
  await expect(page.getByLabel('Cutoff Hz')).toHaveValue('600');
  await page.getByRole('button', { name: 'Render 1s WAV' }).click();
  await expect(page.getByTestId('render-count')).toHaveText('1');
  await expect(page.getByTestId('wav-sha')).toHaveText(checksum);
  const imported = await page.evaluate(() => window.__toolpaPlayground.snapshot().map((record) => record.name));
  expect(imported).toContain('import.toolpa');
});

test('opening a .toolpa restores the parent pointer', async ({ page, browserName }) => {
  const parent = 'ab'.repeat(32);
  const packed = await packToolpa({
    chain: {
      kind: 'chain',
      version: 1,
      sampleRate: 44100,
      source: { type: 'sine', frequencyHz: 440 },
      effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 },
    },
    title: 'sine',
    name: 'sine',
    parents: [parent],
    seq: 2,
  });
  mkdirSync('tmp', { recursive: true });
  const path = `tmp/parent-${browserName}.toolpa`;
  writeFileSync(path, packed.bytes);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByLabel('Open .toolpa').setInputFiles(path);
  await expect(page.getByTestId('status')).toContainText('Opened');
  await expect(page.getByTestId('parents')).toHaveText(parent);
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
});

test('a tampered .toolpa is rejected, including when it is dropped', async ({ page, browserName }) => {
  test.setTimeout(60_000);
  mkdirSync('tmp', { recursive: true });
  const bytes = await tamperedToolpa();
  const path = `tmp/tampered-${browserName}.toolpa`;
  writeFileSync(path, bytes);
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
  await page.getByLabel('Open .toolpa').setInputFiles(path);
  await expect(page.getByTestId('error')).toContainText('ARTIFACT_HASH_MISMATCH');
  await expect(page.getByTestId('status')).toContainText('could not be opened');
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);

  await page.reload();
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
  const dropped = await page.evaluate(async (list) => {
    const file = new File([new Uint8Array(list)], 'tampered.toolpa', { type: 'application/octet-stream' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const zone = document.querySelector('[data-testid="toolpa-drop"]');
    if (!zone) return 'missing-zone';
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer });
    zone.dispatchEvent(event);
    return event.defaultPrevented ? 'dispatched' : 'ignored';
  }, [...bytes]);
  expect(dropped).toBe('dispatched');
  await expect(page.getByTestId('error')).toContainText('ARTIFACT_HASH_MISMATCH');
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);
});

test('an oversized .toolpa is rejected before it is unpacked', async ({ page, browserName }) => {
  test.setTimeout(60_000);
  mkdirSync('tmp', { recursive: true });
  const path = `tmp/oversize-toolpa-${browserName}.toolpa`;
  writeFileSync(path, Buffer.alloc(50 * 1024 * 1024 + 1));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByLabel('Open .toolpa').setInputFiles(path);
  await expect(page.getByTestId('error')).toContainText('LOADER_TOO_LARGE');
  await expect(page.getByTestId('status')).toContainText('larger than 50 MB');
  const names = await page.evaluate(() => window.__toolpaPlayground.snapshot().map((record) => record.name));
  expect(names).toContain('import.toolpa');
  expect(names).toContain('error');
});

test('a file over 50 MB is rejected before decode', async ({ page, browserName }) => {
  test.setTimeout(60_000);
  mkdirSync('tmp', { recursive: true });
  const path = `tmp/oversize-${browserName}.wav`;
  writeFileSync(path, Buffer.alloc(50 * 1024 * 1024 + 1));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole('button', { name: 'Sample' }).click();
  await page.getByLabel('Audio file').setInputFiles(path);
  await expect(page.getByTestId('error')).toContainText('LOADER_TOO_LARGE');
  await expect(page.getByTestId('status')).toContainText('larger than 50 MB');
  const names = await page.evaluate(() => window.__toolpaPlayground.snapshot().map((record) => record.name));
  expect(names).toContain('source.load');
  expect(names).toContain('error');
});

test('the studio composes a rack, edits the roll, and exports', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`http://127.0.0.1:${port}/`);
  await expect(page.getByRole('heading', { name: 'Devices, rack, and piano roll' })).toBeVisible();
  await expect(page.getByTestId('hash')).toHaveText(sine.hash);

  await page.getByRole('button', { name: 'Add lowpass' }).click();
  await page.getByRole('button', { name: 'Add voice' }).click();
  await page.getByRole('button', { name: 'Compose rack' }).click();
  await expect(page.getByTestId('rack-status')).toHaveText('RACK_ORDER');

  await page.getByRole('button', { name: 'Clear rack' }).click();
  await page.getByRole('button', { name: 'Add keys' }).click();
  await page.getByRole('button', { name: 'Add voice' }).click();
  await page.getByRole('button', { name: 'Add lowpass' }).click();
  await expect(page.getByTestId('rack-order')).toHaveText('keys sine lowpass');
  await page.getByRole('button', { name: 'Compose rack' }).click();
  await expect(page.getByTestId('rack-status')).toHaveText(/^[a-f0-9]{64}$/);

  await expect(page.getByTestId('roll-count')).toHaveText('1 notes');
  await page.getByRole('button', { name: 'note 2 64' }).click();
  await expect(page.getByTestId('roll-count')).toHaveText('2 notes');
  await expect(page.getByRole('button', { name: 'note 2 64' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Export MIDI' }).click();
  await expect(page.getByTestId('export-status')).toContainText('MIDI MThd');
  await page.getByRole('button', { name: 'Export SFZ' }).click();
  await expect(page.getByTestId('export-status')).toContainText(`sample=samples/${sine.hash}.wav`);
  await page.getByRole('button', { name: 'Export stems' }).click();
  await expect(page.getByTestId('export-status')).toHaveText(/^stems [a-f0-9]{64}$/);
  await page.getByRole('button', { name: 'Export pack' }).click();
  await expect(page.getByTestId('export-status')).toContainText('instrument.sfz');

  const names = await page.evaluate(() => window.__toolpaPlayground.snapshot().map((record) => record.name));
  expect(names).toContain('rack.compose');
  expect(names).toContain('export.smf');
  expect(names).toContain('export.sfz');
  expect(names).toContain('export.stem');
  expect(names).toContain('export.pack');
});
