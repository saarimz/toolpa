"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  CircleDot,
  Hand,
  Music2,
  Pause,
  Radio,
  SlidersHorizontal,
  Video,
  VideoOff,
  Waves,
} from "lucide-react";

import {
  startCameraMotionTracker,
  type CameraMotionTracker,
  type CameraTrackerStatus,
} from "@/app/tools/camera-theremin/lib/camera";
import {
  type ChordMode,
  quantizeMotionToScale,
  smoothHandMotionFrame,
  type HandMotionFrame,
  type QuantizedThereminNote,
} from "@/app/tools/camera-theremin/lib/motion";
import {
  startCameraThereminSynth,
  stopCameraThereminSynth,
  updateCameraThereminSynth,
} from "@/app/tools/camera-theremin/lib/tone-playback";
import { AudioOutputRecorder } from "@/components/audio-output-recorder";
import { Button } from "@/components/ui/button";
import { ChromaticTonics } from "@/lib/music/context";
import {
  getScaleDefinitions,
  resolveScaleKey,
} from "@/lib/music/scale-catalog";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { usePromptParamState } from "@/lib/tools/use-prompt-param";
import { applyThereminPromptToControls } from "@/app/tools/camera-theremin/lib/prompter";

type TrackingSnapshot = {
  frame: HandMotionFrame | null;
  note: QuantizedThereminNote | null;
  status: CameraTrackerStatus;
};

const TOOL_SLUG = "camera-theremin";
const scaleDefinitions = getScaleDefinitions();
const connectionPairs = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
] as const;

export function CameraThereminClient() {
  const trackerRef = useRef<CameraMotionTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const smoothedFrameRef = useRef<HandMotionFrame | null>(null);
  const lastUiCommitRef = useRef(0);
  const audioArmedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>({
    frame: null,
    note: null,
    status: "idle",
  });
  const [error, setError] = useState<string | null>(null);
  const [audioArmed, setAudioArmed] = useState(false);
  const [chordMode, setChordMode] = useState<ChordMode>("mono");
  const [degreeSpan, setDegreeSpan] = useState(14);
  const [octaveShift, setOctaveShift] = useState(-1);
  const [smoothing, setSmoothing] = useState(0.42);
  const [promptStatus, setPromptStatus] = useState("manual");
  const [prompt, setPrompt] = usePromptParamState(
    "hands as bowed glass, slow vibrato, bright but controlled",
  );
  const context = useGlobalMusicContextStore((state) => state.context);
  const hydrate = useGlobalMusicContextStore((state) => state.hydrate);
  const setScaleKey = useGlobalMusicContextStore((state) => state.setScaleKey);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const activeScale = scaleDefinitions.find(
    (definition) => definition.id === context.key.scaleId,
  );
  const note = snapshot.note;
  const isTracking = snapshot.status === "tracking";

  async function startTracking() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    stopTracking();
    setError(null);
    smoothedFrameRef.current = null;
    try {
      trackerRef.current = await startCameraMotionTracker({
        onFrame: ({ frame, timestampMs }) => {
          handleMotionFrame(frame, timestampMs);
        },
        onStatus: (status) => {
          setSnapshot((current) => ({ ...current, status }));
        },
        video,
      });
    } catch (unknownError) {
      setSnapshot((current) => ({ ...current, status: "idle" }));
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Camera tracking failed.",
      );
      clearOverlay();
    }
  }

  function stopTracking() {
    trackerRef.current?.stop();
    trackerRef.current = null;
    smoothedFrameRef.current = null;
    clearOverlay();
    updateCameraThereminSynth(null);
    setSnapshot({ frame: null, note: null, status: "idle" });
  }

  async function toggleAudio() {
    if (audioArmedRef.current) {
      audioArmedRef.current = false;
      setAudioArmed(false);
      await stopCameraThereminSynth();
      return;
    }

    await startCameraThereminSynth({ bpm: context.bpm, prompt });
    audioArmedRef.current = true;
    setAudioArmed(true);
    updateCameraThereminSynth(snapshot.note);
  }

  function handleMotionFrame(frame: HandMotionFrame | null, timestampMs: number) {
    if (!frame) {
      smoothedFrameRef.current = null;
      updateCameraThereminSynth(null);
      clearOverlay();
      if (timestampMs - lastUiCommitRef.current > 120) {
        lastUiCommitRef.current = timestampMs;
        setSnapshot((current) => ({ ...current, frame: null, note: null }));
      }
      return;
    }

    const smoothed = smoothHandMotionFrame(
      smoothedFrameRef.current,
      frame,
      smoothing,
    );
    smoothedFrameRef.current = smoothed;
    const nextNote = quantizeMotionToScale(smoothed, {
      chordMode,
      degreeSpan,
      octaveShift,
      referenceFrequency: context.key.referenceFrequency,
      scaleId: context.key.scaleId,
      tonic: context.key.tonic,
    });

    drawOverlay(smoothed, nextNote);
    updateCameraThereminSynth(audioArmedRef.current ? nextNote : null);
    if (timestampMs - lastUiCommitRef.current > 48) {
      lastUiCommitRef.current = timestampMs;
      setSnapshot({ frame: smoothed, note: nextNote, status: "tracking" });
    }
  }

  function chooseTonic(tonic: string) {
    setScaleKey(resolveScaleKey({ tonic, scaleId: context.key.scaleId }));
  }

  function chooseScale(scaleId: string) {
    setScaleKey(resolveScaleKey({ tonic: context.key.tonic, scaleId }));
  }

  async function applyPrompt() {
    const next = applyThereminPromptToControls(prompt, {
      chordMode,
      degreeSpan,
      octaveShift,
      smoothing,
    });
    setChordMode(next.chordMode);
    setDegreeSpan(next.degreeSpan);
    setOctaveShift(next.octaveShift);
    setSmoothing(next.smoothing);
    setPromptStatus(next.summary);

    if (audioArmedRef.current) {
      await stopCameraThereminSynth();
      await startCameraThereminSynth({ bpm: context.bpm, prompt });
      if (snapshot.frame) {
        updateCameraThereminSynth(
          quantizeMotionToScale(snapshot.frame, {
            chordMode: next.chordMode,
            degreeSpan: next.degreeSpan,
            octaveShift: next.octaveShift,
            referenceFrequency: context.key.referenceFrequency,
            scaleId: context.key.scaleId,
            tonic: context.key.tonic,
          }),
        );
      }
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto flex max-w-7xl flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
          <div>
            <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-200">
              /dashboard
            </Link>
            <h1 className="mt-1 text-lg text-zinc-100">Camera Theremin</h1>
            <p className="mt-1 max-w-3xl text-xs text-zinc-500">
              MediaPipe hand tracking into a scale-locked Tone synth.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>L1</span>
            <span className="text-zinc-200">installed synth</span>
            <span>{context.bpm} bpm</span>
            <span>{context.key.tonic} {activeScale?.name ?? context.key.scaleId}</span>
            <span>{audioArmed ? "audio armed" : "audio muted"} </span>
          </div>
        </header>

        <div className="grid border-b border-zinc-800 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="p-4">
            <div className="relative aspect-video overflow-hidden border border-zinc-800 bg-black">
              <video
                ref={videoRef}
                aria-label="camera input"
                className="h-full w-full object-cover"
              />
              <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
              <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-200">
                <span className="rounded-sm border border-zinc-700 bg-black/60 px-2 py-1">
                  {snapshot.status}
                </span>
                {snapshot.frame?.handedness ? (
                  <span className="rounded-sm border border-zinc-700 bg-black/60 px-2 py-1">
                    {snapshot.frame.handedness}
                  </span>
                ) : null}
                {snapshot.frame?.score ? (
                  <span className="rounded-sm border border-zinc-700 bg-black/60 px-2 py-1">
                    {(snapshot.frame.score * 100).toFixed(0)}%
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {isTracking ? (
                <Button variant="danger" onClick={stopTracking}>
                  <VideoOff className="size-4" />
                  stop camera
                </Button>
              ) : (
                <Button
                  disabled={snapshot.status === "requesting-camera" || snapshot.status === "loading-model"}
                  onClick={() => void startTracking()}
                  variant="solid"
                >
                  <Video className="size-4" />
                  {snapshot.status === "requesting-camera"
                    ? "requesting"
                    : snapshot.status === "loading-model"
                      ? "loading"
                      : "start camera"}
                </Button>
              )}
              <Button
                onClick={() => void toggleAudio()}
                variant={audioArmed ? "danger" : "ghost"}
              >
                {audioArmed ? <Pause className="size-4" /> : <Radio className="size-4" />}
                {audioArmed ? "mute synth" : "arm synth"}
              </Button>
              <AudioOutputRecorder filename={TOOL_SLUG} sourceId={TOOL_SLUG} />
            </div>

            {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Readout icon={<Music2 className="size-4" />} label="chord" value={note?.chordLabel ?? "--"} />
              <Readout icon={<Waves className="size-4" />} label="root" value={note ? `${note.frequency.toFixed(2)} hz` : "--"} />
              <Readout icon={<Hand className="size-4" />} label="volume" value={note ? `${Math.round(note.volume * 100)}%` : "--"} />
              <Readout icon={<CircleDot className="size-4" />} label="filter" value={note ? `${note.filterHz} hz` : "--"} />
            </div>
          </section>

          <aside className="border-t border-zinc-800 p-4 lg:border-l lg:border-t-0">
            <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
              <SlidersHorizontal className="size-4 text-zinc-200" />
              control
            </div>

            <div className="grid gap-3">
              <label className="text-xs text-zinc-500">
                prompt
                <textarea
                  className="mt-1 min-h-20 w-full rounded-sm border border-zinc-700 bg-zinc-950 p-2 text-zinc-100"
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                  value={prompt}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void applyPrompt()}>
                  <SlidersHorizontal className="size-4" />
                  apply prompt
                </Button>
                <span className="text-xs text-zinc-500">{promptStatus}</span>
              </div>

              <label className="text-xs text-zinc-500">
                chord mode
                <select
                  className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                  value={chordMode}
                  onChange={(event) => setChordMode(event.currentTarget.value as ChordMode)}
                >
                  <option value="mono">mono</option>
                  <option value="fifth">fifth</option>
                  <option value="triad">triad</option>
                  <option value="sus4">sus4</option>
                  <option value="seventh">seventh</option>
                </select>
              </label>

              <label className="text-xs text-zinc-500">
                tonic
                <select
                  className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                  value={context.key.tonic}
                  onChange={(event) => chooseTonic(event.currentTarget.value)}
                >
                  {ChromaticTonics.map((tonic) => (
                    <option key={tonic} value={tonic}>
                      {tonic}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-zinc-500">
                scale
                <select
                  className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                  value={context.key.scaleId}
                  onChange={(event) => chooseScale(event.currentTarget.value)}
                >
                  {scaleDefinitions.map((scale) => (
                    <option key={scale.id} value={scale.id}>
                      {scale.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-zinc-500">
                range degrees
                <input
                  className="mt-2 w-full accent-zinc-100"
                  max="28"
                  min="4"
                  onChange={(event) => setDegreeSpan(Number(event.currentTarget.value))}
                  type="range"
                  value={degreeSpan}
                />
                <span className="mt-1 block text-zinc-400">{degreeSpan + 1} locked notes</span>
              </label>

              <label className="text-xs text-zinc-500">
                root octave
                <select
                  className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                  value={octaveShift}
                  onChange={(event) => setOctaveShift(Number(event.currentTarget.value))}
                >
                  <option value={-2}>low</option>
                  <option value={-1}>mid</option>
                  <option value={0}>high</option>
                </select>
              </label>

              <label className="text-xs text-zinc-500">
                smoothing
                <input
                  className="mt-2 w-full accent-zinc-100"
                  max="0.9"
                  min="0"
                  onChange={(event) => setSmoothing(Number(event.currentTarget.value))}
                  step="0.01"
                  type="range"
                  value={smoothing}
                />
                <span className="mt-1 block text-zinc-400">{Math.round(smoothing * 100)}%</span>
              </label>
            </div>

            <div className="mt-5 border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                <Camera className="size-4 text-zinc-200" />
                motion
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                <Metric label="x" value={snapshot.frame ? snapshot.frame.x.toFixed(2) : "--"} />
                <Metric label="y" value={snapshot.frame ? snapshot.frame.y.toFixed(2) : "--"} />
                <Metric label="z" value={snapshot.frame ? snapshot.frame.z.toFixed(2) : "--"} />
                <Metric label="pinch" value={snapshot.frame ? snapshot.frame.pinch.toFixed(2) : "--"} />
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );

  function drawOverlay(frame: HandMotionFrame, currentNote: QuantizedThereminNote) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context2d = canvas.getContext("2d");
    if (!context2d) {
      return;
    }

    context2d.clearRect(0, 0, width, height);
    context2d.lineWidth = Math.max(1, ratio * 1.4);
    context2d.strokeStyle = "rgba(244, 244, 245, 0.58)";
    for (const [leftIndex, rightIndex] of connectionPairs) {
      const left = frame.landmarks[leftIndex];
      const right = frame.landmarks[rightIndex];
      if (!left || !right) {
        continue;
      }
      context2d.beginPath();
      context2d.moveTo(left.x * width, left.y * height);
      context2d.lineTo(right.x * width, right.y * height);
      context2d.stroke();
    }

    for (const landmark of frame.landmarks) {
      context2d.beginPath();
      context2d.fillStyle = "rgba(250, 250, 250, 0.86)";
      context2d.arc(landmark.x * width, landmark.y * height, ratio * 2.2, 0, Math.PI * 2);
      context2d.fill();
    }

    context2d.beginPath();
    context2d.fillStyle = currentNote.volume > 0.02
      ? "rgba(52, 211, 153, 0.92)"
      : "rgba(248, 113, 113, 0.86)";
    context2d.arc(frame.x * width, frame.y * height, ratio * 6, 0, Math.PI * 2);
    context2d.fill();
  }

  function clearOverlay() {
    const canvas = canvasRef.current;
    const context2d = canvas?.getContext("2d");
    if (!canvas || !context2d) {
      return;
    }

    context2d.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function Readout({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 min-h-6 text-sm text-zinc-100">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 px-2 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-sm text-zinc-200">{value}</div>
    </div>
  );
}
