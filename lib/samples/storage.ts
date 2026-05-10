import { openDB, type DBSchema } from "idb";

const DB_NAME = "ai-daw-tools-samples";
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

export async function saveUploadedSample(
  record: UploadedSampleRecord,
): Promise<UploadedSampleRecord> {
  const db = await getDb();
  await db.put(STORE_NAME, record);
  return record;
}

export async function getUploadedSample(
  id: string,
): Promise<UploadedSampleRecord | null> {
  const db = await getDb();
  return (await db.get(STORE_NAME, id)) ?? null;
}

export async function listUploadedSamples(): Promise<UploadedSampleRecord[]> {
  const db = await getDb();
  const records = await db.getAllFromIndex(STORE_NAME, "by-created-at");
  return records.sort((left, right) => right.createdAt - left.createdAt);
}

export async function deleteUploadedSample(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export function createUploadedSampleId(file: Pick<File, "name" | "size" | "lastModified">) {
  const slug = file.name
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `upload:${slug}-${file.size}-${file.lastModified}`;
}
