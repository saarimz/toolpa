import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DrumGenerationPanel } from "@/app/tools/drum-machine/components/generation-panel";
import { createDefaultDrumPattern } from "@/app/tools/drum-machine/lib/polyrhythm";
import { useDrumMachineStore } from "@/app/tools/drum-machine/store";

describe("DrumGenerationPanel", () => {
  beforeEach(() => {
    resetStore();
  });

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

  it("applies prompt text as deterministic geometry math", async () => {
    window.history.replaceState(
      null,
      "",
      "/tools/drum-machine?prompt=bossa%20nova%20swing%20rhythm",
    );

    render(<DrumGenerationPanel />);

    await userEvent.click(screen.getByRole("button", { name: "apply math" }));

    const state = useDrumMachineStore.getState();
    expect(state.geometryPlan?.name).toContain("bossa");
    expect(state.pattern.tracks[0]?.steps.map((step, index) => step.active ? index : null).filter((index) => index !== null)).toEqual([
      0, 3, 6, 10, 13,
    ]);
    expect(screen.getAllByText(/Generate E\(5,16\)/).length).toBeGreaterThan(0);
  });

  it("sends sample mode and lane samples to generation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    useDrumMachineStore
      .getState()
      .setLaneSample("snare", "library:zero-g/glasychord", "Glasychord", "pad");

    render(<DrumGenerationPanel />);

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as {
      context: {
        sampleMode?: string;
        trackSamples?: Array<{ sampleId: string; sampleName?: string; trackId: string }>;
      };
    };

    expect(body.context.sampleMode).toBe("multi");
    expect(body.context.trackSamples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sampleId: "library:zero-g/glasychord",
          sampleName: "Glasychord",
          trackId: "snare",
        }),
      ]),
    );
  });
});

function resetStore() {
  useDrumMachineStore.setState({
    geometryPlan: null,
    ghostPatterns: [],
    isPlaying: false,
    laneSampleNames: {
      hat: "Let There Break",
      kick: "Let There Break",
      perc: "Let There Break",
      snare: "Let There Break",
    },
    pattern: createDefaultDrumPattern("library:jungle/let-there-break", "Let There Break"),
    sampleId: "library:jungle/let-there-break",
    sampleMode: "slice",
    sampleName: "Let There Break",
    sampleRole: "break",
    selectedStep: null,
  });
}
