import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";

const oscillatorStarts: number[] = [];
const oscillatorStops: number[] = [];
const gainEvents: unknown[] = [];
let limiterConnections = 0;

function createAudioParam() {
  return {
    cancelScheduledValues: vi.fn((...args: unknown[]) =>
      gainEvents.push(["cancel", ...args]),
    ),
    linearRampToValueAtTime: vi.fn((...args: unknown[]) =>
      gainEvents.push(["linear", ...args]),
    ),
    setValueAtTime: vi.fn((...args: unknown[]) => gainEvents.push(["set", ...args])),
  };
}

function createAudioNode() {
  return {
    connect: vi.fn(),
  };
}

function createAudioBufferStub(duration = 1): AudioBuffer {
  return {
    duration,
    length: 16,
    numberOfChannels: 2,
    sampleRate: 44100,
    getChannelData: () => new Float32Array(16),
  } as unknown as AudioBuffer;
}

describe("synth wav rendering", () => {
  beforeEach(() => {
    oscillatorStarts.length = 0;
    oscillatorStops.length = 0;
    gainEvents.length = 0;
    limiterConnections = 0;

    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        destination = {};

        constructor(
          readonly channels: number,
          readonly length: number,
          readonly sampleRate: number,
        ) {}

        createBiquadFilter() {
          return {
            ...createAudioNode(),
            Q: createAudioParam(),
            frequency: createAudioParam(),
            type: "lowpass",
          };
        }

        createDynamicsCompressor() {
          const compressor = {
            attack: createAudioParam(),
            connect: vi.fn(() => {
              limiterConnections += 1;
            }),
            knee: createAudioParam(),
            ratio: createAudioParam(),
            release: createAudioParam(),
            threshold: createAudioParam(),
          };
          return compressor;
        }

        createGain() {
          return {
            ...createAudioNode(),
            gain: createAudioParam(),
          };
        }

        createOscillator() {
          return {
            ...createAudioNode(),
            detune: createAudioParam(),
            frequency: createAudioParam(),
            setPeriodicWave: vi.fn(),
            start: vi.fn((time: number) => oscillatorStarts.push(time)),
            stop: vi.fn((time: number) => oscillatorStops.push(time)),
          };
        }

        createPeriodicWave() {
          return {};
        }

        createStereoPanner() {
          return {
            ...createAudioNode(),
            pan: createAudioParam(),
          };
        }

        async startRendering() {
          return createAudioBufferStub();
        }
      },
    );
  });

  it("renders SynthScene events into a WAV blob with safety limiting", async () => {
    const { renderSynthSceneToWav } = await import("@/lib/audio/synth-wav-render");
    const scene = createDefaultSynthScene(
      "F minor 124 bpm over 4 bars evolving pads",
    );

    const wav = await renderSynthSceneToWav(scene, { maxDurationSec: 4 });

    expect(wav.type).toBe("audio/wav");
    expect(limiterConnections).toBe(1);
    expect(oscillatorStarts.length).toBeGreaterThan(0);
    expect(oscillatorStops.length).toBeGreaterThan(0);
    expect(gainEvents).toEqual(
      expect.arrayContaining([
        ["set", 0, expect.any(Number)],
        ["linear", expect.any(Number), expect.any(Number)],
      ]),
    );
  });
});
