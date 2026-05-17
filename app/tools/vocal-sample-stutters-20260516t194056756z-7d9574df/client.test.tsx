import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VocalSampleStutters20260516t194056756z7d9574dfClient } from "./client";

vi.mock("@/components/sample-picker", () => ({
  SamplePicker: ({ label, value }: { label: string; value: string }) => (
    <label>
      {label}
      <select value={value} onChange={() => undefined}>
        <option value={value}>selected sample</option>
      </select>
    </label>
  ),
}));

vi.mock("@/components/audio-output-recorder", () => ({
  AudioOutputRecorder: () => <button type="button">record output</button>,
}));

vi.mock("@/lib/audio/sample-playback", () => ({
  getSamplePlaybackHost: () => ({
    playPattern: vi.fn(async () => undefined),
    updatePattern: vi.fn(async () => undefined),
    stopPattern: vi.fn(async () => undefined),
    clearPlaybackState: vi.fn(() => undefined),
    isPlaying: vi.fn(() => false),
    getEngine: vi.fn(() => ({})),
    toolId: "test",
  }),
  auditionSamplePlaybackSlice: vi.fn(async () => undefined),
}));

describe("vocal-sample-stutters-20260516t194056756z-7d9574df client", () => {
  it("renders a usable generated instrument interface", () => {
    render(<VocalSampleStutters20260516t194056756z7d9574dfClient />);

    expect(screen.getByText("Vocal Sample Stutters 20260516T194056756Z-7d9574df")).toBeInTheDocument();
    expect(screen.getByLabelText("source")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download wav/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy json/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /midi playback/i })).toBeInTheDocument();
    expect(screen.getByTitle("main step 1")).toBeInTheDocument();
  });
});
