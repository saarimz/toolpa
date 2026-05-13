import { describe, expect, it } from "vitest";

import { analyzeAudioBuffer } from "@/lib/audio/offline-analysis";
import {
  createSubharmonicLayer,
  getStretchRenderInfo,
  renderTimeStretchToAudioBuffer,
} from "@/app/tools/time-stretch/lib/render";
import {
  DEFAULT_TIME_STRETCH_PATCH,
  getTargetDurationSec,
} from "@/app/tools/time-stretch/lib/schema";

describe("time stretch render", () => {
  it("renders an exact bar-length buffer with finite audible samples", async () => {
    const source = makeAudioBuffer({
      channels: [sine(440, 0.5, 4000)],
      sampleRate: 4000,
    });
    const patch = {
      ...DEFAULT_TIME_STRETCH_PATCH,
      bpm: 120,
      mode: "granular-smear" as const,
      octaveDownMix: 0,
      spectralBlur: 0.2,
      subharmonicMix: 0,
      targetBars: 1,
      texture: 0.15,
      windowMs: 40,
    };
    const rendered = await renderTimeStretchToAudioBuffer(source, patch, {
      createAudioBuffer: makeAudioBufferFactory(),
      maxDurationSec: 10,
    });
    const expectedDurationSec = getTargetDurationSec(patch);

    expect(rendered.length).toBe(Math.ceil(expectedDurationSec * source.sampleRate));
    expect(
      analyzeAudioBuffer(rendered, {
        expectedDurationSec,
        maxPeak: 1.01,
        minRms: 1e-5,
      }),
    ).toMatchObject({
      hasNaN: false,
      ok: true,
    });
  });

  it("uses target bars and source duration to calculate stretch ratio", () => {
    const info = getStretchRenderInfo(
      { duration: 1, sampleRate: 48000 },
      { bpm: 120, targetBars: 8 },
    );

    expect(info.targetDurationSec).toBe(16);
    expect(info.stretchRatio).toBe(16);
    expect(info.targetLength).toBe(768000);
  });

  it("adds a measurable octave-divider subharmonic layer", () => {
    const input = sine(220, 1, 2000);
    const layer = createSubharmonicLayer(input, 2000, 0.75);

    expect(rms(layer)).toBeGreaterThan(0.01);
    expect(countPositiveZeroCrossings(layer)).toBeLessThan(
      countPositiveZeroCrossings(input),
    );
  });

  it("bakes spectral erosion into the rendered performance over time", async () => {
    const source = makeAudioBuffer({
      channels: [layeredTone(120, 1400, 1, 4000)],
      sampleRate: 4000,
    });
    const patch = {
      ...DEFAULT_TIME_STRETCH_PATCH,
      bpm: 240,
      degradation: 1,
      dropoutAmount: 0,
      filterDrift: 1,
      mode: "granular-smear" as const,
      movementDepth: 1,
      noiseAmount: 0,
      octaveDownMix: 0,
      performanceMode: "spectral-erosion" as const,
      subMotion: 0,
      subharmonicMix: 0,
      targetBars: 1,
      texture: 0,
      windowMs: 40,
      wowFlutter: 0,
    };

    const rendered = await renderTimeStretchToAudioBuffer(source, patch, {
      createAudioBuffer: makeAudioBufferFactory(),
      maxDurationSec: 4,
    });
    const output = rendered.getChannelData(0);

    expect(averageDerivative(output.slice(Math.floor(output.length * 0.7)))).toBeLessThan(
      averageDerivative(output.slice(0, Math.floor(output.length * 0.3))),
    );
  });
});

function makeAudioBuffer({
  channels,
  sampleRate,
}: {
  channels: Float32Array[];
  sampleRate: number;
}): AudioBuffer {
  const length = channels[0]?.length ?? 0;
  return {
    duration: length / sampleRate,
    getChannelData: (channel: number) => channels[channel] ?? channels[0] ?? new Float32Array(),
    length,
    numberOfChannels: channels.length,
    sampleRate,
  } as unknown as AudioBuffer;
}

function makeAudioBufferFactory() {
  return (numberOfChannels: number, length: number, sampleRate: number) => {
    const channels = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    );
    return makeAudioBuffer({ channels, sampleRate });
  };
}

function sine(frequency: number, durationSec: number, sampleRate: number) {
  const length = Math.ceil(durationSec * sampleRate);
  const data = new Float32Array(length);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.5;
  }
  return data;
}

function layeredTone(lowFrequency: number, highFrequency: number, durationSec: number, sampleRate: number) {
  const length = Math.ceil(durationSec * sampleRate);
  const data = new Float32Array(length);
  for (let index = 0; index < data.length; index += 1) {
    data[index] =
      Math.sin((2 * Math.PI * lowFrequency * index) / sampleRate) * 0.28 +
      Math.sin((2 * Math.PI * highFrequency * index) / sampleRate) * 0.22;
  }
  return data;
}

function rms(data: Float32Array) {
  let sumSquares = 0;
  for (const value of data) {
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares / Math.max(1, data.length));
}

function countPositiveZeroCrossings(data: Float32Array) {
  let crossings = 0;
  let previous = data[0] ?? 0;
  for (const value of data) {
    if (previous <= 0 && value > 0) {
      crossings += 1;
    }
    previous = value;
  }
  return crossings;
}

function averageDerivative(data: Float32Array) {
  let sum = 0;
  for (let index = 1; index < data.length; index += 1) {
    sum += Math.abs((data[index] ?? 0) - (data[index - 1] ?? 0));
  }
  return sum / Math.max(1, data.length - 1);
}
