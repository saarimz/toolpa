import { strToU8, unzipSync, zipSync } from 'fflate';
import { canonicalize, hashChain, sha256Hex, type Chain } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { ArtifactError } from './artifact.ts';

const EPOCH = new Date('1980-01-01T00:00:00Z');
const MAX_ENTRY = 2 * 1024 * 1024 * 1024;

export interface PackedSample {
  sha256: string;
  bytes: Uint8Array;
}

export interface PackedToolpa {
  bytes: Uint8Array;
  contentId: string;
  graphHash: string;
  chain: Chain;
  parents: string[];
  name: string;
  title: string;
  seq: number;
  samples: PackedSample[];
}

interface FileEntry {
  sha256: string;
  size: number;
  type: string;
}

interface Manifest {
  schemaVersion: 1;
  kind: 'chain';
  name: string;
  title: string;
  version: { seq: number };
  parents: string[];
  engines: { elementary: string };
  files: Record<string, FileEntry>;
  license: 'GPL-3.0-or-later';
  assets: string[];
  status: 'draft';
  contentId?: string;
}

function zipOptions() {
  return { level: 0 as const, mtime: EPOCH };
}

function allowedName(name: string): boolean {
  return (
    name === 'toolpa.json' ||
    name === 'graph.json' ||
    name === 'verify.json' ||
    name === 'previews/fingerprint.json' ||
    /^samples\/[a-f0-9]{64}\.wav$/.test(name)
  );
}

export function assertZipSafe(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seen = new Set<string>();
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new ArtifactError('zip', 'zip local header is invalid');
    if (offset + 30 > bytes.byteLength) throw new ArtifactError('zip', 'zip local header is truncated');
    const flags = view.getUint16(offset + 6, true);
    const compressed = view.getUint32(offset + 18, true);
    const uncompressed = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (uncompressed >= MAX_ENTRY || compressed >= MAX_ENTRY) {
      throw new ArtifactError('ZIP_TOO_LARGE', 'ZIP_TOO_LARGE: an entry declares a size of at least 2 GB');
    }
    const nameStart = offset + 30;
    if (nameStart + nameLength > bytes.byteLength) throw new ArtifactError('zip', 'zip entry name is truncated');
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) {
      throw new ArtifactError('ZIP_SLIP', `ZIP_SLIP: ${name}`);
    }
    if (seen.has(name)) throw new ArtifactError('ZIP_DUPLICATE', `ZIP_DUPLICATE: ${name}`);
    seen.add(name);
    if (!allowedName(name)) throw new ArtifactError('ARTIFACT_UNKNOWN_FILE', `ARTIFACT_UNKNOWN_FILE: ${name}`);
    if ((flags & 0x8) !== 0) throw new ArtifactError('zip', 'zip data descriptors are not accepted');
    offset = nameStart + nameLength + extraLength + compressed;
  }
}

function assertNoFloat(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new ArtifactError('ARTIFACT_FLOAT', `ARTIFACT_FLOAT: ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoFloat(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertNoFloat(item, `${path}.${key}`);
  }
}

function manifestWithoutId(manifest: Manifest): Manifest {
  const { contentId: _contentId, ...rest } = manifest;
  return rest;
}

async function contentIdFor(manifest: Manifest): Promise<string> {
  return `tpa1:sha256:${await sha256Hex(canonicalize(manifestWithoutId(manifest)))}`;
}

export async function packToolpa(
  input: {
    chain: unknown;
    title: string;
    name: string;
    parents?: readonly string[];
    seq?: number;
    samples?: readonly PackedSample[];
  },
  trace?: Trace,
): Promise<PackedToolpa> {
  const span = trace?.span('artifact.pack', { title: input.title });
  try {
    const hashed = await hashChain(input.chain);
    const graphBytes = new TextEncoder().encode(hashed.canonical);
    const manifest: Manifest = {
      schemaVersion: 1,
      kind: 'chain',
      name: input.name,
      title: input.title,
      version: { seq: input.seq ?? 1 },
      parents: [...(input.parents ?? [])],
      engines: { elementary: '4.0.1' },
      files: {
        'graph.json': { sha256: await sha256Hex(graphBytes), size: graphBytes.byteLength, type: 'application/json' },
      },
      license: 'GPL-3.0-or-later',
      assets: [],
      status: 'draft',
    };
    const packedSamples = [...(input.samples ?? [])].sort((left, right) => (left.sha256 < right.sha256 ? -1 : left.sha256 > right.sha256 ? 1 : 0));
    const samplePayloads: Array<[string, Uint8Array]> = [];
    for (const sample of packedSamples) {
      if (!/^[a-f0-9]{64}$/.test(sample.sha256)) {
        throw new ArtifactError('sample', 'sample id must be 64 lowercase hex characters');
      }
      const actual = await sha256Hex(sample.bytes);
      if (actual !== sample.sha256) {
        throw new ArtifactError('ARTIFACT_HASH_MISMATCH', `ARTIFACT_HASH_MISMATCH: samples/${sample.sha256}.wav`);
      }
      const path = `samples/${sample.sha256}.wav`;
      manifest.files[path] = { sha256: actual, size: sample.bytes.byteLength, type: 'audio/wav' };
      manifest.assets.push(path);
      samplePayloads.push([path, sample.bytes]);
    }
    assertNoFloat(manifest, 'manifest');
    const contentId = await contentIdFor(manifest);
    const stored: Manifest = { ...manifest, contentId };
    const entries: Record<string, [Uint8Array, ReturnType<typeof zipOptions>]> = {
      'toolpa.json': [strToU8(canonicalize(stored)), zipOptions()],
      'graph.json': [graphBytes, zipOptions()],
      'previews/fingerprint.json': [strToU8(canonicalize({ graphHash: hashed.hash })), zipOptions()],
      'verify.json': [strToU8(canonicalize({ contentId, ok: true })), zipOptions()],
    };
    for (const [path, payload] of samplePayloads) entries[path] = [payload, zipOptions()];
    const bytes = zipSync(entries, { level: 0 });
    span?.end({ contentId, bytes: bytes.byteLength, ok: true });
    return {
      bytes,
      contentId,
      graphHash: hashed.hash,
      chain: hashed.chain,
      parents: manifest.parents,
      name: manifest.name,
      title: manifest.title,
      seq: manifest.version.seq,
      samples: packedSamples.map((sample) => ({ sha256: sample.sha256, bytes: sample.bytes })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof ArtifactError ? error.code : 'error';
    span?.fail({ code, message });
    throw error;
  }
}

export async function unpackToolpa(bytes: Uint8Array, trace?: Trace): Promise<PackedToolpa> {
  const span = trace?.span('artifact.unpack', { bytes: bytes.byteLength });
  try {
    assertZipSafe(bytes);
    const files = unzipSync(bytes);
    const manifestBytes = files['toolpa.json'];
    const graphBytes = files['graph.json'];
    if (!manifestBytes || !graphBytes) throw new ArtifactError('shape', 'toolpa.json and graph.json are required');
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Manifest;
    assertNoFloat(manifest, 'manifest');
    for (const [name, entry] of Object.entries(manifest.files)) {
      const payload = files[name];
      if (!payload) throw new ArtifactError('ARTIFACT_HASH_MISMATCH', `ARTIFACT_HASH_MISMATCH: ${name}`);
      const actual = await sha256Hex(payload);
      if (actual !== entry.sha256 || payload.byteLength !== entry.size) {
        throw new ArtifactError('ARTIFACT_HASH_MISMATCH', `ARTIFACT_HASH_MISMATCH: ${name}`);
      }
    }
    const expectedId = await contentIdFor(manifest);
    if (manifest.contentId !== expectedId) {
      throw new ArtifactError('ARTIFACT_HASH_MISMATCH', 'ARTIFACT_HASH_MISMATCH: toolpa.json');
    }
    if (!Array.isArray(manifest.parents) || manifest.parents.some((parent) => typeof parent !== 'string')) {
      throw new ArtifactError('parents', 'parents must be a list of strings');
    }
    if (typeof manifest.name !== 'string' || typeof manifest.title !== 'string') {
      throw new ArtifactError('shape', 'toolpa.json needs a name and a title');
    }
    if (!manifest.version || !Number.isInteger(manifest.version.seq)) {
      throw new ArtifactError('shape', 'toolpa.json version.seq must be an integer');
    }
    const samples: PackedSample[] = [];
    for (const name of Object.keys(files).sort()) {
      const match = /^samples\/([a-f0-9]{64})\.wav$/.exec(name);
      if (!match?.[1]) continue;
      const payload = files[name];
      const entry = manifest.files[name];
      if (!payload || !entry || entry.sha256 !== match[1]) {
        throw new ArtifactError('ARTIFACT_HASH_MISMATCH', `ARTIFACT_HASH_MISMATCH: ${name}`);
      }
      samples.push({ sha256: match[1], bytes: payload });
    }
    const hashed = await hashChain(JSON.parse(new TextDecoder().decode(graphBytes)));
    span?.end({ contentId: expectedId, ok: true });
    trace?.event('artifact.verify', { ok: true, contentId: expectedId });
    return {
      bytes,
      contentId: expectedId,
      graphHash: hashed.hash,
      chain: hashed.chain,
      parents: manifest.parents,
      name: manifest.name,
      title: manifest.title,
      seq: manifest.version.seq,
      samples,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof ArtifactError ? error.code : 'error';
    span?.fail({ code, message });
    throw error;
  }
}

export async function verifyToolpa(bytes: Uint8Array, trace?: Trace): Promise<PackedToolpa> {
  return unpackToolpa(bytes, trace);
}
