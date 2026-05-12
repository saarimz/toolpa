import { describe, expect, it, vi } from "vitest";

import { createPattern, createStep, createTrack } from "@/lib/pattern/schema";

const resolverMock = vi.hoisted(() => ({
  resolveSample: vi.fn(),
}));

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: resolverMock.resolveSample,
}));

describe("golden: intelligence-sampler offline render", () => {
  it("renders a deterministic pattern to a stable WAV hash", async () => {
    const sampleRate = 44100;
    const sampleLength = sampleRate;
    const sampleBuffer = new OfflineAudioContext(1, sampleLength, sampleRate).createBuffer(
      1,
      sampleLength,
      sampleRate,
    );
    const channel = sampleBuffer.getChannelData(0);
    for (let index = 0; index < sampleLength; index += 1) {
      const t = index / sampleRate;
      channel[index] = 0.5 * Math.sin(2 * Math.PI * 440 * t);
      if (index === Math.floor(sampleRate / 2)) {
        channel[index] += 0.4;
      }
    }

    resolverMock.resolveSample.mockResolvedValue({
      audioBuffer: sampleBuffer,
      id: "golden-sample",
      name: "golden-sample",
      origin: "library",
    });

    const pattern = createPattern({
      id: "golden-intelligence-sampler",
      name: "golden-intelligence-sampler",
      bpm: 120,
      bars: 1,
      stepsPerBar: 16,
      tracks: [
        createTrack({
          id: "golden-track",
          name: "golden-track",
          sampleId: "golden-sample",
          slot: 0,
          steps: Array.from({ length: 16 }, (_, index) =>
            createStep({
              active: [0, 4, 6, 10, 14].includes(index),
              velocity: index === 6 ? 0.7 : 1,
              slot: index % 8,
            }),
          ),
        }),
      ],
    });

    const { renderPatternToAudioBuffer, encodeAudioBufferToWav } = await import(
      "@/lib/audio/wav-render"
    );
    const rendered = await renderPatternToAudioBuffer(pattern, {
      declickPreset: "balanced",
      sampleRate,
      sliceCount: 8,
    });
    const wav = encodeAudioBufferToWav(rendered);
    const digestBuffer = await crypto.subtle.digest("SHA-256", wav);
    const hex = Array.from(new Uint8Array(digestBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    expect(hex).toMatchInlineSnapshot(`"84019d340ae3481870b842aade94f0953d4181e482571b3683ff6ce3bc6136c4"`);
  });
});
