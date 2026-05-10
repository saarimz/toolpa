import { describe, expect, it } from "vitest";

import { getUploadedSample } from "@/lib/samples/storage";
import { persistUploadedSample, validateAudioFile } from "@/lib/samples/upload";

describe("sample upload", () => {
  it("rejects unsupported files", () => {
    expect(() =>
      validateAudioFile(new File(["x"], "notes.txt", { type: "text/plain" })),
    ).toThrow("Unsupported audio file type");
  });

  it("accepts audio extensions and persists records", async () => {
    const file = new File(["abc"], "break.wav", {
      type: "audio/wav",
      lastModified: 123,
    });

    const record = await persistUploadedSample(file, 1.5);

    expect(record.name).toBe("break.wav");
    expect(record.durationSec).toBe(1.5);
    await expect(getUploadedSample(record.id)).resolves.toMatchObject({
      name: "break.wav",
      size: 3,
    });
  });
});
