import { unzipSync, zipSync, strToU8 } from 'fflate';
import { createTrace } from '@toolpa/trace';
import { describe, expect, it } from 'vitest';
import { ArtifactError, packToolpa, unpackToolpa } from './index.ts';

const tone = { type: 'tone' as const, cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 };
const chain = {
  kind: 'chain' as const,
  version: 1 as const,
  sampleRate: 44100,
  source: { type: 'sine' as const, frequencyHz: 440 },
  effect: tone,
};

function localHeader(name: string, size: number, data = new Uint8Array(0)): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const out = new Uint8Array(30 + nameBytes.length + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  out.set(nameBytes, 30);
  out.set(data, 30 + nameBytes.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('.toolpa zip', () => {
  it('packs, unpacks, and repacks the same bytes and content id', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const first = await packToolpa({ chain, title: 'Noon', name: 'noon', seq: 1 }, trace);
    const again = await packToolpa({ chain, title: 'Noon', name: 'noon', seq: 1 });
    expect(again.bytes).toEqual(first.bytes);
    expect(again.contentId).toBe(first.contentId);
    expect(first.contentId.startsWith('tpa1:sha256:')).toBe(true);

    const opened = await unpackToolpa(first.bytes, trace);
    expect(opened.graphHash).toBe(first.graphHash);
    expect(opened.chain).toEqual(first.chain);
    const repacked = await packToolpa({ chain: opened.chain, title: 'Noon', name: 'noon', seq: 1 });
    expect(repacked.bytes).toEqual(first.bytes);

    const renamed = await packToolpa({ chain, title: 'Dusk', name: 'noon', seq: 1 });
    expect(renamed.graphHash).toBe(first.graphHash);
    expect(renamed.contentId).not.toBe(first.contentId);
    const darker = await packToolpa({
      chain: { ...chain, effect: { ...tone, cutoffHz: 400 } },
      title: 'Noon',
      name: 'noon',
      seq: 1,
    });
    expect(darker.graphHash).not.toBe(first.graphHash);
    expect(darker.contentId).not.toBe(first.contentId);

    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records.some((record) => record.name === 'artifact.pack' && record.fields.ok === true)).toBe(true);
    expect(records.some((record) => record.name === 'artifact.verify' && record.fields.ok === true)).toBe(true);
    expect(records.some((record) => record.name === 'artifact.unpack')).toBe(true);
  });

  it('names the file when one byte of graph.json changes', async () => {
    const packed = await packToolpa({ chain, title: 'Noon', name: 'noon' });
    const files = unzipSync(packed.bytes);
    const graph = files['graph.json']?.slice() ?? new Uint8Array();
    graph[10] = (graph[10] ?? 0) ^ 1;
    const tampered = zipSync(
      {
        'toolpa.json': files['toolpa.json'] ?? new Uint8Array(),
        'graph.json': graph,
        'previews/fingerprint.json': files['previews/fingerprint.json'] ?? new Uint8Array(),
        'verify.json': files['verify.json'] ?? new Uint8Array(),
      },
      { level: 0 },
    );
    await expect(unpackToolpa(tampered)).rejects.toThrow(/ARTIFACT_HASH_MISMATCH: graph\.json/);
  });

  it('rejects zip-slip, duplicate names, unknown files, a 2 GB entry, and a float', async () => {
    await expect(unpackToolpa(localHeader('../x', 0))).rejects.toThrow(ArtifactError);
    await expect(unpackToolpa(localHeader('../x', 0))).rejects.toThrow(/ZIP_SLIP/);
    await expect(unpackToolpa(concat([localHeader('graph.json', 0), localHeader('graph.json', 0)]))).rejects.toThrow(
      /ZIP_DUPLICATE/,
    );
    await expect(unpackToolpa(localHeader('notes.txt', 0))).rejects.toThrow(/ARTIFACT_UNKNOWN_FILE/);
    await expect(unpackToolpa(localHeader('graph.json', 2 * 1024 * 1024 * 1024))).rejects.toThrow(/ZIP_TOO_LARGE/);
    const epoch = new Date('1980-01-01T00:00:00Z');
    const floated = zipSync(
      {
        'toolpa.json': [strToU8('{"schemaVersion":1.5,"kind":"chain"}'), { level: 0, mtime: epoch }],
        'graph.json': [strToU8('{}'), { level: 0, mtime: epoch }],
        'verify.json': [strToU8('{}'), { level: 0, mtime: epoch }],
        'previews/fingerprint.json': [strToU8('{}'), { level: 0, mtime: epoch }],
      },
      { level: 0 },
    );
    await expect(unpackToolpa(floated)).rejects.toThrow(/ARTIFACT_FLOAT/);
  });
});