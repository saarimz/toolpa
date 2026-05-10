import { describe, expect, it, vi } from "vitest";

import { detectBpm } from "@/lib/audio/analysis";

describe("detectBpm", () => {
  it("normalizes detector output", async () => {
    const detector = vi.fn().mockResolvedValue({ bpm: 160, offset: 0.01, tempo: 159.8 });

    await expect(detectBpm({} as AudioBuffer, detector)).resolves.toEqual({
      bpm: 160,
      offset: 0.01,
      tempo: 159.8,
    });
  });
});
