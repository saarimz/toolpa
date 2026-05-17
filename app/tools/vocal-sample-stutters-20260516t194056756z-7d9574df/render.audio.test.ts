import { describe, expect, it, vi } from "vitest";

import { analyzeAudioBuffer } from "@/lib/audio/offline-analysis";
import { defaultDocument, renderOffline } from "./render";

const resolverMock = vi.hoisted(() => ({ resolveSample: vi.fn() }));

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: resolverMock.resolveSample,
}));

function makeGateSample(sampleRate = 44100): AudioBuffer {
  const context = new OfflineAudioContext(1, sampleRate, sampleRate);
  const buffer = context.createBuffer(1, sampleRate, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 0.35;
  }
  return buffer;
}

describe("vocal-sample-stutters-20260516t194056756z-7d9574df offline renderer", () => {
  it("produces audible, finite, unclipped audio for the L2 audio gate", async () => {
    resolverMock.resolveSample.mockResolvedValue({
      audioBuffer: makeGateSample(),
      id: "vocal-sample-stutters-20260516t194056756z-7d9574df-audio-gate-sample",
      name: "audio gate sample",
      origin: "library",
    });

    const buffer = await renderOffline(defaultDocument, 1);
    const analysis = analyzeAudioBuffer(buffer, {
      expectedDurationSec: 1,
      maxPeak: 1.01,
    });

    expect(analysis.ok, analysis.reasons.join("\n")).toBe(true);
    expect(analysis.rms).toBeGreaterThan(1e-4);
  });
});
