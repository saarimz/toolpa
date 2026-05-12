import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPattern, createStep, createTrack } from "@/lib/pattern/schema";

const resolverMock = vi.hoisted(() => ({
  resolveSample: vi.fn(),
}));

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: resolverMock.resolveSample,
}));

let gainEvents: unknown[] = [];
let limiterConnections = 0;
let starts: unknown[] = [];

function createAudioBufferStub(duration = 1): AudioBuffer {
  return {
    duration,
    length: 16,
    numberOfChannels: 1,
    sampleRate: 44100,
    getChannelData: () => new Float32Array(16),
  } as unknown as AudioBuffer;
}

describe("offline wav rendering", () => {
  beforeEach(() => {
    gainEvents = [];
    limiterConnections = 0;
    starts = [];

    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        destination = {};

        constructor(
          readonly channels: number,
          readonly length: number,
          readonly sampleRate: number,
        ) {}

        createBufferSource() {
          return {
            buffer: null,
            playbackRate: { value: 1 },
            connect: vi.fn(),
            start: vi.fn((...args: unknown[]) => starts.push(args)),
          };
        }

        createGain() {
          return {
            gain: {
              value: 1,
              cancelScheduledValues: vi.fn((...args: unknown[]) =>
                gainEvents.push(["cancel", ...args]),
              ),
              linearRampToValueAtTime: vi.fn((...args: unknown[]) =>
                gainEvents.push(["linear", ...args]),
              ),
              setValueAtTime: vi.fn((...args: unknown[]) =>
                gainEvents.push(["set", ...args]),
              ),
            },
            connect: vi.fn(),
          };
        }

        createDynamicsCompressor() {
          const createParam = () => ({
            setValueAtTime: vi.fn(),
          });
          return {
            attack: createParam(),
            connect: vi.fn(() => {
              limiterConnections += 1;
            }),
            knee: createParam(),
            ratio: createParam(),
            release: createParam(),
            threshold: createParam(),
          };
        }

        async startRendering() {
          return createAudioBufferStub(1);
        }
      },
    );

    resolverMock.resolveSample.mockResolvedValue({
      id: "sample",
      name: "sample",
      audioBuffer: createAudioBufferStub(8),
      origin: "library",
    });
  });

  it("renders scheduled pattern events with OfflineAudioContext", async () => {
    const { renderPatternToWav } = await import("@/lib/audio/wav-render");
    const pattern = createPattern({
      id: "render",
      name: "render",
      bpm: 120,
      bars: 1,
      stepsPerBar: 16,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "sample",
          slot: 2,
          steps: Array.from({ length: 16 }, (_, index) =>
            createStep({ active: index === 0, slot: 2 }),
          ),
        }),
      ],
    });

    const wav = await renderPatternToWav(pattern, { sliceCount: 8 });

    expect(wav.type).toBe("audio/wav");
    expect(resolverMock.resolveSample).toHaveBeenCalledWith("sample");
    expect(limiterConnections).toBe(1);
  });

  it("ramps offline gain in and out to avoid render clicks", async () => {
    const { renderPatternToWav } = await import("@/lib/audio/wav-render");
    const pattern = createPattern({
      id: "render",
      name: "render",
      bpm: 120,
      bars: 1,
      stepsPerBar: 16,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "sample",
          slot: 0,
          steps: Array.from({ length: 16 }, (_, index) =>
            createStep({ active: index === 0, slot: 0, velocity: 0.5 }),
          ),
        }),
      ],
    });

    const wav = await renderPatternToWav(pattern, { declickPreset: "tight", sliceCount: 8 });

    expect(wav.type).toBe("audio/wav");
    expect(starts[0]).toEqual([0, 0, 0.125]);
    expect(gainEvents).toEqual(
      expect.arrayContaining([
        ["set", 0, 0],
        ["linear", 0.5, 0.002],
        ["linear", 0, expect.any(Number)],
      ]),
    );
  });
});
