import { beforeEach, describe, expect, it } from "vitest";

import {
  createUploadedSampleId,
  deleteUploadedSample,
  getUploadedSample,
  listUploadedSamples,
  saveUploadedSample,
} from "@/lib/samples/storage";

describe("uploaded sample storage", () => {
  beforeEach(async () => {
    const indexedDB = globalThis.indexedDB;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("ai-daw-tools-samples");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });

  it("stores, lists, and deletes uploaded sample records", async () => {
    const record = {
      id: "upload:test",
      name: "test.wav",
      type: "audio/wav",
      size: 4,
      lastModified: 123,
      arrayBuffer: new ArrayBuffer(4),
      durationSec: 1,
      createdAt: 456,
    };

    await saveUploadedSample(record);
    expect(await getUploadedSample(record.id)).toMatchObject({
      id: record.id,
      name: record.name,
    });
    expect(await listUploadedSamples()).toHaveLength(1);

    await deleteUploadedSample(record.id);
    expect(await getUploadedSample(record.id)).toBeNull();
  });

  it("creates deterministic upload ids", () => {
    const file = new File(["test"], "My Break.wav", {
      type: "audio/wav",
      lastModified: 10,
    });

    expect(createUploadedSampleId(file)).toBe("upload:my-break-4-10");
  });
});
