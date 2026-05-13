import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MidiGeneratorClient } from "@/app/tools/midi-generator/client";
import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

const playbackMock = vi.hoisted(() => ({
  playMidiClipPreview: vi.fn(async () => undefined),
  stopMidiClipPreview: vi.fn(async () => undefined),
}));

vi.mock("@/app/tools/midi-generator/lib/tone-playback", () => ({
  playMidiClipPreview: playbackMock.playMidiClipPreview,
  stopMidiClipPreview: playbackMock.stopMidiClipPreview,
}));

vi.mock("@/components/audio-output-recorder", () => ({
  AudioOutputRecorder: () => <div>recorder</div>,
}));

describe("MidiGeneratorClient", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGlobalMusicContextStore.setState({
      context: DEFAULT_GLOBAL_MUSIC_CONTEXT,
      hydrated: false,
    });
    playbackMock.playMidiClipPreview.mockClear();
    playbackMock.stopMidiClipPreview.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    });
  });

  it("renders the standalone MIDI clip instrument and generates prompted clips", async () => {
    const user = userEvent.setup();
    render(<MidiGeneratorClient />);

    expect(screen.getByRole("heading", { name: "MIDI Generator" })).toBeInTheDocument();
    expect(screen.getByText("document")).toBeInTheDocument();
    expect(screen.getByText("midi-clip")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("generation prompt"));
    await user.type(
      screen.getByLabelText("generation prompt"),
      "2 bars in Bb melodic minor at 96 bpm straight expressive lead",
    );
    await user.click(screen.getByRole("button", { name: /generate midi/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/96 bpm/).length).toBeGreaterThan(0);
    });
    expect(useGlobalMusicContextStore.getState().context).toMatchObject({
      bpm: 96,
      key: { scaleId: "melodic-minor", tonic: "Bb" },
    });
  });

  it("shows a generation loading state while building a new MIDI clip", async () => {
    const user = userEvent.setup();
    render(<MidiGeneratorClient />);

    await user.click(screen.getByRole("button", { name: /generate midi/i }));

    expect(screen.getByRole("status")).toHaveTextContent("generating midi clip");
    expect(screen.getByRole("button", { name: /generating/i })).toBeDisabled();

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("previews with a sine synth stop state and supports follow-up edits", async () => {
    const user = userEvent.setup();
    render(<MidiGeneratorClient />);

    await user.click(screen.getByRole("button", { name: /preview/i }));
    expect(playbackMock.playMidiClipPreview).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^stop$/i }));
    expect(playbackMock.stopMidiClipPreview).toHaveBeenCalled();

    await user.clear(screen.getByLabelText("follow-up edit prompt"));
    await user.type(
      screen.getByLabelText("follow-up edit prompt"),
      "transpose up 2 semitones and make it louder",
    );
    await user.click(screen.getByRole("button", { name: /edit midi/i }));

    expect(screen.getByText("history")).toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });
});
