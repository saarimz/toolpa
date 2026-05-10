import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SpliceGrid } from "@/app/tools/splice-lab/components/splice-grid";
import { createSpliceLabState } from "@/app/tools/splice-lab/lib/pattern";
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
});
