import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AudioOutputRecorder } from "@/components/audio-output-recorder";
import { startLiveOutputRecording } from "@/lib/audio/live-recorder";

vi.mock("@/lib/audio/live-recorder", () => ({
  startLiveOutputRecording: vi.fn(async () => undefined),
  stopLiveOutputRecording: vi.fn(async () => ({
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
    expect(screen.getByRole("button", { name: /download wav/i })).toBeEnabled();
  });
});
