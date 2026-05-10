import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionClient } from "@/app/sessions/[id]/client";
import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

describe("SessionClient", () => {
  beforeEach(() => {
    useGlobalMusicContextStore.setState({
      context: DEFAULT_GLOBAL_MUSIC_CONTEXT,
      hydrated: true,
    });
    vi.restoreAllMocks();
  });

  it("mounts multiple tools and applies a session scale search result", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "fetch").mockResolvedValueOnce(
      Response.json({
        selected: {
          tonic: "F",
          scaleId: "dorian",
          rationale: "Dorian keeps the session modal and playable.",
        },
        alternatives: [],
        querySummary: "catalog search",
      }),
    );

    render(<SessionClient embedTools={false} sessionId="default" />);

    expect(screen.getByTitle("intelligence-sampler session tool")).toBeInTheDocument();
    expect(screen.getByTitle("evolving-fm-synth session tool")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /find scale/i }));

    await waitFor(() => {
      expect(useGlobalMusicContextStore.getState().context.key).toMatchObject({
        tonic: "F",
        scaleId: "dorian",
      });
    });
    expect(screen.getByText(/selected F dorian/i)).toBeInTheDocument();
  });
});
