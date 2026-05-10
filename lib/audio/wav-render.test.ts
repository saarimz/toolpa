import { describe, expect, it } from "vitest";

import { encodeAudioBufferToWav } from "@/lib/audio/wav-render";

function createAudioBufferStub(samples: number[], sampleRate = 44100): AudioBuffer {
  return {
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

describe("wav rendering", () => {
  it("encodes an AudioBuffer as a PCM WAV file", () => {
    const wav = encodeAudioBufferToWav(createAudioBufferStub([0, 1, -1]));
    const view = new DataView(wav);
    const text = (offset: number, length: number) =>
      String.fromCharCode(
        ...Array.from({ length }, (_, index) => view.getUint8(offset + index)),
      );

    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(text(12, 4)).toBe("fmt ");
    expect(text(36, 4)).toBe("data");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
  });
});
