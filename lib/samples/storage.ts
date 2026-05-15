import { openDB, type DBSchema } from "idb";

const DB_NAME = "toolpa-js-samples";
const DB_VERSION = 1;
const STORE_NAME = "uploads";

export type UploadedSampleRecord = {
  id: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  arrayBuffer: ArrayBuffer;
  durationSec?: number;
  createdAt: number;
};

interface SampleDB extends DBSchema {
  uploads: {
    key: string;
    value: UploadedSampleRecord;
    indexes: {
      "by-created-at": number;
    };
  };
}

function getDb() {
  return openDB<SampleDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("by-created-at", "createdAt");
    },
  });
}

async function withDb<Result>(
  operation: (db: Awaited<ReturnType<typeof getDb>>) => Promise<Result>,
): Promise<Result> {
  const db = await getDb();
  try {
    return await operation(db);
  } finally {
    db.close();
  }
}

export async function saveUploadedSample(
  record: UploadedSampleRecord,
): Promise<UploadedSampleRecord> {
  await withDb((db) => db.put(STORE_NAME, record));
  return record;
}

export async function getUploadedSample(
  id: string,
): Promise<UploadedSampleRecord | null> {
  return (await withDb((db) => db.get(STORE_NAME, id))) ?? null;
}

export async function listUploadedSamples(): Promise<UploadedSampleRecord[]> {
  const records = await withDb((db) => db.getAllFromIndex(STORE_NAME, "by-created-at"));
  return records.sort((left, right) => right.createdAt - left.createdAt);
}

export async function deleteUploadedSample(id: string): Promise<void> {
  await withDb((db) => db.delete(STORE_NAME, id));
}

export function createUploadedSampleId(file: Pick<File, "name" | "size" | "lastModified">) {
  const slug = file.name
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `upload:${slug}-${file.size}-${file.lastModified}`;
}
