"use client";

import { useState } from "react";
import { Download, Square, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  downloadLiveRecording,
  startLiveOutputRecording,
  stopLiveOutputRecording,
  type LiveRecording,
} from "@/lib/audio/live-recorder";

type AudioOutputRecorderProps = {
  filename: string;
};

export function AudioOutputRecorder({ filename }: AudioOutputRecorderProps) {
  const [recording, setRecording] = useState<LiveRecording | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "recording" | "stopping">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function startRecording() {
    setError(null);
    setRecording(null);
    setStatus("starting");

    try {
      await startLiveOutputRecording();
      setStatus("recording");
    } catch (unknownError) {
      setStatus("idle");
      setError(
        unknownError instanceof Error ? unknownError.message : "Could not start recording",
      );
    }
  }

  async function stopRecording() {
    setStatus("stopping");
    setError(null);

    try {
      const nextRecording = await stopLiveOutputRecording({ filename });
      setRecording(nextRecording);
      setStatus("idle");
    } catch (unknownError) {
      setStatus("idle");
      setError(
        unknownError instanceof Error ? unknownError.message : "Could not stop recording",
      );
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "recording" ? (
        <Button variant="danger" onClick={() => void stopRecording()}>
          <Square className="size-4" />
          stop record
        </Button>
      ) : (
        <Button disabled={status !== "idle"} onClick={() => void startRecording()}>
          <Radio className="size-4" />
          {status === "starting"
            ? "arming"
            : status === "stopping"
              ? "saving"
              : "record output"}
        </Button>
      )}
      <Button
        disabled={!recording || status !== "idle"}
        onClick={() => recording && downloadLiveRecording(recording)}
      >
        <Download className="size-4" />
        download wav
      </Button>
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
      {recording ? (
        <span className="text-xs text-zinc-600">{recording.filename}</span>
      ) : null}
    </div>
  );
}
