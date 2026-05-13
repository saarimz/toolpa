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

  it("renders a macro prompt first and hides manual controls until requested", async () => {
    render(<GlobalMusicControls />);

    expect(screen.getByText("1. macro context")).toBeInTheDocument();
    expect(screen.getByText("2. set manually")).toBeInTheDocument();
    expect(screen.getByLabelText(/tempo \+ key prompt/i)).toHaveAttribute(
      "placeholder",
      "Describe tempo, swing, key, and scale...",
    );
    expect(screen.getByRole("button", { name: "enter prompt" })).toBeDisabled();
    expect(screen.getByText("Enter a prompt to enable macro context.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/genre prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/scale prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByText("bpm + swing")).not.toBeInTheDocument();
    expect(screen.queryByText("root + scale")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "set manually" }));

    expect(screen.getByText("bpm + swing")).toBeInTheDocument();
    expect(screen.getByText("root + scale")).toBeInTheDocument();
    expect(screen.getByLabelText("bpm")).toBeInTheDocument();
    expect(screen.getByLabelText("swing")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("root"), "F#");
    await userEvent.selectOptions(screen.getByLabelText("scale"), "dorian");

    await waitFor(() => {
      expect(screen.getAllByText("F# Dorian").length).toBeGreaterThan(0);
    });
  });

  it("applies tempo, swing, root, and scale from one macro prompt", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/music/tempo-suggest") {
        return Promise.resolve(
          Response.json({
            selected: {
              bpm: 140,
              swing: 0.12,
              rationale: "The prompt wants a swung club tempo.",
            },
            alternatives: [],
            querySummary: "macro tempo",
          }),
        );
      }
      if (url === "/api/music/scale-search") {
        return Promise.resolve(
          Response.json({
            selected: {
              tonic: "F#",
              scaleId: "dorian",
              rationale: "F# Dorian keeps the prompt bright but minor.",
            },
            alternatives: [],
            querySummary: "macro scale",
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<GlobalMusicControls />);

    await userEvent.clear(screen.getByLabelText(/tempo \+ key prompt/i));
    await userEvent.type(
      screen.getByLabelText(/tempo \+ key prompt/i),
      "swung techno in F sharp dorian",
    );
    expect(screen.getByRole("button", { name: "set both" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "set both" }));

    await waitFor(() => {
      expect(screen.getByText("140 BPM / 12% swing / F# Dorian")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /applied/i })).toBeInTheDocument();
    expect(screen.getByText("Macro context applied to BPM, swing, root, and scale.")).toBeInTheDocument();
    expect(screen.queryByLabelText("bpm")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "set manually" }));

    expect(screen.getByLabelText("bpm")).toHaveValue(140);
    expect(screen.getByLabelText("swing")).toHaveValue(0.12);
    expect(screen.getAllByText("F# Dorian").length).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/music/tempo-suggest",
      expect.objectContaining({
        body: expect.stringContaining("swung techno in F sharp dorian"),
        method: "POST",
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/music/scale-search",
      expect.objectContaining({
        body: expect.stringContaining("swung techno in F sharp dorian"),
        method: "POST",
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/music/scale-search",
      expect.objectContaining({
        body: expect.stringContaining('"tonic":"F#"'),
      }),
    );
  });

  it("shows a scoped overlay while macro context is being generated", async () => {
    let resolveTempo!: (response: Response) => void;
    let resolveScale!: (response: Response) => void;
    let pendingFetches = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      pendingFetches += 1;
      const url = String(input);
      if (url === "/api/music/tempo-suggest") {
        return new Promise<Response>((resolve) => {
          resolveTempo = resolve;
        });
      }
      if (url === "/api/music/scale-search") {
        return new Promise<Response>((resolve) => {
          resolveScale = resolve;
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<GlobalMusicControls />);

    await userEvent.type(
      screen.getByLabelText(/tempo \+ key prompt/i),
      "124 bpm C dorian",
    );
    await userEvent.click(screen.getByRole("button", { name: "set both" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "generating tempo and key",
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting both music agents from one context prompt.",
    );
    expect(pendingFetches).toBe(2);

    resolveTempo(
      Response.json({
        selected: {
          bpm: 124,
          swing: 0.06,
          rationale: "Resolved test tempo.",
        },
        alternatives: [],
        querySummary: "test",
      }),
    );
    resolveScale(
      Response.json({
        selected: {
          tonic: "C",
          scaleId: "dorian",
          rationale: "Resolved test scale.",
        },
        alternatives: [],
        querySummary: "test",
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
