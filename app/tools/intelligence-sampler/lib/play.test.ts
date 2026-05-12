import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  auditionIntelligenceSamplerSlice,
  clearIntelligenceSamplerPlaybackState,
  createIntelligenceSamplerPlayerKey,
  playIntelligenceSamplerPattern,
  stopIntelligenceSamplerPattern,
} from "@/app/tools/intelligence-sampler/lib/play";
import { createPattern, createStep, createTrack } from "@/lib/pattern/schema";

type MockPlayer = {
  audioBuffer: unknown;
  fadeIn: number;
  fadeOut: number;
  reverse: boolean;
  playbackRate: number;
  volume: { value: number };
  connect: Mock;
  start: Mock;
  stop: Mock;
  dispose: Mock;
};

type MockPart = {
  callback: (time: number, event: unknown) => void;
  entries: Array<[number, unknown]>;
  loop: boolean | number;
  loopEnd: unknown;
  start: Mock;
  stop: Mock;
  dispose: Mock;
};

type MockLimiter = {
  connect: Mock;
  dispose: Mock;
};

const resolverState = vi.hoisted(() => ({
  resolveSample: vi.fn(),
}));

const toneState = vi.hoisted(() => ({
  limiters: [] as MockLimiter[],
  players: [] as MockPlayer[],
  parts: [] as MockPart[],
  transport: {
    bpm: { value: 0 },
    swing: 0,
    swingSubdivision: "",
    position: 0 as number | string,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: resolverState.resolveSample,
}));

vi.mock("tone", () => {
  class Player {
    audioBuffer: unknown;
    fadeIn = 0;
    fadeOut = 0;
    reverse = false;
    playbackRate = 1;
    volume = { value: 0 };
    connect = vi.fn(() => this);
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();

    constructor(audioBuffer: unknown) {
      this.audioBuffer = audioBuffer;
      toneState.players.push(this);
    }
  }

  class Part {
    callback: (time: number, event: unknown) => void;
    entries: Array<[number, unknown]>;
    loop: boolean | number = false;
    loopEnd: unknown = 0;
    start = vi.fn(() => {
      for (const [time, event] of this.entries) {
        this.callback(time, event);
      }
      return this;
    });
    stop = vi.fn();
    dispose = vi.fn();

    constructor(
      callback: (time: number, event: unknown) => void,
      entries: Array<[number, unknown]>,
    ) {
      this.callback = callback;
      this.entries = entries;
      toneState.parts.push(this);
    }
  }

  class Limiter {
    connect = vi.fn(() => this);
    dispose = vi.fn();

    constructor(readonly threshold: number) {
      toneState.limiters.push(this);
    }
  }

  return {
    start: vi.fn().mockResolvedValue(undefined),
    getTransport: vi.fn(() => toneState.transport),
    getDestination: vi.fn(() => ({})),
    gainToDb: vi.fn((gain: number) => gain),
    Player,
    Part,
    Limiter,
  };
});

function createSixteenthSteps(activeIndex: number, slot: number) {
  return Array.from({ length: 16 }, (_, index) =>
    createStep({
      active: index === activeIndex,
      slot,
    }),
  );
}

describe("intelligence sampler playback", () => {
  beforeEach(() => {
    clearIntelligenceSamplerPlaybackState();
    toneState.limiters.length = 0;
    toneState.players.length = 0;
    toneState.parts.length = 0;
    toneState.transport.bpm.value = 0;
    toneState.transport.swing = 0;
    toneState.transport.swingSubdivision = "";
    toneState.transport.position = 0;
    vi.clearAllMocks();
    resolverState.resolveSample.mockImplementation(async (sampleId: string) => ({
      id: sampleId,
      name: sampleId,
      audioBuffer: { duration: 8, sampleId },
      origin: "library",
    }));
  });

  afterEach(() => {
    clearIntelligenceSamplerPlaybackState();
  });

  it("keys slice players by source sample and slice slot", () => {
    expect(createIntelligenceSamplerPlayerKey("library:jungle/amen", 3)).toBe(
      "library:jungle/amen#slice/3",
    );
  });

  it("uses independent slice players before applying choke group stops", async () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bpm: 160,
      tracks: [
        createTrack({
          id: "slice-1",
          name: "slice 1",
          sampleId: "library:jungle/amen",
          slot: 0,
          chokeGroup: "main",
          steps: createSixteenthSteps(0, 0),
        }),
        createTrack({
          id: "slice-2",
          name: "slice 2",
          sampleId: "library:jungle/amen",
          slot: 1,
          chokeGroup: "main",
          steps: createSixteenthSteps(1, 1),
        }),
      ],
    });

    await playIntelligenceSamplerPattern(pattern);

    expect(toneState.players).toHaveLength(2);
    expect(toneState.limiters).toHaveLength(1);
    expect(toneState.players[0]?.start).toHaveBeenCalledTimes(1);
    expect(toneState.players[1]?.start).toHaveBeenCalledTimes(1);
    expect(toneState.players[0]?.stop).toHaveBeenCalledTimes(2);
    expect(toneState.players[1]?.stop).toHaveBeenCalledTimes(1);
    expect(toneState.players[0]?.stop.mock.invocationCallOrder[1]).toBeLessThan(
      toneState.players[1]?.start.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("applies short fades to each sample trigger", async () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bpm: 120,
      tracks: [
        createTrack({
          id: "slice-1",
          name: "slice 1",
          sampleId: "library:jungle/amen",
          slot: 0,
          steps: createSixteenthSteps(0, 0),
        }),
      ],
    });

    await playIntelligenceSamplerPattern(pattern, { declickPreset: "tight" });

    expect(toneState.players[0]).toMatchObject({
      fadeIn: 0.002,
      fadeOut: 0.006,
    });
    expect(toneState.players[0]?.stop).toHaveBeenCalled();
  });

  it("preloads and plays step-level sample overrides through the smoothed engine", async () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bpm: 120,
      tracks: [
        createTrack({
          id: "slice-1",
          name: "slice 1",
          sampleId: "library:jungle/default",
          slot: 0,
          steps: Array.from({ length: 16 }, (_, index) =>
            createStep({
              active: index === 0,
              sampleId: index === 0 ? "library:jungle/override" : undefined,
              slot: 0,
            }),
          ),
        }),
      ],
    });

    await playIntelligenceSamplerPattern(pattern, { declickPreset: "tight" });

    expect(resolverState.resolveSample).toHaveBeenCalledWith("library:jungle/default");
    expect(resolverState.resolveSample).toHaveBeenCalledWith("library:jungle/override");
    expect(toneState.players[0]?.audioBuffer).toMatchObject({
      sampleId: "library:jungle/override",
    });
    expect(toneState.players[0]).toMatchObject({
      fadeIn: 0.002,
      fadeOut: 0.006,
    });
  });

  it("starts reversed slices from the mirrored buffer offset", async () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bpm: 120,
      tracks: [
        createTrack({
          id: "slice-1",
          name: "slice 1",
          sampleId: "library:jungle/amen",
          slot: 2,
          steps: Array.from({ length: 16 }, (_, index) =>
            createStep({
              active: index === 0,
              reverse: true,
              slot: 2,
            }),
          ),
        }),
      ],
    });

    await playIntelligenceSamplerPattern(pattern, { sliceCount: 8 });

    expect(toneState.players[0]).toMatchObject({ reverse: true });
    expect(toneState.players[0]?.start).toHaveBeenCalledWith(0, 5);
  });

  it("applies the same declick envelope when auditioning slices", async () => {
    await auditionIntelligenceSamplerSlice("library:jungle/amen", 0, {
      declickPreset: "soft",
    });

    expect(toneState.players[0]).toMatchObject({
      fadeIn: 0.008,
      fadeOut: 0.02,
    });
    expect(toneState.limiters).toHaveLength(1);
  });

  it("fades active players before disposal when transport stops", async () => {
    vi.useFakeTimers();
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bpm: 120,
      tracks: [
        createTrack({
          id: "slice-1",
          name: "slice 1",
          sampleId: "library:jungle/amen",
          slot: 0,
          steps: createSixteenthSteps(0, 0),
        }),
      ],
    });

    try {
      await playIntelligenceSamplerPattern(pattern, { declickPreset: "tight" });
      const player = toneState.players[0];
      const limiter = toneState.limiters[0];

      await stopIntelligenceSamplerPattern();

      expect(player?.fadeOut).toBe(0.02);
      expect(player?.stop).toHaveBeenCalledTimes(2);
      expect(player?.dispose).not.toHaveBeenCalled();
      expect(limiter?.dispose).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(121);

      expect(player?.dispose).toHaveBeenCalledTimes(1);
      expect(limiter?.dispose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
