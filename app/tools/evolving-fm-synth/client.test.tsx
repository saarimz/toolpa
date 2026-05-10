import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EvolvingFmSynthClient } from "@/app/tools/evolving-fm-synth/client";
import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { fetchSynthSceneFromGateway } from "@/app/tools/evolving-fm-synth/lib/gateway-request";
import { useEvolvingFmSynthStore } from "@/app/tools/evolving-fm-synth/store";
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

const defaultPrompt =
  "dub techno in F minor at 124 bpm over 32 bars, evolving pads, warm tape drift, deep feedback delay";

describe("EvolvingFmSynthClient", () => {
  beforeEach(() => {
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
  });

  it("shows an overlay while the synth generation prompt is running", async () => {
    vi.mocked(fetchSynthSceneFromGateway).mockImplementation(
      () => new Promise(() => undefined),
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
  });

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
  });
});
