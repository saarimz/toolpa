import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalMusicControls } from "@/components/music/global-music-controls";
import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

describe("GlobalMusicControls", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGlobalMusicContextStore.setState({
      context: DEFAULT_GLOBAL_MUSIC_CONTEXT,
      hydrated: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders separate tempo and scale modules with manual controls", async () => {
    render(<GlobalMusicControls />);

    expect(screen.getByText("bpm + swing")).toBeInTheDocument();
    expect(screen.getByText("root + scale")).toBeInTheDocument();
    expect(screen.getByLabelText(/genre prompt/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/scale prompt/i)).toBeInTheDocument();
    expect(screen.getByLabelText("bpm")).toBeInTheDocument();
    expect(screen.getByLabelText("swing")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("root"), "F#");
    await userEvent.selectOptions(screen.getByLabelText("scale"), "dorian");

    await waitFor(() => {
      expect(screen.getAllByText("F# Dorian").length).toBeGreaterThan(0);
    });
  });

  it("applies suggested BPM and swing values from the genre prompt", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        selected: {
          bpm: 134,
          swing: 0.16,
          rationale: "UK garage wants a shuffled mid-130s grid.",
        },
        alternatives: [
          {
            bpm: 168,
            swing: 0.07,
            rationale: "Jungle alternative.",
          },
        ],
        querySummary: "picked from groove references",
      }),
    );

    render(<GlobalMusicControls />);

    await userEvent.clear(screen.getByLabelText(/genre prompt/i));
    await userEvent.type(screen.getByLabelText(/genre prompt/i), "uk garage shuffle");
    await userEvent.click(screen.getByRole("button", { name: "suggest" }));

    await waitFor(() => {
      expect(screen.getByText("134 BPM / 16% swing")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("bpm")).toHaveValue(134);
    expect(screen.getByLabelText("swing")).toHaveValue(0.16);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/music/tempo-suggest",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("shows a scoped overlay while BPM and swing are being generated", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => undefined),
    );

    render(<GlobalMusicControls />);

    await userEvent.click(screen.getByRole("button", { name: "suggest" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "generating BPM and swing",
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the LLM for genre-aware tempo and groove.",
    );
  });

  it("shows a scoped overlay while root and scale are being generated", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => undefined),
    );

    render(<GlobalMusicControls />);

    await userEvent.click(screen.getByRole("button", { name: "agent pick" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "generating root and scale",
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the LLM for a matching root and scale.",
    );
  });
});
