import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CircularDrumGeometry } from "@/app/tools/drum-machine/components/circular-rhythm";
import { createDefaultDrumPattern } from "@/app/tools/drum-machine/lib/polyrhythm";
import { useDrumMachineStore } from "@/app/tools/drum-machine/store";

describe("CircularDrumGeometry", () => {
  it("renders ring metrics and toggles pulses", async () => {
    useDrumMachineStore.setState({
      geometryPlan: null,
      pattern: createDefaultDrumPattern("library:jungle/let-there-break"),
      sampleId: "library:jungle/let-there-break",
      sampleName: "Let There Break",
      selectedStep: null,
    });

    render(<CircularDrumGeometry />);

    expect(screen.getByLabelText("kick circular rhythm")).toBeInTheDocument();
    expect(screen.getAllByText("E(2,16) r0").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByLabelText("kick pulse 2"));

    const kick = useDrumMachineStore.getState().pattern.tracks.find((track) => track.id === "kick");
    expect(kick?.steps[1]?.active).toBe(true);
  });

  it("regenerates a track from hit and rotation controls", () => {
    useDrumMachineStore.setState({
      geometryPlan: null,
      pattern: createDefaultDrumPattern("library:jungle/let-there-break"),
      sampleId: "library:jungle/let-there-break",
      sampleName: "Let There Break",
      selectedStep: null,
    });

    render(<CircularDrumGeometry />);

    fireEvent.change(screen.getByLabelText("kick hits"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("kick rotation"), {
      target: { value: "2" },
    });

    const kick = useDrumMachineStore.getState().pattern.tracks.find((track) => track.id === "kick");
    expect(kick?.steps.filter((step) => step.active)).toHaveLength(3);
    expect(kick?.steps[2]?.active).toBe(true);
  });
});
