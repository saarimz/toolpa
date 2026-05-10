import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DrumGrid } from "@/app/tools/drum-machine/components/drum-grid";
import { createDefaultDrumPattern } from "@/app/tools/drum-machine/lib/polyrhythm";
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
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1]!, "8");

    const pattern = useDrumMachineStore.getState().pattern;
    expect(pattern.tracks[0]?.steps[1]?.active).toBe(true);
    expect(pattern.tracks[0]?.steps).toHaveLength(8);
  });
});
