import { canonicalize, parseChain, sha256Hex, type Chain } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';

export const ARTIFACT_FORMAT = 'toolpa' as const;
export const ARTIFACT_VERSION = 1 as const;

export class ArtifactError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ArtifactError';
  }
}

export interface ToolpaArtifact {
  format: typeof ARTIFACT_FORMAT;
  version: typeof ARTIFACT_VERSION;
  kind: 'chain';
  parents: string[];
  chain: Chain;
}

export interface SealedArtifact {
  id: string;
  bytes: Uint8Array;
  artifact: ToolpaArtifact;
}

function parentList(parents: readonly string[] | undefined): string[] {
  const list = [...(parents ?? [])];
  for (const parent of list) {
    if (!/^[a-f0-9]{64}$/.test(parent)) throw new ArtifactError('parent', 'parent ids must be 64 lowercase hex characters');
  }
  return list;
}

export async function sealArtifact(
  input: { chain: unknown; parents?: readonly string[] },
  trace?: Trace,
): Promise<SealedArtifact> {
  const artifact: ToolpaArtifact = {
    format: ARTIFACT_FORMAT,
    version: ARTIFACT_VERSION,
    kind: 'chain',
    parents: parentList(input.parents),
    chain: parseChain(input.chain),
  };
  const bytes = new TextEncoder().encode(canonicalize(artifact));
  const id = await sha256Hex(bytes);
  trace?.event('artifact.sealed', { id, kind: artifact.kind, parents: artifact.parents.length });
  return { id, bytes, artifact };
}

export async function openArtifact(bytes: Uint8Array, trace?: Trace): Promise<SealedArtifact> {
  const id = await sha256Hex(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ArtifactError('json', 'artifact is not JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new ArtifactError('shape', 'artifact must be an object');
  const record = parsed as Record<string, unknown>;
  if (record.format !== ARTIFACT_FORMAT) throw new ArtifactError('format', 'format must be toolpa');
  if (record.version !== ARTIFACT_VERSION) throw new ArtifactError('version', 'version must be 1');
  if (record.kind !== 'chain') throw new ArtifactError('kind', 'kind must be chain');
  if (!Array.isArray(record.parents)) throw new ArtifactError('parents', 'parents must be a list');
  const artifact: ToolpaArtifact = {
    format: ARTIFACT_FORMAT,
    version: ARTIFACT_VERSION,
    kind: 'chain',
    parents: parentList(record.parents as string[]),
    chain: parseChain(record.chain),
  };
  const canonical = new TextEncoder().encode(canonicalize(artifact));
  if (canonical.length !== bytes.length || canonical.some((byte, index) => byte !== bytes[index])) {
    throw new ArtifactError('canonical', 'artifact bytes are not canonical');
  }
  trace?.event('artifact.opened', { id, kind: 'chain', parents: artifact.parents.length });
  return { id, bytes, artifact };
}

export interface ArtifactStore {
  save(sealed: SealedArtifact): Promise<void>;
  load(id: string): Promise<SealedArtifact | null>;
  saveSample(sha256: string, bytes: Uint8Array): Promise<void>;
  loadSample(sha256: string): Promise<Uint8Array | null>;
}

export class MemoryStore implements ArtifactStore {
  private readonly artifacts = new Map<string, Uint8Array>();
  private readonly samples = new Map<string, Uint8Array>();

  constructor(private readonly trace?: Trace) {}

  async save(sealed: SealedArtifact): Promise<void> {
    this.artifacts.set(sealed.id, sealed.bytes);
    this.trace?.event('artifact.saved', { id: sealed.id, bytes: sealed.bytes.byteLength, store: 'memory' });
  }

  async load(id: string): Promise<SealedArtifact | null> {
    const bytes = this.artifacts.get(id);
    if (!bytes) return null;
    const opened = await openArtifact(bytes, this.trace);
    if (opened.id !== id) throw new ArtifactError('id', 'stored bytes do not match the artifact id');
    this.trace?.event('artifact.loaded', { id, store: 'memory' });
    return opened;
  }

  async saveSample(sha256: string, bytes: Uint8Array): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new ArtifactError('sample', 'sample id must be 64 lowercase hex characters');
    const actual = await sha256Hex(bytes);
    if (actual !== sha256) throw new ArtifactError('sample', 'sample bytes do not match their sha256');
    this.samples.set(sha256, bytes);
  }

  async loadSample(sha256: string): Promise<Uint8Array | null> {
    return this.samples.get(sha256) ?? null;
  }
}

export async function lineage(store: ArtifactStore, id: string): Promise<string[]> {
  const seen = new Set<string>();
  const ordered: string[] = [];
  async function visit(current: string): Promise<void> {
    if (seen.has(current)) return;
    seen.add(current);
    ordered.push(current);
    const sealed = await store.load(current);
    if (!sealed) throw new ArtifactError('missing', `missing artifact ${current}`);
    for (const parent of sealed.artifact.parents) await visit(parent);
  }
  await visit(id);
  return ordered;
}
