import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFxPatternStore } from "@/lib/audio/use-fx-pattern";
import { SineWaveSynthClient } from "./client";

vi.mock("@/components/audio-output-recorder", () => ({
  AudioOutputRecorder: () => <button type="button">record output</button>,
}));
vi.mock("@/app/tools/evolving-fm-synth/lib/tone-playback", () => ({
  playEvolvingFmSynthScene: vi.fn(async () => undefined),
  stopEvolvingFmSynthScene: vi.fn(async () => undefined),
}));

describe("sine-wave-synth client", () => {
  it("renders a usable generated synth interface", () => {
    useFxPatternStore.setState({ patterns: {} });
    render(<SineWaveSynthClient />);

    expect(screen.getByText("Sine Wave Synth")).toBeInTheDocument();
    expect(screen.getByLabelText("scene prompt")).toBeInTheDocument();
    expect(screen.getByLabelText("key")).toBeInTheDocument();
    expect(screen.getByLabelText("scale")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download wav/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download midi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy json/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload midi/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /midi playback/i })).toBeInTheDocument();
    expect(screen.getByText("fx slots")).toBeInTheDocument();
  });
});
