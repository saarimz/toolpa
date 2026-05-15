import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AudioOutputRecorder } from "@/components/audio-output-recorder";
import {
  LIVE_AUDIO_SCALE_EVIDENCE_EVENT,
  startLiveOutputRecording,
} from "@/lib/audio/live-recorder";

vi.mock("@/lib/audio/live-recorder", () => ({
  LIVE_AUDIO_SCALE_EVIDENCE_EVENT: "toolpa-js:live-audio-scale-evidence",
  startLiveOutputRecording: vi.fn(async () => undefined),
  stopLiveOutputRecording: vi.fn(async () => ({
    audioEvidence: {
      key: "C",
      keyStrength: 0.8,
      pitchClasses: [0, 4, 7],
      scale: "major",
      summary: "test live output: C major, prominent C, E, G",
    },
    wavBlob: new Blob(["wav"], { type: "audio/wav" }),
    sourceBlob: new Blob(["webm"], { type: "audio/webm" }),
    mimeType: "audio/webm",
    filename: "test-take.wav",
    recordedAt: "2026-05-10T00:00:00.000Z",
  })),
  downloadLiveRecording: vi.fn(),
}));

describe("AudioOutputRecorder", () => {
  it("shows an arming state while recorder startup is pending", async () => {
    const user = userEvent.setup();
    let resolveStart!: () => void;
    vi.mocked(startLiveOutputRecording).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );

    render(<AudioOutputRecorder filename="test take" />);

    await user.click(screen.getByRole("button", { name: /record output/i }));
    expect(screen.getByRole("button", { name: /arming/i })).toBeDisabled();

    resolveStart();
    expect(await screen.findByRole("button", { name: /stop record/i })).toBeInTheDocument();
  });

  it("records, stops, and enables wav download", async () => {
    const user = userEvent.setup();
    render(<AudioOutputRecorder filename="test take" />);

    await user.click(screen.getByRole("button", { name: /record output/i }));
    expect(screen.getByRole("button", { name: /stop record/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /stop record/i }));
    expect(await screen.findByText("test-take.wav")).toBeInTheDocument();
    expect(screen.getByText(/test live output/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download wav/i })).toBeEnabled();
  });

  it("broadcasts live audio scale evidence for host parents", async () => {
    const user = userEvent.setup();
    const received: unknown[] = [];
    window.addEventListener(LIVE_AUDIO_SCALE_EVIDENCE_EVENT, (event) => {
      received.push((event as CustomEvent).detail);
    });

    render(<AudioOutputRecorder filename="test take" sourceId="test-tool" />);

    await user.click(screen.getByRole("button", { name: /record output/i }));
    await user.click(screen.getByRole("button", { name: /stop record/i }));

    expect(received).toEqual([
      expect.objectContaining({
        filename: "test-take.wav",
        sourceId: "test-tool",
        audioEvidence: expect.objectContaining({
          pitchClasses: [0, 4, 7],
        }),
      }),
    ]);
  });
});
