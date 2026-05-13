import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EvolvingFmSynthClient } from "@/app/tools/evolving-fm-synth/client";
import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { fetchSynthSceneFromGateway } from "@/app/tools/evolving-fm-synth/lib/gateway-request";
import { playEvolvingFmSynthScene } from "@/app/tools/evolving-fm-synth/lib/tone-playback";
import { useEvolvingFmSynthStore } from "@/app/tools/evolving-fm-synth/store";
import { useFxPatternStore } from "@/lib/audio/use-fx-pattern";
import { encodeMidiFile } from "@/lib/midi/export";
import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { exportSynthSceneMidiArtifact } from "@/lib/tool-exports/adapters/synth-scene";

vi.mock("@/app/tools/evolving-fm-synth/lib/gateway-request", () => ({
  SynthGatewayTimeoutError: class SynthGatewayTimeoutError extends Error {},
  fetchSynthSceneFromGateway: vi.fn(),
}));

vi.mock("@/app/tools/evolving-fm-synth/lib/tone-playback", () => ({
  playEvolvingFmSynthScene: vi.fn(async () => undefined),
  stopEvolvingFmSynthScene: vi.fn(async () => undefined),
}));

vi.mock("@/components/audio-output-recorder", () => ({
  AudioOutputRecorder: () => <button type="button">record output</button>,
}));

vi.mock("@/lib/tool-exports/adapters/synth-scene", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tool-exports/adapters/synth-scene")>(
    "@/lib/tool-exports/adapters/synth-scene",
  );
  return {
    ...actual,
    exportSynthSceneMidiArtifact: vi.fn(() => ({
      bytes: new Uint8Array([1, 2, 3]),
      evidence: {
        noteCount: 8,
        ok: true,
        reasons: [],
        trackCount: 2,
      },
      filename: "scene.mid",
      kind: "audio/midi",
      source: {
        documentHash: "abc",
        documentId: "scene",
        documentKind: "synth-scene",
        schemaVersion: 1,
        toolSlug: "evolving-fm-synth",
      },
    })),
  };
});

const defaultPrompt =
  "dub techno in F minor at 124 bpm over 32 bars, evolving pads, warm tape drift, deep feedback delay";

describe("EvolvingFmSynthClient", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    const scene = createDefaultSynthScene(defaultPrompt);
    useEvolvingFmSynthStore.setState({
      prompt: defaultPrompt,
      scene,
      isPlaying: false,
      currentStepIndex: null,
      selectedVoiceId: scene.voices[0]?.id ?? "sub-fm",
      selectedStepIndex: null,
      generationCount: 0,
    });
    useGlobalMusicContextStore.setState({
      context: DEFAULT_GLOBAL_MUSIC_CONTEXT,
      hydrated: false,
    });
    useFxPatternStore.setState({ patterns: {} });
    vi.mocked(fetchSynthSceneFromGateway).mockReset();
    vi.mocked(playEvolvingFmSynthScene).mockReset();
    vi.mocked(playEvolvingFmSynthScene).mockResolvedValue(undefined);
    vi.mocked(exportSynthSceneMidiArtifact).mockClear();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  it("shows an overlay while the synth generation prompt is running", async () => {
    const scene = createDefaultSynthScene(defaultPrompt);
    let resolveGateway!: () => void;
    vi.mocked(fetchSynthSceneFromGateway).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGateway = () =>
            resolve({
              scene,
              source: "gateway",
              warning: null,
            });
        }),
    );

    render(<EvolvingFmSynthClient />);

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "generating synth prompt",
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Prompting the LLM for an evolving FM synth scene.",
    );

    resolveGateway();
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  }, 10000);

  it("shows timeout fallback as a local patch status instead of a raw warning", async () => {
    const scene = createDefaultSynthScene(defaultPrompt);
    vi.mocked(fetchSynthSceneFromGateway).mockResolvedValue({
      scene,
      source: "local-agent",
      warning: "Gateway timed out; kept local patch.",
    });

    render(<EvolvingFmSynthClient />);

    await userEvent.click(screen.getByRole("button", { name: "generate" }));

    await waitFor(() => {
      expect(screen.getByText("agent local patch")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Gateway timed out/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/local-agent/)).not.toBeInTheDocument();
  }, 10000);

  it("hydrates the synth prompt from the prompt query param", async () => {
    window.history.replaceState(
      null,
      "",
      "/tools/evolving-fm-synth?prompt=glassy%20dorian%20fm%20bed",
    );

    render(<EvolvingFmSynthClient />);

    await waitFor(() => {
      expect(screen.getByLabelText(/synth prompt/i)).toHaveValue(
        "glassy dorian fm bed",
      );
    });
  });

  it("lets each selected voice choose a carrier root waveform", async () => {
    render(<EvolvingFmSynthClient />);

    const rootWaveSelect = screen.getByLabelText(/root wave/i);
    expect(rootWaveSelect).toHaveValue("wavetable");

    await userEvent.selectOptions(rootWaveSelect, "square");

    await waitFor(() => {
      expect(screen.getByLabelText(/root wave/i)).toHaveValue("square");
    });
    expect(
      useEvolvingFmSynthStore.getState().scene.voices[0]?.patch.rootWaveform,
    ).toBe("square");
  });

  it("exports the current synth scene as MIDI from the L1 surface", async () => {
    render(<EvolvingFmSynthClient />);

    await userEvent.click(screen.getByRole("button", { name: /download midi/i }));

    expect(exportSynthSceneMidiArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: useEvolvingFmSynthStore.getState().scene,
        toolSlug: "evolving-fm-synth",
      }),
    );
    expect(screen.getByRole("region", { name: /midi playback/i })).toBeInTheDocument();
  });

  it("imports uploaded MIDI files into the synth scene", async () => {
    const user = userEvent.setup();
    render(<EvolvingFmSynthClient />);
    const bytes = encodeMidiFile({
      bpm: 96,
      format: 1,
      name: "Upload",
      tracks: [
        {
          name: "lead",
          notes: [{ midi: 72, startBeat: 0, durationBeats: 1, velocity: 0.7 }],
        },
      ],
    });
    const fileBytes = new Uint8Array(bytes.byteLength);
    fileBytes.set(bytes);
    const file = new File([fileBytes], "lead.mid", { type: "audio/midi" });

    await user.upload(screen.getByLabelText(/upload midi/i), file);

    await waitFor(() => {
      expect(useEvolvingFmSynthStore.getState().scene.metadata.createdBy).toBe("import");
    });
    expect(screen.getByText("agent midi import")).toBeInTheDocument();
    expect(useEvolvingFmSynthStore.getState().scene.voices[0]?.label).toBe("lead");
  });

  it("plays through the selected fx slot pattern", async () => {
    render(<EvolvingFmSynthClient />);

    await userEvent.selectOptions(screen.getAllByLabelText("effect")[0]!, "chorus");
    await userEvent.click(screen.getByRole("button", { name: "play" }));

    expect(screen.getByText("fx slots")).toBeInTheDocument();
    expect(playEvolvingFmSynthScene).toHaveBeenCalledWith(
      useEvolvingFmSynthStore.getState().scene,
      {
        fxPattern: expect.objectContaining({
          slots: expect.arrayContaining([
            expect.objectContaining({ effect: "chorus", id: "A" }),
          ]),
        }),
      },
    );
  });
});
