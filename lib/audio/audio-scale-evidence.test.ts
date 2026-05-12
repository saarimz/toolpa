import { describe, expect, it } from "vitest";

import { analyzeAudioBufferScaleEvidence } from "@/lib/audio/audio-scale-evidence";

const SAMPLE_RATE = 44100;

describe("analyzeAudioBufferScaleEvidence", () => {
  it("extracts prominent pitch classes from tonal rendered audio", () => {
    const audioBuffer = createAudioBufferStub(
      generateChord([523.25, 659.25, 783.99], 1.5),
    );

    const evidence = analyzeAudioBufferScaleEvidence(audioBuffer, {
      label: "test render",
    });

    expect(evidence?.pitchClasses).toEqual(expect.arrayContaining([0, 4, 7]));
    expect(evidence?.summary).toContain("test render");
    expect(evidence?.summary).toContain("prominent");
  });

  it("returns null for silent audio", () => {
    const audioBuffer = createAudioBufferStub(new Float32Array(SAMPLE_RATE));

    expect(analyzeAudioBufferScaleEvidence(audioBuffer)).toBeNull();
  });
});

function generateChord(frequencies: number[], durationSec: number) {
  const length = Math.floor(durationSec * SAMPLE_RATE);
  const samples = new Float32Array(length);
  const amplitude = 0.3 / frequencies.length;
  for (const frequency of frequencies) {
    for (let index = 0; index < length; index++) {
      samples[index] +=
        amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
    }
  }
  return samples;
}

function createAudioBufferStub(samples: Float32Array): AudioBuffer {
  return {
    duration: samples.length / SAMPLE_RATE,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
    copyFromChannel: (destination: Float32Array) => {
      destination.set(samples.slice(0, destination.length));
    },
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}
