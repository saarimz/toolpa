"use client";

import { useState } from "react";
import { Download, Square, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  downloadLiveRecording,
  LIVE_AUDIO_SCALE_EVIDENCE_EVENT,
  startLiveOutputRecording,
  stopLiveOutputRecording,
  type LiveAudioScaleEvidencePayload,
  type LiveRecording,
} from "@/lib/audio/live-recorder";

type AudioOutputRecorderProps = {
  filename: string;
  sourceId?: string;
};

export function AudioOutputRecorder({ filename, sourceId }: AudioOutputRecorderProps) {
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
      broadcastScaleEvidence({
        recording: nextRecording,
        sourceId: sourceId ?? filename,
      });
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
      {recording?.audioEvidence ? (
        <span className="text-xs text-emerald-300/80">
          {recording.audioEvidence.summary}
        </span>
      ) : null}
    </div>
  );
}

function broadcastScaleEvidence({
  recording,
  sourceId,
}: {
  recording: LiveRecording;
  sourceId: string;
}) {
  if (!recording.audioEvidence) {
    return;
  }

  const payload: LiveAudioScaleEvidencePayload = {
    audioEvidence: recording.audioEvidence,
    filename: recording.filename,
    recordedAt: recording.recordedAt,
    sourceId,
  };
  window.dispatchEvent(
    new CustomEvent(LIVE_AUDIO_SCALE_EVIDENCE_EVENT, { detail: payload }),
  );

  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      {
        payload,
        type: LIVE_AUDIO_SCALE_EVIDENCE_EVENT,
      },
      window.location.origin,
    );
  }
}
