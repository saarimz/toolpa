import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpliceGenerationPanel } from "@/app/tools/splice-lab/components/generation-panel";
import { createSpliceLabState } from "@/app/tools/splice-lab/lib/pattern";
import { useSpliceLabStore } from "@/app/tools/splice-lab/store";

describe("SpliceGenerationPanel", () => {
  beforeEach(() => {
    useSpliceLabStore.setState({
      ...createSpliceLabState({
        sources: [
          { sampleId: "library:jungle/let-there-break", name: "break", role: "break" },
          { sampleId: "library:tones/warm-pad", name: "pad", role: "pad" },
        ],
      }),
      currentStepIndex: null,
      ghostPatterns: [],
      isPlaying: false,
      selectedStep: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("shows an overlay while the LLM generates a splice map", async () => {
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
      "/tools/splice-lab?prompt=source%20switch%20breakdown",
    );

    render(<SpliceGenerationPanel />);

    expect(screen.getByLabelText(/generation prompt/i)).toHaveValue(
      "source switch breakdown",
    );

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "generating splice map",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the LLM for a multi-source splice map",
    );

    closeStream();
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("falls back to a local splice map when the gateway fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Gateway timed out"));

    render(<SpliceGenerationPanel />);

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    expect(
      await screen.findByText(/Gateway failed; used local splice map instead/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/local-agent/i)).toBeInTheDocument();
    expect(screen.getByText(/Local splice fallback/i)).toBeInTheDocument();
    expect(
      useSpliceLabStore
        .getState()
        .cells.some((cell) => cell.source !== "rest"),
    ).toBe(true);
  });
});
