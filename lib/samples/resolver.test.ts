import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearResolvedSampleCache, resolveSample } from "@/lib/samples/resolver";
import { saveUploadedSample } from "@/lib/samples/storage";

describe("sample resolver", () => {
  beforeEach(() => {
    clearResolvedSampleCache();
    vi.stubGlobal(
      "AudioContext",
      class {
        decodeAudioData = vi.fn(async () => ({ duration: 1 }));
      },
    );
  });

  it("resolves bundled samples through fetch and AudioContext", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    );

    await expect(resolveSample("library:jungle/let-there-break")).resolves.toMatchObject({
      id: "library:jungle/let-there-break",
      name: "Let There Break",
      origin: "library",
      audioBuffer: { duration: 1 },
    });
  });

  it("resolves uploaded samples from IndexedDB", async () => {
    await saveUploadedSample({
      id: "upload:test",
      name: "upload.wav",
      type: "audio/wav",
      size: 3,
      lastModified: 1,
      createdAt: 2,
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    });

    await expect(resolveSample("upload:test")).resolves.toMatchObject({
      id: "upload:test",
      name: "upload.wav",
      origin: "upload",
      audioBuffer: { duration: 1 },
    });
  });
});
