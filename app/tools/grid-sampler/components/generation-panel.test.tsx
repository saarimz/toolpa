import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GridGenerationPanel } from "@/app/tools/grid-sampler/components/generation-panel";

describe("GridGenerationPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("shows an overlay while the LLM generates a grid pattern", async () => {
    let closeStream: () => void = () => undefined;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            closeStream = () => controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    window.history.replaceState(
      null,
      "",
      "/tools/grid-sampler?prompt=spiral%20glass%20grid",
    );

    render(<GridGenerationPanel />);

    expect(screen.getByLabelText(/generation prompt/i)).toHaveValue("spiral glass grid");

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "generating grid pattern",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the LLM for a new grid pattern",
    );

    closeStream();
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
