"use client";

import { encodeAudioBufferToWav } from "@/lib/audio/wav-render";

type ToneModule = typeof import("tone");
type ToneRecorder = InstanceType<ToneModule["Recorder"]>;

export type LiveRecording = {
  wavBlob: Blob;
  sourceBlob: Blob;
  mimeType: string;
  filename: string;
  recordedAt: string;
};

export type StopLiveOutputRecordingOptions = {
  filename?: string;
  decodeRecordedBlob?: (blob: Blob) => Promise<AudioBuffer>;
};

let activeRecorder: ToneRecorder | null = null;
const RECORDER_START_TIMEOUT_MS = 5000;
const RECORDER_STOP_TIMEOUT_MS = 10000;

export async function startLiveOutputRecording() {
  const Tone = await import("tone");
  await Tone.start();

  if (!Tone.Recorder.supported) {
    throw new Error("Live recording is not supported in this browser");
  }

  if (activeRecorder?.state === "started") {
    return;
  }

  activeRecorder?.dispose();
  const mimeType = getPreferredRecordingMimeType();
  const recorder = mimeType
    ? new Tone.Recorder({ mimeType })
    : new Tone.Recorder();

  Tone.getDestination().connect(recorder);

  try {
    await withTimeout(
      recorder.start(),
      RECORDER_START_TIMEOUT_MS,
      "Timed out while starting live recording",
    );
    activeRecorder = recorder;
  } catch (error) {
    Tone.getDestination().disconnect(recorder);
    recorder.dispose();
    throw error;
  }
}

export async function stopLiveOutputRecording(
  options: StopLiveOutputRecordingOptions = {},
): Promise<LiveRecording> {
  if (!activeRecorder) {
    throw new Error("No live recording is active");
  }

  const Tone = await import("tone");
  const recorder = activeRecorder;
  activeRecorder = null;

  let sourceBlob: Blob;
  try {
    sourceBlob = await withTimeout(
      recorder.stop(),
      RECORDER_STOP_TIMEOUT_MS,
      "Timed out while saving live recording",
    );
  } finally {
    Tone.getDestination().disconnect(recorder);
    recorder.dispose();
  }

  const decoder = options.decodeRecordedBlob ?? decodeRecordedBlobWithAudioContext;
  const audioBuffer = await decoder(sourceBlob);
  const wavBlob = new Blob([encodeAudioBufferToWav(audioBuffer)], {
    type: "audio/wav",
  });

  return {
    wavBlob,
    sourceBlob,
    mimeType: sourceBlob.type || recorder.mimeType,
    filename: sanitizeRecordingFilename(options.filename ?? "ai-daw-tools-recording"),
    recordedAt: new Date().toISOString(),
  };
}

export function getLiveOutputRecordingState() {
  return activeRecorder?.state ?? "stopped";
}

export function downloadLiveRecording(recording: LiveRecording) {
  const href = URL.createObjectURL(recording.wavBlob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = recording.filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export function sanitizeRecordingFilename(name: string) {
  const stem = name
    .trim()
    .replace(/\.wav$/i, "")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "ai-daw-tools-recording";

  return `${stem}.wav`;
}

export function getPreferredRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

async function decodeRecordedBlobWithAudioContext(blob: Blob): Promise<AudioBuffer> {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("AudioContext is not available for WAV conversion");
  }

  const context = new AudioContextClass();
  try {
    const data = await blob.arrayBuffer();
    return await context.decodeAudioData(data.slice(0));
  } finally {
    await context.close();
  }
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
