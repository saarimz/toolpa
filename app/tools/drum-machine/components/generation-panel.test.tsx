import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DrumGenerationPanel } from "@/app/tools/drum-machine/components/generation-panel";

describe("DrumGenerationPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an overlay while the LLM generates a drum pattern", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => undefined),
    );

    render(<DrumGenerationPanel />);

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "generating drum pattern",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the LLM for a drum pattern",
    );
  });
});
