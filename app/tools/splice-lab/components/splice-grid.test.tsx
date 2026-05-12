import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { SpliceGrid } from "@/app/tools/splice-lab/components/splice-grid";
import { createSpliceLabState } from "@/app/tools/splice-lab/lib/pattern";
import { publishPatternPlaybackTrace } from "@/lib/audio/playback-agency";
import { useSpliceLabStore } from "@/app/tools/splice-lab/store";

describe("SpliceGrid", () => {
  it("cycles a step through rest, A, and B and edits slot mapping", async () => {
    useSpliceLabStore.setState({
      ...createSpliceLabState({
        sourceAId: "library:a",
        sourceAName: "A",
        sourceBId: "library:b",
        sourceBName: "B",
      }),
      selectedStep: null,
    });

    render(<SpliceGrid />);

    const first = screen.getByTitle("splice step 1");
    await userEvent.click(first);
    expect(useSpliceLabStore.getState().cells[0]?.source).toBe("B");

    fireEvent.contextMenu(first);
    await userEvent.selectOptions(screen.getByLabelText(/source/i), "A");
    fireEvent.change(screen.getByLabelText(/slot A/i), { target: { value: "3" } });

    expect(useSpliceLabStore.getState().cells[0]?.source).toBe("A");
    expect(useSpliceLabStore.getState().cells[0]?.slots.A).toBe(3);
  });

  it("annotates source cells with live playback agency", () => {
    useSpliceLabStore.setState({
      ...createSpliceLabState({
        sourceAId: "library:a",
        sourceAName: "A",
        sourceBId: "library:b",
        sourceBName: "B",
      }),
      selectedStep: null,
    });

    render(<SpliceGrid />);

    act(() => {
      publishPatternPlaybackTrace({
        patternId: "splice-lab-pattern",
        patternName: "splice lab loop",
        trackId: "source-a",
        trackName: "source A",
        stepIndex: 0,
        stepInTrack: 0,
        slot: 0,
        barIndex: 0,
        timeSec: 0,
        fired: true,
        reason: "fired",
        velocity: 1,
        microShift: 0,
        probability: 1,
        pitchCents: 0,
        playbackRate: 1,
        repeatCount: 1,
      });
    });

    expect(
      within(screen.getByTitle("splice step 1")).getByLabelText(
        "playback agency fire",
      ),
    ).toBeInTheDocument();
  });
});
