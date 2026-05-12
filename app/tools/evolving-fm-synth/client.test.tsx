import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EvolvingFmSynthClient } from "@/app/tools/evolving-fm-synth/client";
import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { fetchSynthSceneFromGateway } from "@/app/tools/evolving-fm-synth/lib/gateway-request";
import { useEvolvingFmSynthStore } from "@/app/tools/evolving-fm-synth/store";
import { downloadSynthSceneMidi } from "@/lib/midi/synth-scene";
import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

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

vi.mock("@/lib/midi/synth-scene", () => ({
  downloadSynthSceneMidi: vi.fn(),
}));

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
    vi.mocked(fetchSynthSceneFromGateway).mockReset();
    vi.mocked(downloadSynthSceneMidi).mockReset();
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

    expect(downloadSynthSceneMidi).toHaveBeenCalledWith(
      useEvolvingFmSynthStore.getState().scene,
    );
  });
});
