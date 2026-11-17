import type { Trace } from '@toolpa/trace';
import { sha256Hex } from '@toolpa/graph';
import { ArtifactError, type ArtifactStore, type SealedArtifact } from './artifact.ts';
import { OpfsStore } from './opfs.ts';
import { isZipToolpa, openStoredArtifact, zipForEnvelope } from './stored.ts';

export interface BlobBucket {
  readonly backend: 'opfs' | 'idb';
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export interface StorageIndex {
  put(record: { id: string; backend: 'opfs' | 'idb'; kind: 'artifact' | 'sample' }): Promise<void>;
  get(id: string): Promise<{ id: string; backend: 'opfs' | 'idb'; kind: 'artifact' | 'sample' } | null>;
  list(kind: 'artifact' | 'sample'): Promise<string[]>;
}

export class MemoryBucket implements BlobBucket {
  readonly backend: 'opfs' | 'idb';
  private readonly files = new Map<string, Uint8Array>();

  constructor(backend: 'opfs' | 'idb') {
    this.backend = backend;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    this.files.set(key, copy);
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.files.get(key) ?? null;
  }
}

export class MemoryIndex implements StorageIndex {
  private readonly records = new Map<string, { id: string; backend: 'opfs' | 'idb'; kind: 'artifact' | 'sample' }>();

  async put(record: { id: string; backend: 'opfs' | 'idb'; kind: 'artifact' | 'sample' }): Promise<void> {
    this.records.set(`${record.kind}:${record.id}`, record);
  }

  async get(id: string): Promise<{ id: string; backend: 'opfs' | 'idb'; kind: 'artifact' | 'sample' } | null> {
    return this.records.get(`artifact:${id}`) ?? this.records.get(`sample:${id}`) ?? null;
  }

  async list(kind: 'artifact' | 'sample'): Promise<string[]> {
    return [...this.records.values()].filter((record) => record.kind === kind).map((record) => record.id).sort();
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
  });
}

export function openToolpaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('toolpa', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('index')) db.createObjectStore('index', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
  });
}

export class IdbBucket implements BlobBucket {
  readonly backend = 'idb' as const;

  constructor(private readonly db: IDBDatabase) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const tx = this.db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put(copy, key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB write failed'));
    });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const tx = this.db.transaction('blobs', 'readonly');
    const value = await requestToPromise(tx.objectStore('blobs').get(key));
    return value instanceof Uint8Array ? value : null;
  }
}

export class IdbIndex implements StorageIndex {
  constructor(private readonly db: IDBDatabase) {}

  async put(record: { id: string; backend: 'opfs' | 'idb'; kind: 'artifact' | 'sample' }): Promise<void> {
    const tx = this.db.transaction('index', 'readwrite');
    tx.objectStore('index').put({ key: `${record.kind}:${record.id}`, ...record });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB index failed'));
    });
  }

  async get(id: string): Promise<{ id: string; backend: 'opfs' | 'idb'; kind: 'artifact' | 'sample' } | null> {
    const tx = this.db.transaction('index', 'readonly');
    const artifact = await requestToPromise(tx.objectStore('index').get(`artifact:${id}`));
    if (artifact && typeof artifact === 'object') return artifact as { id: string; backend: 'opfs' | 'idb'; kind: 'artifact' | 'sample' };
    const sampleTx = this.db.transaction('index', 'readonly');
    const sample = await requestToPromise(sampleTx.objectStore('index').get(`sample:${id}`));
    return sample && typeof sample === 'object' ? (sample as { id: string; backend: 'opfs' | 'idb'; kind: 'artifact' | 'sample' }) : null;
  }

  async list(kind: 'artifact' | 'sample'): Promise<string[]> {
    const tx = this.db.transaction('index', 'readonly');
    const rows = await requestToPromise(tx.objectStore('index').getAll());
    return (rows as { id: string; kind: string }[]).filter((row) => row.kind === kind).map((row) => row.id).sort();
  }
}

export class OpfsBucket implements BlobBucket {
  readonly backend = 'opfs' as const;

  constructor(private readonly store: OpfsStore) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const [dir, name] = splitKey(key);
    await this.store.writeFile(dir, name, bytes);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const [dir, name] = splitKey(key);
    return this.store.readFile(dir, name);
  }
}

function splitKey(key: string): [string, string] {
  const slash = key.indexOf('/');
  if (slash < 1) throw new ArtifactError('id', 'a storage key needs a directory');
  return [key.slice(0, slash), key.slice(slash + 1)];
}

async function tryOpfs(trace?: Trace): Promise<OpfsStore | null> {
  const storage = (globalThis as { navigator?: { storage?: { getDirectory?: () => Promise<FileSystemDirectoryHandle> } } }).navigator?.storage;
  if (!storage?.getDirectory) return null;
  try {
    return await Promise.race([
      OpfsStore.open(trace),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
  } catch {
    return null;
  }
}

export class DurableStore implements ArtifactStore {
  readonly backend: 'opfs' | 'idb';

  constructor(
    private readonly blobs: BlobBucket,
    private readonly index: StorageIndex,
    private readonly trace?: Trace,
  ) {
    this.backend = blobs.backend;
  }

  static async open(trace?: Trace): Promise<DurableStore> {
    const db = await openToolpaDb();
    const opfs = await tryOpfs(trace);
    const blobs = opfs ? new OpfsBucket(opfs) : new IdbBucket(db);
    const store = new DurableStore(blobs, new IdbIndex(db), trace);
    trace?.event('storage.backend', { backend: store.backend });
    return store;
  }

  async save(sealed: SealedArtifact): Promise<void> {
    const bytes = isZipToolpa(sealed.bytes) ? sealed.bytes : await zipForEnvelope(sealed, this.trace);
    const checked = await openStoredArtifact(bytes, this.trace);
    if (checked.id !== sealed.id) throw new ArtifactError('id', 'stored bytes do not match the artifact id');
    await this.blobs.put(`artifacts/${sealed.id}.toolpa`, bytes);
    await this.index.put({ id: sealed.id, backend: this.backend, kind: 'artifact' });
    this.trace?.event('artifact.saved', { id: sealed.id, bytes: bytes.byteLength, store: this.backend });
    this.trace?.event('artifact.save', { id: sealed.id, bytes: bytes.byteLength, store: this.backend });
  }

  async load(id: string): Promise<SealedArtifact | null> {
    const record = await this.index.get(id);
    if (!record || record.kind !== 'artifact' || record.backend !== this.backend) return null;
    const bytes = await this.blobs.get(`artifacts/${id}.toolpa`);
    if (!bytes) return null;
    const opened = await openStoredArtifact(bytes, this.trace);
    if (opened.id !== id) throw new ArtifactError('id', 'stored bytes do not match the artifact id');
    this.trace?.event('artifact.loaded', { id, store: this.backend });
    this.trace?.event('artifact.load', { id, store: this.backend });
    return opened;
  }

  async saveSample(sha256: string, bytes: Uint8Array): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new ArtifactError('sample', 'sample id must be 64 lowercase hex characters');
    const actual = await sha256Hex(bytes);
    if (actual !== sha256) throw new ArtifactError('sample', 'sample bytes do not match their sha256');
    await this.blobs.put(`samples/${sha256}`, bytes);
    await this.index.put({ id: sha256, backend: this.backend, kind: 'sample' });
  }

  async loadSample(sha256: string): Promise<Uint8Array | null> {
    const record = await this.index.get(sha256);
    if (!record || record.kind !== 'sample') return null;
    return this.blobs.get(`samples/${sha256}`);
  }

  async list(): Promise<string[]> {
    return this.index.list('artifact');
  }
}
