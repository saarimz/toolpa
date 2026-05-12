import { beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();
const disconnect = vi.fn();
const start = vi.fn(async () => undefined);
const stop = vi.fn(async () => new Blob(["encoded"], { type: "audio/webm" }));
const dispose = vi.fn();

class MockRecorder {
  static supported = true;
  state = "stopped";
  mimeType = "audio/webm";

  async start() {
    this.state = "started";
    await start();
  }

  async stop() {
    this.state = "stopped";
    return stop();
  }

  dispose() {
    dispose();
    return this;
  }
}

vi.mock("tone", () => ({
  start: vi.fn(async () => undefined),
  Recorder: MockRecorder,
  getDestination: vi.fn(() => ({
    connect,
    disconnect,
  })),
}));

function createAudioBufferStub(samples: number[]): AudioBuffer {
  const data = Float32Array.from(samples);
  return {
    duration: samples.length / 44100,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate: 44100,
    copyFromChannel: (destination: Float32Array) => {
      destination.set(data.slice(0, destination.length));
    },
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe("live output recorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the Tone destination and returns a WAV blob", async () => {
    const { startLiveOutputRecording, stopLiveOutputRecording } = await import(
      "@/lib/audio/live-recorder"
    );

    await startLiveOutputRecording();
    const recording = await stopLiveOutputRecording({
      filename: "My Synth Take",
      decodeRecordedBlob: async () => createAudioBufferStub([0, 1, -1]),
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalled();
    expect(recording.filename).toBe("my-synth-take.wav");
    expect(recording.wavBlob.type).toBe("audio/wav");
    expect(recording.audioEvidence).toBeNull();
  });

  it("analyzes tonal evidence from decoded live output", async () => {
    const { startLiveOutputRecording, stopLiveOutputRecording } = await import(
      "@/lib/audio/live-recorder"
    );

    await startLiveOutputRecording();
    const recording = await stopLiveOutputRecording({
      filename: "Live C Major",
      decodeRecordedBlob: async () =>
        createAudioBufferStub(generateChord([523.25, 659.25, 783.99], 1.5)),
    });

    expect(recording.audioEvidence?.pitchClasses).toEqual(
      expect.arrayContaining([0, 4, 7]),
    );
    expect(recording.audioEvidence?.summary).toContain("live-c-major live output");
  });

  it("sanitizes filenames for downloadable clips", async () => {
    const { sanitizeRecordingFilename } = await import("@/lib/audio/live-recorder");

    expect(sanitizeRecordingFilename(" Evolving FM take 01.wav ")).toBe(
      "evolving-fm-take-01.wav",
    );
    expect(sanitizeRecordingFilename("")).toBe("ai-daw-tools-recording.wav");
  });
});

function generateChord(frequencies: number[], durationSec: number) {
  const sampleRate = 44100;
  const length = Math.floor(durationSec * sampleRate);
  const samples = new Array<number>(length).fill(0);
  const amplitude = 0.3 / frequencies.length;
  for (const frequency of frequencies) {
    for (let index = 0; index < length; index++) {
      samples[index] +=
        amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
    }
  }
  return samples;
}
