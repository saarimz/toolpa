import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { GridCanvas } from "@/app/tools/grid-sampler/components/grid-canvas";
import { createGridSamplerState } from "@/app/tools/grid-sampler/lib/pattern";
import { publishPatternPlaybackTrace } from "@/lib/audio/playback-agency";
import { useGridSamplerStore } from "@/app/tools/grid-sampler/store";

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: vi.fn(async (sampleId: string) => ({
    id: sampleId,
    name: "sample",
    origin: "library",
    audioBuffer: {
      duration: 1,
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 4,
      getChannelData: () => Float32Array.from([0, 0.5, -0.75, 1]),
    },
  })),
}));

vi.mock("@/lib/samples/analysis/library-cache", () => ({
  hasLibraryAnalysis: vi.fn(() => false),
}));

describe("GridCanvas", () => {
  it("toggles cells and changes traversal", async () => {
    const state = createGridSamplerState(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    useGridSamplerStore.setState({
      ...state,
      sliceCount: 32,
      cells: state.cells.slice(0, 32),
    });

    render(<GridCanvas />);

    await userEvent.selectOptions(screen.getByLabelText(/traversal/i), "Diagonal");
    await userEvent.click(screen.getByLabelText(/slice 2, play 2, active/i));

    expect(useGridSamplerStore.getState().traversal).toBe("Diagonal");
    expect(useGridSamplerStore.getState().cells[1]?.active).toBe(false);
  });

  it("highlights the cell reached by the active traversal step", () => {
    const state = createGridSamplerState(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    useGridSamplerStore.setState({
      ...state,
      sliceCount: 32,
      cells: state.cells.slice(0, 32),
      traversal: "RL",
      currentStepIndex: 0,
    });

    render(<GridCanvas />);

    const playhead = screen.getByLabelText(/slice 8, play 1, active/i);
    expect(playhead).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(playhead.className).toContain("shadow-[0_0_0_1px");
    expect(screen.getByLabelText(/slice 1, play 8, active/i)).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("offers compact grid sizes", () => {
    const state = createGridSamplerState(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    useGridSamplerStore.setState(state);

    render(<GridCanvas />);

    expect(screen.getByRole("option", { name: "4" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "8" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "16" })).toBeInTheDocument();
  });

  it("annotates grid cells by playback trace slot", () => {
    const state = createGridSamplerState(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    useGridSamplerStore.setState({
      ...state,
      sliceCount: 32,
      cells: state.cells.slice(0, 32),
    });

    render(<GridCanvas />);

    act(() => {
      publishPatternPlaybackTrace({
        patternId: "grid-sampler-pattern",
        patternName: "grid 32 LR",
        trackId: "grid",
        trackName: "grid",
        stepIndex: 1,
        stepInTrack: 1,
        slot: 1,
        barIndex: 0,
        timeSec: 0.25,
        fired: true,
        reason: "fired",
        velocity: 1,
        microShift: 0.05,
        probability: 1,
        pitchCents: 0,
        playbackRate: 1,
        repeatCount: 1,
      });
    });

    expect(
      within(screen.getByLabelText(/slice 2, play 2, active/i)).getByLabelText(
        "playback agency shift",
      ),
    ).toBeInTheDocument();
  });
});
