import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TimeStretchClient } from "@/app/tools/time-stretch/client";

vi.mock("@/components/sample-picker", () => ({
  SamplePicker: ({ value }: { value: string }) => <div>sample picker {value}</div>,
}));

vi.mock("@/components/tool-export-panel", () => ({
  ToolExportPanel: () => <div>export panel</div>,
}));

vi.mock("@/lib/music/use-global-context-sync", () => ({
  useGlobalBpmSync: () => undefined,
}));

describe("TimeStretchClient", () => {
  it("applies prompt language to visible stretch controls", async () => {
    const user = userEvent.setup();
    render(<TimeStretchClient />);

    await user.clear(screen.getByLabelText("stretch prompt"));
    await user.type(
      screen.getByLabelText("stretch prompt"),
      "stretch to 64 bars at 100 bpm as a frozen wide subharmonic drone",
    );
    await user.click(screen.getByRole("button", { name: /apply prompt/i }));

    expect(screen.getByLabelText("bars")).toHaveValue("64");
    expect(screen.getByLabelText("bpm")).toHaveValue(100);
    expect(screen.getByLabelText("mode")).toHaveValue("spectral-freeze");
    expect(screen.getByText(/subharmonic-bloom/i)).toBeInTheDocument();
  });

  it("allows clearing and retyping window milliseconds without parser crashes", async () => {
    const user = userEvent.setup();
    render(<TimeStretchClient />);

    const windowInput = screen.getByLabelText("window ms");
    await user.clear(windowInput);
    await user.type(windowInput, "50");

    expect(windowInput).toHaveValue(50);
  });

  it("applies disintegration performance language to visible controls", async () => {
    const user = userEvent.setup();
    render(<TimeStretchClient />);

    await user.clear(screen.getByLabelText("stretch prompt"));
    await user.type(
      screen.getByLabelText("stretch prompt"),
      "make it an evolving ambient performance like disintegration loops",
    );
    await user.click(screen.getByRole("button", { name: /apply prompt/i }));

    expect(screen.getByLabelText("performance")).toHaveValue("disintegration-loop");
    expect(screen.getByLabelText(/degradation/i)).not.toHaveValue("0");
  });
});
