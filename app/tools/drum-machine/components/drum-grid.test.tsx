import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DrumGrid,
  DrumSourceControls,
} from "@/app/tools/drum-machine/components/drum-grid";
import { createDefaultDrumPattern } from "@/app/tools/drum-machine/lib/polyrhythm";
import { publishPatternPlaybackTrace } from "@/lib/audio/playback-agency";
import { useDrumMachineStore } from "@/app/tools/drum-machine/store";

vi.mock("@/components/sample-picker", () => ({
  SamplePicker({
    id,
    label,
    onSelect,
    value,
  }: {
    id: string;
    label: string;
    onSelect: (sample: { id: string; name: string; role: "oneshot" }) => void;
    value: string;
  }) {
    return (
      <label>
        {label}
        <select
          aria-label={label}
          id={id}
          onChange={(event) =>
            onSelect({
              id: event.currentTarget.value,
              name: event.currentTarget.value,
              role: "oneshot",
            })
          }
          value={value}
        >
          <option value={value}>{value}</option>
          <option value="library:test/alt">library:test/alt</option>
        </select>
      </label>
    );
  },
}));

describe("DrumGrid", () => {
  beforeEach(() => {
    useDrumMachineStore.setState({
      geometryPlan: null,
      ghostPatterns: [],
      isPlaying: false,
      laneSampleNames: {
        hat: "Let There Break",
        kick: "Let There Break",
        perc: "Let There Break",
        snare: "Let There Break",
      },
      sampleId: "library:jungle/let-there-break",
      sampleMode: "slice",
      sampleName: "Let There Break",
      pattern: createDefaultDrumPattern("library:jungle/let-there-break"),
      sampleRole: "break",
      selectedStep: null,
    });
  });

  it("toggles steps and resizes track lengths", async () => {
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
      pattern,
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

  it("switches from one sliced source to per-lane sample selectors", async () => {
    render(<DrumSourceControls />);

    expect(screen.getByLabelText("source")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "multi-sample" }));

    expect(useDrumMachineStore.getState().sampleMode).toBe("multi");
    expect(screen.getByLabelText("kick source")).toBeInTheDocument();
    expect(screen.getByLabelText("snare source")).toBeInTheDocument();
  });
});
