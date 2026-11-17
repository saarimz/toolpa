import type { Trace } from '@toolpa/trace';
import { sha256Hex } from '@toolpa/graph';
import { ArtifactError, type ArtifactStore, type SealedArtifact } from './artifact.ts';
import { isZipToolpa, openStoredArtifact, zipForEnvelope } from './stored.ts';

function missing(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

export class OpfsStore implements ArtifactStore {
  private constructor(
    private readonly root: FileSystemDirectoryHandle,
    private readonly trace?: Trace,
  ) {}

  static async open(trace?: Trace): Promise<OpfsStore> {
    const root = await navigator.storage.getDirectory();
    const toolpa = await root.getDirectoryHandle('toolpa', { create: true });
    return new OpfsStore(toolpa, trace);
  }

  async save(sealed: SealedArtifact): Promise<void> {
    const bytes = isZipToolpa(sealed.bytes) ? sealed.bytes : await zipForEnvelope(sealed, this.trace);
    const checked = await openStoredArtifact(bytes, this.trace);
    if (checked.id !== sealed.id) throw new ArtifactError('id', 'stored bytes do not match the artifact id');
    await this.writeFile('artifacts', `${sealed.id}.toolpa`, bytes);
    this.trace?.event('artifact.saved', { id: sealed.id, bytes: bytes.byteLength, store: 'opfs' });
    this.trace?.event('artifact.save', { id: sealed.id, bytes: bytes.byteLength, store: 'opfs' });
  }

  async load(id: string): Promise<SealedArtifact | null> {
    const bytes = await this.readFile('artifacts', `${id}.toolpa`);
    if (!bytes) return null;
    const opened = await openStoredArtifact(bytes, this.trace);
    if (opened.id !== id) throw new ArtifactError('id', 'stored bytes do not match the artifact id');
    this.trace?.event('artifact.loaded', { id, store: 'opfs' });
    this.trace?.event('artifact.load', { id, store: 'opfs' });
    return opened;
  }

  async saveSample(sha256: string, bytes: Uint8Array): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new ArtifactError('sample', 'sample id must be 64 lowercase hex characters');
    const actual = await sha256Hex(bytes);
    if (actual !== sha256) throw new ArtifactError('sample', 'sample bytes do not match their sha256');
    await this.writeFile('samples', sha256, bytes);
  }

  async loadSample(sha256: string): Promise<Uint8Array | null> {
    return this.readFile('samples', sha256);
  }

  async list(): Promise<string[]> {
    try {
      const dir = await this.root.getDirectoryHandle('artifacts');
      const ids: string[] = [];
      for await (const [name] of dir.entries()) {
        if (name.endsWith('.toolpa')) ids.push(name.slice(0, -'.toolpa'.length));
      }
      return ids.sort();
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
  }

  async writeFile(dirName: string, fileName: string, bytes: Uint8Array): Promise<void> {
    const dir = await this.root.getDirectoryHandle(dirName, { create: true });
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await writable.write(copy);
    await writable.close();
  }

  async readFile(dirName: string, fileName: string): Promise<Uint8Array | null> {
    try {
      const dir = await this.root.getDirectoryHandle(dirName);
      const handle = await dir.getFileHandle(fileName);
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }
}
