import { describe, expect, it, vi } from "vitest";

import { createPattern, createStep, createTrack } from "@/lib/pattern/schema";

const resolverMock = vi.hoisted(() => ({
  resolveSample: vi.fn(),
}));

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: resolverMock.resolveSample,
}));

describe("sample render de-click envelope", () => {
  it("ramps a discontinuous sample in and out in the browser audio engine", async () => {
    const sampleRate = 44100;
    const source = new OfflineAudioContext(1, sampleRate, sampleRate).createBuffer(
      1,
      sampleRate,
      sampleRate,
    );
    source.getChannelData(0).fill(1);
    resolverMock.resolveSample.mockResolvedValue({
      audioBuffer: source,
      id: "sample",
      name: "sample",
      origin: "library",
    });
    const { renderPatternToAudioBuffer } = await import("@/lib/audio/wav-render");

    const rendered = await renderPatternToAudioBuffer(
      createPattern({
        id: "declick-render",
        name: "declick render",
        bpm: 120,
        bars: 1,
        stepsPerBar: 16,
        tracks: [
          createTrack({
            id: "track",
            name: "track",
            sampleId: "sample",
            steps: Array.from({ length: 16 }, (_, index) =>
              createStep({ active: index === 0, slot: 0 }),
            ),
          }),
        ],
      }),
      { declickPreset: "tight", sampleRate, sliceCount: 1 },
    );

    const data = rendered.getChannelData(0);
    expect(Math.abs(data[0] ?? 0)).toBeLessThan(0.001);
    expect(Math.abs(data[Math.floor(sampleRate * 0.01)] ?? 0)).toBeGreaterThan(0.01);
    expect(Math.abs(data[Math.floor(sampleRate * 0.2)] ?? 0)).toBeLessThan(0.001);
  });
});
