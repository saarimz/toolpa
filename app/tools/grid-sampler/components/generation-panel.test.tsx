import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GridGenerationPanel } from "@/app/tools/grid-sampler/components/generation-panel";

describe("GridGenerationPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an overlay while the LLM generates a grid pattern", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => undefined),
    );

    render(<GridGenerationPanel />);

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "generating grid pattern",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the LLM for a new grid pattern",
    );
  });
});
