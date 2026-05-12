import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CameraThereminClient } from "@/app/tools/camera-theremin/client";

vi.mock("@/components/audio-output-recorder", () => ({
  AudioOutputRecorder: () => <button type="button">record output</button>,
}));

vi.mock("@/app/tools/camera-theremin/lib/camera", () => ({
  startCameraMotionTracker: vi.fn(),
}));

vi.mock("@/app/tools/camera-theremin/lib/tone-playback", () => ({
  startCameraThereminSynth: vi.fn(async () => undefined),
  stopCameraThereminSynth: vi.fn(async () => undefined),
  updateCameraThereminSynth: vi.fn(),
}));

describe("CameraThereminClient", () => {
  it("renders the installed synth controls", () => {
    render(<CameraThereminClient />);

    expect(screen.getByText("Camera Theremin")).toBeInTheDocument();
    expect(screen.getByText("installed synth")).toBeInTheDocument();
    expect(screen.getByLabelText("camera input")).toBeInTheDocument();
    expect(screen.getByLabelText("prompt")).toHaveValue(
      "hands as bowed glass, slow vibrato, bright but controlled",
    );
    expect(screen.getByLabelText("chord mode")).toHaveValue("mono");
    expect(screen.getByLabelText("tonic")).toBeInTheDocument();
    expect(screen.getByLabelText("scale")).toBeInTheDocument();
    expect(screen.getByLabelText(/range degrees/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/smoothing/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start camera/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /arm synth/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record output/i })).toBeInTheDocument();
  });

  it("applies prompt text to synth controls", async () => {
    render(<CameraThereminClient />);

    const prompt = screen.getByLabelText("prompt");
    await userEvent.clear(prompt);
    await userEvent.type(prompt, "wide low smooth seventh glass drone");
    await userEvent.click(screen.getByRole("button", { name: /apply prompt/i }));

    expect(screen.getByLabelText("chord mode")).toHaveValue("seventh");
    expect(screen.getByLabelText(/range degrees/i)).toHaveValue("28");
    expect(screen.getByLabelText("root octave")).toHaveValue("-2");
    expect(screen.getByLabelText(/smoothing/i)).toHaveValue("0.68");
    expect(screen.getByText("seventh / 29 notes / low / 68%")).toBeInTheDocument();
  });
});
