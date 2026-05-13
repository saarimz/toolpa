import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { FxSlotPanel } from "@/components/fx-slot-panel";
import { useFxPatternStore } from "@/lib/audio/use-fx-pattern";

describe("FxSlotPanel", () => {
  beforeEach(() => {
    useFxPatternStore.setState({ patterns: {} });
  });

  it("edits probabilistic wet controls for a slot", async () => {
    render(<FxSlotPanel toolId="test-tool" />);

    const slotA = screen.getByText("slot A").closest("div")?.parentElement;
    expect(slotA).not.toBeNull();
    if (!slotA) {
      throw new Error("slot A control was not rendered");
    }

    await userEvent.selectOptions(within(slotA).getByLabelText("effect"), "delay");
    await userEvent.click(within(slotA).getByLabelText("probability"));
    fireEvent.change(within(slotA).getByLabelText(/every/i), {
      target: { value: "8" },
    });
    fireEvent.change(within(slotA).getByLabelText(/smooth/i), {
      target: { value: "40" },
    });

    const pattern = useFxPatternStore.getState().patterns["test-tool"];
    expect(pattern?.slots[0]).toMatchObject({
      effect: "delay",
      probability: {
        enabled: true,
        intervalSteps: 8,
        smoothMs: 40,
      },
    });
    expect(within(slotA).getByLabelText(/chance/i)).toBeInTheDocument();
    expect(within(slotA).getByLabelText(/min wet/i)).toBeInTheDocument();
    expect(within(slotA).getByLabelText(/max wet/i)).toBeInTheDocument();
  });

  it("edits model-specific vintage FX parameters for a slot", async () => {
    render(<FxSlotPanel toolId="test-tool" />);

    const slotA = screen.getByText("slot A").closest("div")?.parentElement;
    expect(slotA).not.toBeNull();
    if (!slotA) {
      throw new Error("slot A control was not rendered");
    }

    await userEvent.selectOptions(
      within(slotA).getByLabelText("effect"),
      "emu-z-plane-morph",
    );
    await userEvent.selectOptions(within(slotA).getByLabelText("from"), "notch-sweep");
    const morphInput = within(slotA)
      .getByText("morph")
      .closest("label")
      ?.querySelector("input");
    expect(morphInput).not.toBeNull();
    if (!morphInput) {
      throw new Error("morph control was not rendered");
    }
    fireEvent.change(morphInput, {
      target: { value: "0.8" },
    });

    const pattern = useFxPatternStore.getState().patterns["test-tool"];
    expect(pattern?.slots[0]).toMatchObject({
      effect: "emu-z-plane-morph",
      params: {
        frameA: "notch-sweep",
        frameB: "glass-phaser",
        morph: 0.8,
        resonance: 0.72,
      },
      wet: 0.43,
    });
    expect(within(slotA).getByText("filter-bank-morph")).toBeInTheDocument();
    expect(within(slotA).getByText("jungle")).toBeInTheDocument();
  });
});
