import { describe, expect, it } from "vitest";

import {
  decodeWavInNode,
  downmixToMono,
} from "@/lib/samples/analysis/pipeline/decode";

function buildWav16BitMono(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index++) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const intValue = Math.round(clamped * 0x7fff);
    view.setInt16(44 + index * 2, intValue, true);
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index++) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

describe("decodeWavInNode", () => {
  it("decodes a 16-bit PCM mono WAV round-trip", () => {
    const sampleRate = 22050;
    const sine = new Float32Array(1024);
    for (let index = 0; index < sine.length; index++) {
      sine[index] = 0.5 * Math.sin((2 * Math.PI * 440 * index) / sampleRate);
    }
    const wav = buildWav16BitMono(sine, sampleRate);
    const decoded = decodeWavInNode(wav);

    expect(decoded.sampleRate).toBe(sampleRate);
    expect(decoded.channels).toHaveLength(1);
    expect(decoded.channels[0].length).toBe(sine.length);
    expect(decoded.durationSec).toBeCloseTo(sine.length / sampleRate, 4);

    for (let index = 0; index < sine.length; index += 64) {
      expect(decoded.channels[0][index]).toBeCloseTo(sine[index], 3);
    }
  });

  it("rejects non-RIFF buffers", () => {
    const garbage = new ArrayBuffer(100);
    expect(() => decodeWavInNode(garbage)).toThrow();
  });
});

describe("downmixToMono", () => {
  it("returns the only channel when mono", () => {
    const channel = new Float32Array([0.1, -0.2, 0.3]);
    expect(downmixToMono([channel])).toBe(channel);
  });

  it("averages multiple channels", () => {
    const left = new Float32Array([1, 0, -1]);
    const right = new Float32Array([0, 1, 1]);
    const mono = downmixToMono([left, right]);
    expect(Array.from(mono)).toEqual([0.5, 0.5, 0]);
  });
});
