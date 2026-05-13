import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockPlayer = {
  connect: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  fadeIn: number;
  fadeOut: number;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

type MockLimiter = {
  connect: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

const resolverMock = vi.hoisted(() => ({
  resolveSample: vi.fn(),
}));

const toneState = vi.hoisted(() => ({
  destination: {},
  limiters: [] as MockLimiter[],
  players: [] as MockPlayer[],
  start: vi.fn(async () => undefined),
}));

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: resolverMock.resolveSample,
}));

vi.mock("tone", () => ({
  getDestination: vi.fn(() => toneState.destination),
  Limiter: class implements MockLimiter {
    connect = vi.fn(() => this);
    dispose = vi.fn();

    constructor() {
      toneState.limiters.push(this);
    }
  },
  Player: class implements MockPlayer {
    connect = vi.fn(() => this);
    dispose = vi.fn();
    fadeIn = 0;
    fadeOut = 0;
    start = vi.fn();
    stop = vi.fn();

    constructor() {
      toneState.players.push(this);
    }
  },
  start: toneState.start,
}));

describe("sample playback audition", () => {
  beforeEach(() => {
    toneState.players.length = 0;
    toneState.limiters.length = 0;
    toneState.start.mockClear();
    resolverMock.resolveSample.mockResolvedValue({
      audioBuffer: { duration: 8 } as unknown as AudioBuffer,
      id: "library:test",
      name: "test.wav",
      origin: "library",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("can audition an entire sample when callers request one full-length slice", async () => {
    const { startSamplePlaybackSlice } = await import("@/lib/audio/sample-playback");

    const handle = await startSamplePlaybackSlice("library:test", 0, { sliceCount: 1 });
    const player = toneState.players[0];

    expect(handle.durationSec).toBeCloseTo(8);
    expect(player?.start).toHaveBeenCalledWith(undefined, 0);
    expect(player?.stop).toHaveBeenCalledWith("+7.99");
  });

  it("returns a stop handle that disposes the player and resolves completion", async () => {
    const { startSamplePlaybackSlice } = await import("@/lib/audio/sample-playback");
    const handle = await startSamplePlaybackSlice("library:test", 0, { sliceCount: 1 });
    const finished = vi.fn();

    void handle.finished.then(finished);
    handle.stop();
    await Promise.resolve();

    expect(toneState.players[0]?.dispose).toHaveBeenCalledOnce();
    expect(toneState.limiters[0]?.dispose).toHaveBeenCalledOnce();
    expect(finished).toHaveBeenCalledOnce();
  });
});
