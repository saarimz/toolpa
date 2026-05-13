import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HarmonicDistrotionEffectClient } from "./client";

vi.mock("@/components/audio-output-recorder", () => ({
  AudioOutputRecorder: () => <button type="button">record output</button>,
}));

describe("harmonic-distrotion-effect client", () => {
  it("renders a usable generated effect interface", () => {
    render(<HarmonicDistrotionEffectClient />);

    expect(screen.getByText("Harmonic Distrotion Effect")).toBeInTheDocument();
    expect(screen.getByLabelText("effect prompt")).toBeInTheDocument();
    expect(screen.getByText("effect controls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate patch/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start input/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy patch json/i })).toBeInTheDocument();
  });
});
