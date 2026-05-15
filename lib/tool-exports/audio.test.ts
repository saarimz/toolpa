import { describe, expect, it } from "vitest";

import {
  WAV_EXPORT_TARGET_PEAK,
} from "@/lib/audio/wav-render";
import { createWavExportArtifact } from "@/lib/tool-exports/audio";

describe("createWavExportArtifact", () => {
  it("normalizes WAV bytes and evidence to the export peak target", () => {
    const artifact = createWavExportArtifact({
      audioBuffer: createAudioBufferStub([0, 0.05, -0.1]),
      filename: "quiet.wav",
      source: {
        document: { id: "quiet" },
        documentId: "quiet",
        documentKind: "test-audio",
        schemaVersion: 1,
        toolSlug: "test-tool",
      },
    });

    const view = new DataView(
      artifact.bytes.buffer,
      artifact.bytes.byteOffset,
      artifact.bytes.byteLength,
    );
    const pcmPeak = Math.max(
      Math.abs(view.getInt16(44, true)),
      Math.abs(view.getInt16(46, true)),
      Math.abs(view.getInt16(48, true)),
    );

    expect(artifact.kind).toBe("audio/wav");
    expect(artifact.evidence.peak).toBeCloseTo(WAV_EXPORT_TARGET_PEAK, 6);
    expect(artifact.evidence.clippedRatio).toBe(0);
    expect(pcmPeak / 0x8000).toBeCloseTo(WAV_EXPORT_TARGET_PEAK, 3);
  });
});

function createAudioBufferStub(samples: number[], sampleRate = 44100): AudioBuffer {
  const data = Float32Array.from(samples);
  return {
    duration: samples.length / sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}
