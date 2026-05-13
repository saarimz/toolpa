import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPattern, createStep, createTrack } from "@/lib/pattern/schema";

const resolverMock = vi.hoisted(() => ({
  resolveSample: vi.fn(),
}));

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: resolverMock.resolveSample,
}));

let gainEvents: unknown[] = [];
let convolverCreations = 0;
let createdBuffers: AudioBuffer[] = [];
let filterCreations = 0;
let delayCreations = 0;
let limiterConnections = 0;
let starts: unknown[] = [];
let stereoPannerCreations = 0;
let waveShaperCreations = 0;

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
    convolverCreations = 0;
    createdBuffers = [];
    filterCreations = 0;
    delayCreations = 0;
    limiterConnections = 0;
    starts = [];
    stereoPannerCreations = 0;
    waveShaperCreations = 0;

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

        createDelay() {
          delayCreations += 1;
          return {
            ...createAudioNode(),
            delayTime: {
              setValueAtTime: vi.fn(),
            },
          };
        }

        createConvolver() {
          convolverCreations += 1;
          return {
            ...createAudioNode(),
            buffer: null,
            normalize: false,
          };
        }

        createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
          const channelData = Array.from(
            { length: numberOfChannels },
            () => new Float32Array(length),
          );
          const buffer = {
            length,
            numberOfChannels,
            sampleRate,
            getChannelData: (channel: number) => channelData[channel] ?? channelData[0],
          } as unknown as AudioBuffer;
          createdBuffers.push(buffer);
          return buffer;
        }

        createOscillator() {
          return {
            ...createAudioNode(),
            frequency: createAudioParam(),
            start: vi.fn((...args: unknown[]) => starts.push(args)),
          };
        }

        createBiquadFilter() {
          filterCreations += 1;
          return {
            ...createAudioNode(),
            frequency: createAudioParam(),
            gain: createAudioParam(),
            Q: createAudioParam(),
            type: "lowpass",
          };
        }

        createDynamicsCompressor() {
          return {
            attack: createAudioParam(),
            connect: vi.fn(() => {
              limiterConnections += 1;
            }),
            knee: createAudioParam(),
            ratio: createAudioParam(),
            release: createAudioParam(),
            threshold: createAudioParam(),
          };
        }

        createStereoPanner() {
          stereoPannerCreations += 1;
          return {
            ...createAudioNode(),
            pan: createAudioParam(),
          };
        }

        createWaveShaper() {
          waveShaperCreations += 1;
          return {
            ...createAudioNode(),
            curve: null,
            oversample: "none",
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

  it("routes offline renders through the selected FX slots", async () => {
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
            createStep({ active: index === 0, slot: 0 }),
          ),
        }),
      ],
    });

    const wav = await renderPatternToWav(pattern, {
      fxPattern: {
        schemaVersion: 1,
        slots: [
          { id: "A", effect: "delay", wet: 0.35 },
          { id: "B", effect: "hall-reverb", wet: 0.4 },
        ],
      },
    });

    expect(wav.type).toBe("audio/wav");
    expect(delayCreations).toBeGreaterThanOrEqual(2);
    expect(convolverCreations).toBe(1);
    expect(limiterConnections).toBe(1);
  });

  it("renders old Yamaha-style reverse reverb with a rising impulse response", async () => {
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
            createStep({ active: index === 0, slot: 0 }),
          ),
        }),
      ],
    });

    const wav = await renderPatternToWav(pattern, {
      fxPattern: {
        schemaVersion: 1,
        slots: [
          { id: "A", effect: "reverse-reverb", wet: 0.5 },
          { id: "B", effect: "none", wet: 0.35 },
        ],
      },
    });

    const reverseImpulse = createdBuffers.at(-1);
    const data = reverseImpulse?.getChannelData(0);
    const earlyEnergy = averageAbs(data?.slice(0, 128));
    const lateEnergy = averageAbs(data?.slice(-128));

    expect(wav.type).toBe("audio/wav");
    expect(convolverCreations).toBe(1);
    expect(delayCreations).toBe(1);
    expect(lateEnergy).toBeGreaterThan(earlyEnergy * 4);
  });

  it("applies probabilistic FX automation during offline renders", async () => {
    const { renderPatternToWav } = await import("@/lib/audio/wav-render");
    const random = vi.fn().mockReturnValueOnce(0.1).mockReturnValueOnce(0.5).mockReturnValueOnce(0.9);
    const pattern = createPattern({
      id: "render",
      name: "render",
      bpm: 120,
      bars: 1,
      stepsPerBar: 4,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "sample",
          slot: 0,
          steps: Array.from({ length: 4 }, () =>
            createStep({ active: false, slot: 0 }),
          ),
        }),
      ],
    });

    await renderPatternToWav(pattern, {
      random,
      fxPattern: {
        schemaVersion: 1,
        slots: [
          {
            id: "A",
            effect: "delay",
            wet: 0,
            probability: {
              enabled: true,
              intervalSteps: 2,
              chance: 0.5,
              missWet: 0,
              minWet: 0.2,
              maxWet: 0.8,
              smoothMs: 0,
            },
          },
          { id: "B", effect: "none", wet: 0.35 },
        ],
      },
    });

    expect(delayCreations).toBeGreaterThan(0);
    expect(gainEvents).toContainEqual(["set", 0.5, 0]);
    expect(gainEvents).toContainEqual(["set", 1, 1]);
    expect(gainEvents).toContainEqual(["set", 0, 1]);
  });

  it("renders vintage Yamaha and E-mu FX models offline", async () => {
    const { renderPatternToWav } = await import("@/lib/audio/wav-render");
    const pattern = createPattern({
      id: "render",
      name: "render",
      bpm: 160,
      bars: 1,
      stepsPerBar: 16,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "sample",
          slot: 0,
          steps: Array.from({ length: 16 }, (_, index) =>
            createStep({ active: index === 0, slot: 0 }),
          ),
        }),
      ],
    });

    const wav = await renderPatternToWav(pattern, {
      fxPattern: {
        schemaVersion: 1,
        slots: [
          {
            id: "A",
            effect: "emu-z-plane-morph",
            wet: 0.45,
            params: { frameA: "notch-sweep", morph: 0.75 },
          },
          { id: "B", effect: "a3000-low-resolution", wet: 0.3 },
          { id: "C", effect: "spx-auto-pan", wet: 0.25 },
          { id: "D", effect: "motif-slice", wet: 0.25 },
        ],
      },
    });

    expect(wav.type).toBe("audio/wav");
    expect(filterCreations).toBeGreaterThanOrEqual(5);
    expect(stereoPannerCreations).toBe(1);
    expect(waveShaperCreations).toBe(1);
    expect(limiterConnections).toBe(1);
  });
});

function createAudioNode() {
  return {
    connect: vi.fn(),
  };
}

function createAudioParam() {
  return {
    linearRampToValueAtTime: vi.fn((...args: unknown[]) =>
      gainEvents.push(["linear", ...args]),
    ),
    setValueAtTime: vi.fn((...args: unknown[]) =>
      gainEvents.push(["set", ...args]),
    ),
    value: 0,
  };
}

function averageAbs(values?: Float32Array): number {
  if (!values || values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
}
