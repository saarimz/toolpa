import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CameraThereminClient } from "@/app/tools/camera-theremin/client";
import {
  startCameraMotionTracker,
  type CameraTrackerFrame,
} from "@/app/tools/camera-theremin/lib/camera";
import {
  createHandMotionFrame,
  createThereminHandsFrame,
  type MotionLandmark,
} from "@/app/tools/camera-theremin/lib/motion";
import {
  startCameraThereminSynth,
  stopCameraThereminSynth,
  updateCameraThereminSynth,
} from "@/app/tools/camera-theremin/lib/tone-playback";
import { useFxPatternStore } from "@/lib/audio/use-fx-pattern";
import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

vi.mock("@/components/audio-output-recorder", () => ({
  AudioOutputRecorder: () => <button type="button">record output</button>,
}));

vi.mock("@/app/tools/camera-theremin/lib/camera", () => ({
  startCameraMotionTracker: vi.fn(),
}));

vi.mock("@/app/tools/camera-theremin/lib/tone-playback", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/app/tools/camera-theremin/lib/tone-playback")
    >();

  return {
    ...actual,
    startCameraThereminSynth: vi.fn(async () => undefined),
    stopCameraThereminSynth: vi.fn(async () => undefined),
    updateCameraThereminSynth: vi.fn(),
  };
});

describe("CameraThereminClient", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    useGlobalMusicContextStore.setState({
      context: DEFAULT_GLOBAL_MUSIC_CONTEXT,
      hydrated: false,
    });
    useFxPatternStore.setState({ patterns: {} });
    vi.mocked(startCameraMotionTracker).mockReset();
    vi.mocked(startCameraMotionTracker).mockResolvedValue({ stop: vi.fn() });
    vi.mocked(startCameraThereminSynth).mockReset();
    vi.mocked(startCameraThereminSynth).mockResolvedValue(undefined);
    vi.mocked(stopCameraThereminSynth).mockReset();
    vi.mocked(stopCameraThereminSynth).mockResolvedValue(undefined);
    vi.mocked(updateCameraThereminSynth).mockReset();
  });

  it("renders the installed synth controls", () => {
    render(<CameraThereminClient />);

    expect(screen.getByText("Camera Theremin")).toBeInTheDocument();
    expect(screen.getByText("installed synth")).toBeInTheDocument();
    expect(screen.getByLabelText("camera input")).toBeInTheDocument();
    expect(screen.getByLabelText("prompt")).toHaveValue(
      "hands as bowed glass, slow vibrato, bright but controlled",
    );
    expect(screen.getByLabelText("tracking mode")).toHaveValue("hands");
    expect(screen.getByLabelText("chord mode")).toHaveValue("mono");
    expect(screen.getByLabelText("chord cycle")).toHaveValue("static");
    expect(screen.getByLabelText("tonic")).toBeInTheDocument();
    expect(screen.getByLabelText("scale")).toBeInTheDocument();
    expect(screen.getByLabelText(/range degrees/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/smoothing/i)).toBeInTheDocument();
    expect(screen.getByText("fx slots")).toBeInTheDocument();
    expect(screen.getByText("motion map")).toBeInTheDocument();
    expect(screen.getByLabelText("pitch motion route")).toHaveTextContent(
      "pitch + pan",
    );
    expect(screen.getByLabelText("volume motion route")).toHaveTextContent(
      "volume + filter",
    );
    expect(screen.getByRole("button", { name: /start camera/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /arm synth/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record output/i })).toBeInTheDocument();
  });

  it("arms the theremin synth with the selected fx slot pattern", async () => {
    render(<CameraThereminClient />);

    await userEvent.selectOptions(screen.getAllByLabelText("effect")[0]!, "delay");
    await userEvent.click(screen.getByRole("button", { name: /arm synth/i }));

    expect(startCameraThereminSynth).toHaveBeenCalledWith({
      bpm: DEFAULT_GLOBAL_MUSIC_CONTEXT.bpm,
      fxPattern: expect.objectContaining({
        slots: expect.arrayContaining([
          expect.objectContaining({ effect: "delay", id: "A" }),
        ]),
      }),
      prompt: "hands as bowed glass, slow vibrato, bright but controlled",
    });
  });

  it("applies prompt text to synth controls", async () => {
    render(<CameraThereminClient />);

    const prompt = screen.getByLabelText("prompt");
    await userEvent.clear(prompt);
    await userEvent.type(prompt, "wide low smooth seventh cadence glass");
    await userEvent.click(screen.getByRole("button", { name: /apply prompt/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("chord mode")).toHaveValue("seventh");
    });
    expect(screen.getByLabelText("chord cycle")).toHaveValue("cadence");
    expect(screen.getByLabelText(/range degrees/i)).toHaveValue("28");
    expect(screen.getByLabelText("root octave")).toHaveValue("-2");
    expect(screen.getByLabelText(/smoothing/i)).toHaveValue("0.68");
    expect(screen.getByLabelText("tracking mode")).toHaveValue("hands");
    expect(
      screen.getByText(
        "hand tracking / seventh / cadence cycle / 29 notes / low / 68% / synth reloaded",
      ),
    ).toBeInTheDocument();
  });

  it("lets prompt text switch the active tracking mode", async () => {
    const stop = vi.fn();
    vi.mocked(startCameraMotionTracker).mockImplementation(async (options) => {
      options.onStatus?.("tracking");
      return { stop };
    });
    render(<CameraThereminClient />);

    await userEvent.click(screen.getByRole("button", { name: /start camera/i }));
    await waitFor(() => {
      expect(startCameraMotionTracker).toHaveBeenCalledWith(
        expect.objectContaining({ trackingMode: "hands" }),
      );
    });

    const prompt = screen.getByLabelText("prompt");
    await userEvent.clear(prompt);
    await userEvent.type(prompt, "blink gaze eye theremin with smooth triads");
    await userEvent.click(screen.getByRole("button", { name: /apply prompt/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("tracking mode")).toHaveValue("eyes");
    });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(startCameraMotionTracker).toHaveBeenLastCalledWith(
      expect.objectContaining({ trackingMode: "eyes" }),
    );
    expect(screen.getByLabelText("pitch motion route")).toHaveTextContent("gaze");
    expect(screen.getByLabelText("volume motion route")).toHaveTextContent("blink");
  });

  it("shows an overlay while applying a theremin prompt", async () => {
    render(<CameraThereminClient />);

    await userEvent.click(screen.getByRole("button", { name: /apply prompt/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "applying theremin prompt",
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Parsing the prompt, rebuilding the synth patch, and reloading the live theremin.",
    );

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("reloads an armed synth with the applied prompt patch", async () => {
    render(<CameraThereminClient />);

    await userEvent.click(screen.getByRole("button", { name: /arm synth/i }));
    vi.mocked(startCameraThereminSynth).mockClear();
    vi.mocked(stopCameraThereminSynth).mockClear();
    vi.mocked(updateCameraThereminSynth).mockClear();

    const prompt = screen.getByLabelText("prompt");
    await userEvent.clear(prompt);
    await userEvent.type(prompt, "wide low smooth seventh glass drone");
    await userEvent.click(screen.getByRole("button", { name: /apply prompt/i }));

    await waitFor(() => {
      expect(stopCameraThereminSynth).toHaveBeenCalledTimes(1);
    });
    expect(startCameraThereminSynth).toHaveBeenCalledWith({
      bpm: DEFAULT_GLOBAL_MUSIC_CONTEXT.bpm,
      fxPattern: expect.objectContaining({
        slots: expect.any(Array),
      }),
      prompt: "wide low smooth seventh glass drone",
    });
    expect(updateCameraThereminSynth).toHaveBeenLastCalledWith(null);
  });

  it("uses applied prompt controls for live camera frames after tracking starts", async () => {
    const trackerCallbacks: {
      onFrame?: (frame: CameraTrackerFrame) => void;
    } = {};
    vi.mocked(startCameraMotionTracker).mockImplementation(async (options) => {
      trackerCallbacks.onFrame = options.onFrame;
      options.onStatus?.("tracking");
      return { stop: vi.fn() };
    });

    render(<CameraThereminClient />);

    await userEvent.click(screen.getByRole("button", { name: /start camera/i }));
    await waitFor(() => {
      expect(trackerCallbacks.onFrame).toBeDefined();
    });

    const prompt = screen.getByLabelText("prompt");
    await userEvent.clear(prompt);
    await userEvent.type(prompt, "wide low smooth seventh cadence glass");
    await userEvent.click(screen.getByRole("button", { name: /apply prompt/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("chord mode")).toHaveValue("seventh");
    });
    expect(screen.getByLabelText("chord cycle")).toHaveValue("cadence");

    const emitFrame = trackerCallbacks.onFrame;
    if (!emitFrame) {
      throw new Error("camera tracker frame callback was not registered");
    }

    emitFrame({
      frame: createThereminHandsFrame([
        createHandMotionFrame({
          handedness: "Right",
          landmarks: landmarksWith({
            4: { x: 0.3, y: 0.2, z: -0.02 },
            8: { x: 0.5, y: 0.5, z: -0.05 },
          }),
        }),
        createHandMotionFrame({
          handedness: "Left",
          landmarks: landmarksWith({
            4: { x: 0.12, y: 0.32, z: -0.02 },
            8: { x: 0.32, y: 0.24, z: -0.08 },
          }),
        }),
      ].filter(isHandMotionFrame)),
      timestampMs: 1000,
      trackingMode: "hands",
    });

    await waitFor(() => {
      expect(screen.getByText("degree 19 cadence V seventh")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("pitch motion route")).toHaveTextContent(
      "tracking",
    );
    expect(screen.getByLabelText("volume motion route")).toHaveTextContent(
      "tracking",
    );
  });
});

function landmarksWith(overrides: Record<number, MotionLandmark>): MotionLandmark[] {
  return Array.from({ length: 21 }, (_, index) => ({
    x: overrides[index]?.x ?? 0,
    y: overrides[index]?.y ?? 0,
    z: overrides[index]?.z ?? 0,
  }));
}

function isHandMotionFrame(
  frame: ReturnType<typeof createHandMotionFrame>,
): frame is NonNullable<ReturnType<typeof createHandMotionFrame>> {
  return frame !== null;
}
