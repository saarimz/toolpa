import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { PatternLiveTrace } from "@/components/pattern-live-trace";
import { publishPatternPlaybackTrace } from "@/lib/audio/playback-agency";

describe("PatternLiveTrace", () => {
  it("renders fired and skipped playback agency events for the active pattern", async () => {
    render(<PatternLiveTrace patternId="pattern-1" />);

    act(() => {
      publishPatternPlaybackTrace({
        patternId: "other",
        patternName: "other",
        trackId: "track",
        trackName: "ignored",
        stepIndex: 0,
        stepInTrack: 0,
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
      publishPatternPlaybackTrace({
        patternId: "pattern-1",
        patternName: "pattern",
        trackId: "track",
        trackName: "slice 1",
        stepIndex: 1,
        stepInTrack: 1,
        barIndex: 0,
        timeSec: 0.25,
        fired: false,
        reason: "skip-prob",
        velocity: 0.7,
        microShift: 0,
        probability: 0.4,
        pitchCents: 0,
        playbackRate: 1,
        repeatCount: 1,
      });
    });

    expect(await screen.findByText("slice 1 / 2")).toBeInTheDocument();
    expect(screen.getByText("prob")).toBeInTheDocument();
    expect(screen.queryByText(/ignored/)).not.toBeInTheDocument();
  });
});
