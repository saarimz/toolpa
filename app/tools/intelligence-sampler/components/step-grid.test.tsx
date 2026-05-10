import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { StepGrid } from "@/app/tools/intelligence-sampler/components/step-grid";
import { useIntelligenceSamplerStore } from "@/app/tools/intelligence-sampler/store";
import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { createIntelligenceSamplerPattern } from "@/lib/pattern/defaults";

describe("StepGrid", () => {
  beforeEach(() => {
    useGlobalMusicContextStore.setState({
      context: DEFAULT_GLOBAL_MUSIC_CONTEXT,
      hydrated: true,
    });
  });

  it("toggles a step and opens the step editor", async () => {
    const pattern = createIntelligenceSamplerPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    useIntelligenceSamplerStore.setState({
      pattern,
      selectedStep: null,
    });

    render(<StepGrid />);

    const button = screen.getByTitle("slice 1 step 2");
    expect(button).toHaveTextContent("");

    await userEvent.click(button);

    expect(button).toHaveTextContent("0");
    expect(screen.getByText("slice 1 / 2")).toBeInTheDocument();
  });

  it("edits a track choke group default", async () => {
    const pattern = createIntelligenceSamplerPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    useIntelligenceSamplerStore.setState({
      pattern,
      selectedStep: { trackId: "slice-1", stepIndex: 0 },
    });

    render(<StepGrid />);

    await userEvent.selectOptions(screen.getByLabelText(/track choke group/i), "main");

    expect(
      useIntelligenceSamplerStore
        .getState()
        .pattern.tracks.find((track) => track.id === "slice-1")?.chokeGroup,
    ).toBe("main");
  });

  it("edits a step choke group override", async () => {
    const pattern = createIntelligenceSamplerPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    useIntelligenceSamplerStore.setState({
      pattern,
      selectedStep: { trackId: "slice-1", stepIndex: 0 },
    });

    render(<StepGrid />);

    await userEvent.selectOptions(screen.getByLabelText(/step choke group/i), "fills");

    expect(
      useIntelligenceSamplerStore
        .getState()
        .pattern.tracks.find((track) => track.id === "slice-1")?.steps[0]?.chokeGroup,
    ).toBe("fills");
  });

  it("edits scale-aware pitch controls manually", async () => {
    const pattern = createIntelligenceSamplerPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    useGlobalMusicContextStore.setState({
      context: {
        bpm: 128,
        swing: 0,
        key: { tonic: "F", scaleId: "slendro-cents", referenceFrequency: 440 },
      },
      hydrated: true,
    });
    useIntelligenceSamplerStore.setState({
      pattern,
      selectedStep: { trackId: "slice-1", stepIndex: 0 },
    });

    render(<StepGrid />);

    await userEvent.type(screen.getByLabelText(/scale degree/i), "2");

    expect(
      useIntelligenceSamplerStore
        .getState()
        .pattern.tracks.find((track) => track.id === "slice-1")?.steps[0]?.tuningRef,
    ).toEqual({ scaleId: "slendro-cents", degree: 2 });
  });
});
