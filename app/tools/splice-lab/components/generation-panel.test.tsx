import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpliceGenerationPanel } from "@/app/tools/splice-lab/components/generation-panel";

describe("SpliceGenerationPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an overlay while the LLM generates a splice map", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => undefined),
    );

    render(<SpliceGenerationPanel />);

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "generating splice map",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the LLM for a multi-source splice map",
    );
  });
});
