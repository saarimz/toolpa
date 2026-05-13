import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { createPatternEngine } from "@/lib/audio/pattern-engine";
import { resetTransportOwnership } from "@/lib/audio/transport-owner";
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

type MockWetNode = MockLimiter & {
  options: unknown;
  wet: { value: number };
};

type MockGain = {
  connect: Mock;
  dispose: Mock;
};

const resolverState = vi.hoisted(() => ({
  resolveSample: vi.fn(),
}));

const toneState = vi.hoisted(() => ({
  delays: [] as MockWetNode[],
  gains: [] as MockGain[],
  limiters: [] as MockLimiter[],
  players: [] as MockPlayer[],
  parts: [] as MockPart[],
  transport: {
    bpm: {
      value: 0,
      rampTo: vi.fn(),
    },
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

  class Gain {
    connect = vi.fn(() => this);
    dispose = vi.fn();

    constructor(readonly value: number) {
      toneState.gains.push(this);
    }
  }

  class FeedbackDelay {
    connect = vi.fn(() => this);
    dispose = vi.fn();
    wet = { value: 0 };

    constructor(readonly options: unknown) {
      toneState.delays.push(this);
    }
  }

  return {
    start: vi.fn().mockResolvedValue(undefined),
    getTransport: vi.fn(() => toneState.transport),
    getDestination: vi.fn(() => ({})),
    gainToDb: vi.fn((gain: number) => gain),
    Player,
    Part,
    FeedbackDelay,
    Gain,
    Limiter,
  };
});

function singleStepTrack(stepIndex: number, sampleId = "library:test/sample") {
  return createTrack({
    id: `track-${stepIndex}`,
    name: `track ${stepIndex}`,
    sampleId,
    slot: 0,
    steps: Array.from({ length: 16 }, (_, index) =>
      createStep({ active: index === stepIndex, slot: 0 }),
    ),
  });
}

describe("PatternEngine.updatePattern", () => {
  beforeEach(() => {
    resetTransportOwnership();
    toneState.delays.length = 0;
    toneState.gains.length = 0;
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
    resetTransportOwnership();
    toneState.delays.length = 0;
    toneState.gains.length = 0;
    toneState.limiters.length = 0;
    toneState.players.length = 0;
    toneState.parts.length = 0;
  });

  it("is a no-op when called before play()", async () => {
    const engine = createPatternEngine({ id: "test-engine" });
    const pattern = createPattern({
      id: "p",
      name: "p",
      bpm: 120,
      tracks: [singleStepTrack(0)],
    });

    await engine.updatePattern(pattern);

    expect(toneState.parts).toHaveLength(0);
    expect(toneState.limiters).toHaveLength(0);
    expect(toneState.transport.bpm.rampTo).not.toHaveBeenCalled();
    expect(engine.isPlaying).toBe(false);
  });

  it("swaps the Part contents without stopping the transport or output node", async () => {
    const engine = createPatternEngine({ id: "test-engine" });
    const initial = createPattern({
      id: "p",
      name: "p",
      bpm: 120,
      tracks: [singleStepTrack(0, "library:initial")],
    });

    await engine.play(initial);
    expect(toneState.parts).toHaveLength(2);
    expect(toneState.limiters).toHaveLength(1);
    expect(engine.isPlaying).toBe(true);
    const initialPart = toneState.parts[0];
    const initialTracePart = toneState.parts[1];
    const initialLimiter = toneState.limiters[0];
    toneState.transport.stop.mockClear();
    toneState.transport.start.mockClear();
    toneState.transport.bpm.rampTo.mockClear();

    const next = createPattern({
      id: "p",
      name: "p",
      bpm: 140,
      tracks: [singleStepTrack(4, "library:updated")],
    });

    await engine.updatePattern(next);

    expect(toneState.parts).toHaveLength(4);
    expect(initialPart?.stop).toHaveBeenCalledTimes(1);
    expect(initialPart?.dispose).toHaveBeenCalledTimes(1);
    expect(initialTracePart?.stop).toHaveBeenCalledTimes(1);
    expect(initialTracePart?.dispose).toHaveBeenCalledTimes(1);
    expect(initialLimiter?.dispose).not.toHaveBeenCalled();
    expect(toneState.transport.stop).not.toHaveBeenCalled();
    expect(toneState.transport.start).not.toHaveBeenCalled();
    expect(toneState.transport.bpm.rampTo).toHaveBeenCalledWith(140, 0.05);
    expect(toneState.transport.swing).toBe(next.swing);
    expect(engine.isPlaying).toBe(true);
  });

  it("rolls probability fresh in the Part callback, not at plan time", async () => {
    const engine = createPatternEngine({ id: "test-engine" });
    const random = vi.fn().mockReturnValue(0.95);
    const pattern = createPattern({
      id: "p",
      name: "p",
      bpm: 120,
      bars: 1,
      stepsPerBar: 2,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "library:test",
          slot: 0,
          steps: [
            createStep({ active: true, probability: 1, slot: 0 }),
            createStep({ active: true, probability: 0, slot: 0 }),
          ],
        }),
      ],
    });

    await engine.play(pattern, { random });

    expect(toneState.players).toHaveLength(1);
    expect(random).toHaveBeenCalled();
  });

  it("does not restart the transport when a second engine joins playback", async () => {
    const engineA = createPatternEngine({ id: "engine-a" });
    const engineB = createPatternEngine({ id: "engine-b" });
    const pattern = createPattern({
      id: "p",
      name: "p",
      bpm: 120,
      tracks: [singleStepTrack(0)],
    });

    await engineA.play(pattern);
    const transportStopAfterA = toneState.transport.stop.mock.calls.length;
    const transportStartAfterA = toneState.transport.start.mock.calls.length;

    await engineB.play(pattern);

    expect(toneState.transport.stop.mock.calls.length).toBe(transportStopAfterA);
    expect(toneState.transport.start.mock.calls.length).toBe(transportStartAfterA);
  });

  it("keeps the transport running until the last active engine stops", async () => {
    const engineA = createPatternEngine({ id: "engine-a" });
    const engineB = createPatternEngine({ id: "engine-b" });
    const pattern = createPattern({
      id: "p",
      name: "p",
      bpm: 120,
      tracks: [singleStepTrack(0)],
    });

    await engineA.play(pattern);
    await engineB.play(pattern);
    toneState.transport.stop.mockClear();

    await engineA.stop();
    expect(toneState.transport.stop).not.toHaveBeenCalled();

    await engineB.stop();
    expect(toneState.transport.stop).toHaveBeenCalled();
  });

  it("re-resolves samples that appear in the updated pattern", async () => {
    const engine = createPatternEngine({ id: "test-engine" });
    const initial = createPattern({
      id: "p",
      name: "p",
      bpm: 120,
      tracks: [singleStepTrack(0, "library:initial")],
    });

    await engine.play(initial);
    resolverState.resolveSample.mockClear();

    const next = createPattern({
      id: "p",
      name: "p",
      bpm: 120,
      tracks: [singleStepTrack(0, "library:added")],
    });
    await engine.updatePattern(next);

    expect(resolverState.resolveSample).toHaveBeenCalledWith("library:added");
  });

  it("rebuilds the output graph when the FX pattern changes", async () => {
    const engine = createPatternEngine({ id: "test-engine" });
    const pattern = createPattern({
      id: "p",
      name: "p",
      bpm: 120,
      tracks: [singleStepTrack(0)],
    });

    await engine.play(pattern);
    const initialLimiter = toneState.limiters[0];

    await engine.updatePattern(pattern, {
      fxPattern: {
        schemaVersion: 1,
        slots: [
          { id: "A", effect: "delay", wet: 0.4 },
          { id: "B", effect: "none", wet: 0.35 },
        ],
      },
    });

    expect(toneState.delays).toHaveLength(1);
    expect(toneState.limiters).toHaveLength(2);
    expect(initialLimiter?.dispose).toHaveBeenCalledTimes(1);
  });

  it("schedules probabilistic FX wet changes at interval boundaries", async () => {
    const engine = createPatternEngine({ id: "test-engine" });
    const random = vi.fn()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(1);
    const pattern = createPattern({
      id: "p",
      name: "p",
      bpm: 120,
      bars: 1,
      stepsPerBar: 4,
      tracks: [singleStepTrack(0)],
    });

    await engine.play(pattern, {
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
              chance: 1,
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

    const fxPart = toneState.parts[2];
    expect(fxPart?.entries).toEqual([
      [0, expect.objectContaining({ slotId: "A" })],
      [1, expect.objectContaining({ slotId: "A" })],
    ]);
    expect(toneState.delays[0]?.wet.value).toBeCloseTo(0.8);
  });
});
