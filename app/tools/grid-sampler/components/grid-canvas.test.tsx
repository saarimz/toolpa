import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GridCanvas } from "@/app/tools/grid-sampler/components/grid-canvas";
import { createGridSamplerState } from "@/app/tools/grid-sampler/lib/pattern";
import { useGridSamplerStore } from "@/app/tools/grid-sampler/store";

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
});
