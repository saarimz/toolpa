import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DrumGenerationPanel } from "@/app/tools/drum-machine/components/generation-panel";

describe("DrumGenerationPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("shows an overlay while the LLM generates a drum pattern", async () => {
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
      "/tools/drum-machine?prompt=half%20time%20ritual%20drums",
    );

    render(<DrumGenerationPanel />);

    expect(screen.getByLabelText(/generation prompt/i)).toHaveValue(
      "half time ritual drums",
    );

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "generating drum pattern",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the LLM for a drum pattern",
    );

    closeStream();
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
