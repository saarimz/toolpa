import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { DrumGrid } from "@/app/tools/drum-machine/components/drum-grid";
import { createDefaultDrumPattern } from "@/app/tools/drum-machine/lib/polyrhythm";
import { publishPatternPlaybackTrace } from "@/lib/audio/playback-agency";
import { useDrumMachineStore } from "@/app/tools/drum-machine/store";

describe("DrumGrid", () => {
  it("toggles steps and resizes track lengths", async () => {
    useDrumMachineStore.setState({
      sampleId: "library:jungle/let-there-break",
      sampleName: "Let There Break",
      pattern: createDefaultDrumPattern("library:jungle/let-there-break"),
      selectedStep: null,
    });

    render(<DrumGrid />);

    await userEvent.click(screen.getByTitle("kick step 2"));
    await userEvent.selectOptions(screen.getByLabelText("kick step count"), "8");

    const pattern = useDrumMachineStore.getState().pattern;
    expect(pattern.tracks[0]?.steps[1]?.active).toBe(true);
    expect(pattern.tracks[0]?.steps).toHaveLength(8);
  });

  it("annotates drum cells with live playback agency", () => {
    const pattern = createDefaultDrumPattern("library:jungle/let-there-break");
    useDrumMachineStore.setState({
      sampleId: "library:jungle/let-there-break",
      sampleName: "Let There Break",
      pattern,
      selectedStep: null,
    });

    render(<DrumGrid />);

    act(() => {
      publishPatternPlaybackTrace({
        patternId: pattern.id,
        patternName: pattern.name,
        trackId: "kick",
        trackName: "kick",
        stepIndex: 0,
        stepInTrack: 0,
        slot: 0,
        barIndex: 0,
        timeSec: 0,
        fired: false,
        reason: "skip-prob",
        velocity: 1,
        microShift: 0,
        probability: 0.4,
        pitchCents: 0,
        playbackRate: 1,
        repeatCount: 1,
      });
    });

    expect(
      within(screen.getByTitle("kick step 1")).getByLabelText(
        "playback agency prob",
      ),
    ).toBeInTheDocument();
  });
});
