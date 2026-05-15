import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AudioVisualizerClient } from "@/app/tools/audio-visualizer/client";

describe("AudioVisualizerClient", () => {
  it("renders prompt, input, fullscreen, and scene controls", () => {
    render(<AudioVisualizerClient />);

    expect(screen.getByText("Audio Visualizer")).toBeInTheDocument();
    expect(screen.getByLabelText("visualizer prompt")).toBeInTheDocument();
    expect(screen.getByText("recorded input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fullscreen/i })).toBeInTheDocument();
    expect(screen.getByLabelText("source")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "live audio" })).toBeInTheDocument();
    expect(screen.getByLabelText("mode")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "spectral bloom" })).toBeInTheDocument();
    expect(screen.getByLabelText("palette")).toBeInTheDocument();
  });
});
