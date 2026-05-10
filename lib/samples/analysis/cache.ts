import { openDB, type DBSchema } from "idb";

import {
  SampleAnalysisSchema,
  SAMPLE_ANALYSIS_SCHEMA_VERSION,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";

const DB_NAME = "ai-daw-tools-analyses";
const DB_VERSION = 1;
const STORE_NAME = "analyses";

export type AnalysisRecord = {
  hash: string;
  analysis: SampleAnalysis;
  cached_at: number;
};

interface AnalysisDB extends DBSchema {
  analyses: {
    key: string;
    value: AnalysisRecord;
    indexes: {
      "by-cached-at": number;
    };
  };
}

function getDb() {
  return openDB<AnalysisDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "hash" });
      store.createIndex("by-cached-at", "cached_at");
    },
  });
}

export async function getCachedAnalysis(
  hash: string,
): Promise<SampleAnalysis | null> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, hash);
  if (!record) {
    return null;
  }

  if (record.analysis.schema_version !== SAMPLE_ANALYSIS_SCHEMA_VERSION) {
    await db.delete(STORE_NAME, hash);
    return null;
  }

  const parsed = SampleAnalysisSchema.safeParse(record.analysis);
  if (!parsed.success) {
    await db.delete(STORE_NAME, hash);
    return null;
  }

  return parsed.data;
}

export async function putCachedAnalysis(
  analysis: SampleAnalysis,
): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, {
    hash: analysis.source.sha256,
    analysis,
    cached_at: Date.now(),
  });
}

export async function deleteCachedAnalysis(hash: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, hash);
}

export async function listCachedAnalyses(): Promise<AnalysisRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_NAME, "by-cached-at");
}
