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
  Repeat2,
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
  type ChordCycleMode,
  type ChordMode,
  type MotionLandmark,
  quantizeMotionToScale,
  smoothThereminHandsFrame,
  type QuantizedThereminNote,
  type ThereminHandsFrame,
  type TrackingMode,
} from "@/app/tools/camera-theremin/lib/motion";
import {
  createCameraThereminPatch,
  startCameraThereminSynth,
  stopCameraThereminSynth,
  updateCameraThereminSynth,
} from "@/app/tools/camera-theremin/lib/tone-playback";
import { AudioOutputRecorder } from "@/components/audio-output-recorder";
import { FxSlotPanel } from "@/components/fx-slot-panel";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { PromptFirstSection } from "@/components/prompt-first-section";
import { Button } from "@/components/ui/button";
import type { FxPatternInput } from "@/lib/audio/fx-manifest";
import { useToolFxPattern } from "@/lib/audio/use-fx-pattern";
import { ChromaticTonics } from "@/lib/music/context";
import {
  getScaleDefinitions,
  resolveScaleKey,
} from "@/lib/music/scale-catalog";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { logClientPromptMemory } from "@/lib/prompt-memory/client";
import { usePromptParamState } from "@/lib/tools/use-prompt-param";
import {
  applyThereminPromptToControls,
  type CameraThereminControlState,
} from "@/app/tools/camera-theremin/lib/prompter";

type TrackingSnapshot = {
  frame: ThereminHandsFrame | null;
  note: QuantizedThereminNote | null;
  status: CameraTrackerStatus;
};

const TOOL_SLUG = "camera-theremin";
const PROMPT_APPLY_OVERLAY_MS = 180;
const scaleDefinitions = getScaleDefinitions();
const trackingModeOptions = [
  {
    detail: "Right hand sets pitch; left hand sets volume and chord cycle.",
    label: "hands",
    value: "hands",
  },
  {
    detail: "Gesture classifier makes fists, palms, and signs change articulation.",
    label: "gestures",
    value: "gestures",
  },
  {
    detail: "Head height sets pitch; mouth and expression open volume.",
    label: "face",
    value: "face",
  },
  {
    detail: "Gaze sets pitch; blinks gate volume.",
    label: "eyes",
    value: "eyes",
  },
  {
    detail: "Right wrist sets pitch; left wrist sets volume.",
    label: "body",
    value: "body",
  },
] as const satisfies readonly {
  detail: string;
  label: string;
  value: TrackingMode;
}[];
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
  const smoothedFrameRef = useRef<ThereminHandsFrame | null>(null);
  const lastUiCommitRef = useRef(0);
  const audioArmedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>({
    frame: null,
    note: null,
    status: "idle",
  });
  const [error, setError] = useState<string | null>(null);
  const [audioArmed, setAudioArmed] = useState(false);
  const [chordCycle, setChordCycle] = useState<ChordCycleMode>("static");
  const [chordMode, setChordMode] = useState<ChordMode>("mono");
  const [degreeSpan, setDegreeSpan] = useState(14);
  const [octaveShift, setOctaveShift] = useState(-1);
  const [smoothing, setSmoothing] = useState(0.42);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("hands");
  const [promptStatus, setPromptStatus] = useState("manual");
  const [isApplyingPrompt, setIsApplyingPrompt] = useState(false);
  const [prompt, setPrompt] = usePromptParamState(
    "hands as bowed glass, slow vibrato, bright but controlled",
  );
  const context = useGlobalMusicContextStore((state) => state.context);
  const fxPattern = useToolFxPattern(TOOL_SLUG);
  const hydrate = useGlobalMusicContextStore((state) => state.hydrate);
  const setScaleKey = useGlobalMusicContextStore((state) => state.setScaleKey);
  const snapshotRef = useRef(snapshot);
  const contextRef = useRef(context);
  const fxPatternRef = useRef(fxPattern);
  const promptRef = useRef(prompt);
  const promptApplyRequestRef = useRef(0);
  const fxReloadRequestRef = useRef(0);
  const controlSettingsRef = useRef<CameraThereminControlState>({
    chordCycle,
    chordMode,
    degreeSpan,
    octaveShift,
    smoothing,
    trackingMode,
  });

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    fxPatternRef.current = fxPattern;
  }, [fxPattern]);

  useEffect(() => {
    if (!audioArmedRef.current) {
      return;
    }

    void reloadThereminForFxPattern(fxPattern);
  }, [fxPattern]);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    controlSettingsRef.current = {
      chordCycle,
      chordMode,
      degreeSpan,
      octaveShift,
      smoothing,
      trackingMode,
    };
  }, [chordCycle, chordMode, degreeSpan, octaveShift, smoothing, trackingMode]);

  const activeScale = scaleDefinitions.find(
    (definition) => definition.id === context.key.scaleId,
  );
  const note = snapshot.note;
  const isTracking = snapshot.status === "tracking";
  const promptPatch = createCameraThereminPatch({
    bpm: context.bpm,
    prompt,
  });

  async function startTracking(mode = controlSettingsRef.current.trackingMode) {
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
          commitSnapshot((current) => ({ ...current, status }));
        },
        trackingMode: mode,
        video,
      });
    } catch (unknownError) {
      commitSnapshot((current) => ({ ...current, status: "idle" }));
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
    commitSnapshot({ frame: null, note: null, status: "idle" });
  }

  async function toggleAudio() {
    if (audioArmedRef.current) {
      audioArmedRef.current = false;
      setAudioArmed(false);
      await stopCameraThereminSynth();
      return;
    }

    await startCameraThereminSynth({
      bpm: contextRef.current.bpm,
      fxPattern: fxPatternRef.current,
      prompt: promptRef.current,
    });
    audioArmedRef.current = true;
    setAudioArmed(true);
    updateCameraThereminSynth(snapshotRef.current.note);
  }

  function handleMotionFrame(
    frame: ThereminHandsFrame | null,
    timestampMs: number,
  ) {
    if (!frame) {
      smoothedFrameRef.current = null;
      updateCameraThereminSynth(null);
      clearOverlay();
      if (timestampMs - lastUiCommitRef.current > 120) {
        lastUiCommitRef.current = timestampMs;
        commitSnapshot((current) => ({ ...current, frame: null, note: null }));
      }
      return;
    }

    const controls = controlSettingsRef.current;
    const musicContext = contextRef.current;
    const smoothed = smoothThereminHandsFrame(
      smoothedFrameRef.current,
      frame,
      controls.smoothing,
    );
    smoothedFrameRef.current = smoothed;
    if (!smoothed.pitchHand) {
      updateCameraThereminSynth(null);
      clearOverlay();
      return;
    }

    const nextNote = quantizeMotionToScale(smoothed.pitchHand, {
      chordCycle: controls.chordCycle,
      chordMode: controls.chordMode,
      degreeSpan: controls.degreeSpan,
      octaveShift: controls.octaveShift,
      referenceFrequency: musicContext.key.referenceFrequency,
      scaleId: musicContext.key.scaleId,
      tonic: musicContext.key.tonic,
      volumeHand: smoothed.volumeHand,
    });

    drawOverlay(smoothed, nextNote);
    updateCameraThereminSynth(audioArmedRef.current ? nextNote : null);
    if (timestampMs - lastUiCommitRef.current > 48) {
      lastUiCommitRef.current = timestampMs;
      commitSnapshot({ frame: smoothed, note: nextNote, status: "tracking" });
    }
  }

  function chooseTonic(tonic: string) {
    setScaleKey(resolveScaleKey({ tonic, scaleId: context.key.scaleId }));
  }

  function chooseScale(scaleId: string) {
    setScaleKey(resolveScaleKey({ tonic: context.key.tonic, scaleId }));
  }

  async function applyPrompt() {
    if (isApplyingPrompt) {
      return;
    }

    const requestId = promptApplyRequestRef.current + 1;
    promptApplyRequestRef.current = requestId;
    const nextPrompt = promptRef.current;
    const previousMode = controlSettingsRef.current.trackingMode;
    const next = applyThereminPromptToControls(
      nextPrompt,
      controlSettingsRef.current,
    );
    logClientPromptMemory({
      action: "apply-theremin-prompt",
      metadata: {
        chordCycle: next.chordCycle,
        chordMode: next.chordMode,
        degreeSpan: next.degreeSpan,
        octaveShift: next.octaveShift,
        smoothing: next.smoothing,
        trackingMode: next.trackingMode,
      },
      source: "client.camera-theremin",
      toolSlug: TOOL_SLUG,
      userPrompt: nextPrompt,
    });

    setIsApplyingPrompt(true);
    setPromptStatus("applying prompt");
    setError(null);
    await waitForPromptOverlay();

    try {
      if (promptApplyRequestRef.current !== requestId) {
        return;
      }

      applyControlState(next);
      if (next.trackingMode !== previousMode && isCameraActive()) {
        await restartTrackingForMode(next.trackingMode);
      }
      await reloadThereminForPrompt(next, nextPrompt);
      setPromptStatus(`${next.summary} / synth reloaded`);
    } catch (unknownError) {
      audioArmedRef.current = false;
      setAudioArmed(false);
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Prompt applied, but the synth reload failed.",
      );
      setPromptStatus(`${next.summary} / reload failed`);
    } finally {
      if (promptApplyRequestRef.current === requestId) {
        setIsApplyingPrompt(false);
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
              Prompt-selectable MediaPipe tracking into a scale-locked Tone synth.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>L1</span>
            <span className="text-zinc-200">installed synth</span>
            <span>{context.bpm} bpm</span>
            <span>{context.key.tonic} {activeScale?.name ?? context.key.scaleId}</span>
            <span>{formatTrackingModeLabel(trackingMode)}</span>
            <span>{audioArmed ? "audio armed" : "audio muted"} </span>
          </div>
        </header>

        <PromptFirstSection className="relative p-4">
          {isApplyingPrompt ? (
            <LlmGeneratingOverlay
              detail="Parsing the prompt, rebuilding the synth patch, and reloading the live theremin."
              label="applying theremin prompt"
              tone="solid"
            />
          ) : null}

          <label className="block text-xs text-zinc-500">
            prompt
            <textarea
              className="mt-2 min-h-20 w-full rounded-sm border border-zinc-700 bg-zinc-950 p-2 text-zinc-100"
              onChange={(event) => setPrompt(event.currentTarget.value)}
              value={prompt}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={isApplyingPrompt}
              onClick={() => void applyPrompt()}
            >
              <SlidersHorizontal className="size-4" />
              {isApplyingPrompt ? "applying prompt" : "apply prompt"}
            </Button>
            <span className="text-xs text-zinc-500">{promptStatus}</span>
          </div>
        </PromptFirstSection>

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
                <span className="rounded-sm border border-zinc-700 bg-black/60 px-2 py-1">
                  {formatTrackingModeLabel(snapshot.frame?.source ?? trackingMode)}
                </span>
                {snapshot.frame?.pitchHand ? (
                  <span className="rounded-sm border border-zinc-700 bg-black/60 px-2 py-1">
                    pitch {getMotionPointLabel(snapshot.frame.pitchHand)}
                  </span>
                ) : null}
                {snapshot.frame?.volumeHand ? (
                  <span className="rounded-sm border border-zinc-700 bg-black/60 px-2 py-1">
                    volume {getMotionPointLabel(snapshot.frame.volumeHand)}
                  </span>
                ) : null}
                {snapshot.frame?.pitchHand?.score ? (
                  <span className="rounded-sm border border-zinc-700 bg-black/60 px-2 py-1">
                    {(snapshot.frame.pitchHand.score * 100).toFixed(0)}%
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

            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <Readout icon={<Music2 className="size-4" />} label="chord" value={note?.chordLabel ?? "--"} />
              <Readout icon={<Repeat2 className="size-4" />} label="cycle" value={note?.chordCycleLabel ?? "--"} />
              <Readout icon={<Waves className="size-4" />} label="root" value={note ? `${(note.frequencies[0] ?? note.frequency).toFixed(2)} hz` : "--"} />
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
              <div className="text-xs text-zinc-500">
                <label htmlFor="camera-theremin-tracking-mode">
                  tracking mode
                </label>
                <select
                  id="camera-theremin-tracking-mode"
                  className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                  value={trackingMode}
                  onChange={(event) =>
                    void applyControlPatch({
                      trackingMode: event.currentTarget.value as TrackingMode,
                    })
                  }
                >
                  {trackingModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-zinc-400">
                  {getTrackingModeDetail(trackingMode)}
                </span>
              </div>

              <label className="text-xs text-zinc-500">
                chord mode
                <select
                  className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                  value={chordMode}
                  onChange={(event) =>
                    void applyControlPatch({
                      chordMode: event.currentTarget.value as ChordMode,
                    })
                  }
                >
                  <option value="mono">mono</option>
                  <option value="fifth">fifth</option>
                  <option value="triad">triad</option>
                  <option value="sus4">sus4</option>
                  <option value="seventh">seventh</option>
                </select>
              </label>

              <label className="text-xs text-zinc-500">
                chord cycle
                <select
                  className="mt-1 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                  value={chordCycle}
                  onChange={(event) =>
                    void applyControlPatch({
                      chordCycle: event.currentTarget.value as ChordCycleMode,
                    })
                  }
                >
                  <option value="static">static</option>
                  <option value="cadence">cadence</option>
                  <option value="walk">step walk</option>
                  <option value="modal">modal lift</option>
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
                  onChange={(event) =>
                    void applyControlPatch({
                      degreeSpan: Number(event.currentTarget.value),
                    })
                  }
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
                  onChange={(event) =>
                    void applyControlPatch({
                      octaveShift: Number(event.currentTarget.value),
                    })
                  }
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
                  onChange={(event) =>
                    void applyControlPatch({
                      smoothing: Number(event.currentTarget.value),
                    })
                  }
                  step="0.01"
                  type="range"
                  value={smoothing}
                />
                <span className="mt-1 block text-zinc-400">{Math.round(smoothing * 100)}%</span>
              </label>
            </div>

            <div className="mt-5 border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                <Radio className="size-4 text-zinc-200" />
                synth patch
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                <Metric label="osc" value={promptPatch.oscillatorType} />
                <Metric
                  label="env"
                  value={`${Math.round(promptPatch.attack * 1000)} / ${Math.round(promptPatch.release * 1000)} ms`}
                />
                <Metric
                  label="chorus"
                  value={`${Math.round(promptPatch.chorusWet * 100)}% / ${promptPatch.chorusRateHz} hz`}
                />
                <Metric
                  label="drive"
                  value={`${Math.round(promptPatch.driveWet * 100)}% / ${Math.round(promptPatch.driveAmount * 100)} amt`}
                />
                <Metric label="motion" value={`${Math.round(promptPatch.motionRampSec * 1000)} ms`} />
                <Metric label="layer" value={promptPatch.octaveLayer} />
              </div>
            </div>

            <FxSlotPanel
              className="mt-5 border border-zinc-800 bg-zinc-950 p-3"
              toolId={TOOL_SLUG}
            />

            <MotionRoleMap frame={snapshot.frame} trackingMode={trackingMode} />

            <div className="mt-5 border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                <Camera className="size-4 text-zinc-200" />
                motion
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                <Metric
                  label="pitch y"
                  value={
                    snapshot.frame?.pitchHand
                      ? snapshot.frame.pitchHand.y.toFixed(2)
                      : "--"
                  }
                />
                <Metric
                  label="pitch x"
                  value={
                    snapshot.frame?.pitchHand
                      ? snapshot.frame.pitchHand.x.toFixed(2)
                      : "--"
                  }
                />
                <Metric
                  label="volume y"
                  value={
                    snapshot.frame?.volumeHand
                      ? snapshot.frame.volumeHand.y.toFixed(2)
                      : "--"
                  }
                />
                <Metric
                  label="volume pinch"
                  value={
                    snapshot.frame?.volumeHand
                      ? snapshot.frame.volumeHand.pinch.toFixed(2)
                      : "--"
                  }
                />
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );

  function commitSnapshot(
    update: TrackingSnapshot | ((current: TrackingSnapshot) => TrackingSnapshot),
  ) {
    setSnapshot((current) => {
      const next = typeof update === "function" ? update(current) : update;
      snapshotRef.current = next;
      return next;
    });
  }

  async function applyControlPatch(patch: Partial<CameraThereminControlState>) {
    const previousMode = controlSettingsRef.current.trackingMode;
    const next = {
      ...controlSettingsRef.current,
      ...patch,
    };

    applyControlState(next);
    if (next.trackingMode !== previousMode && isCameraActive()) {
      await restartTrackingForMode(next.trackingMode);
    }
  }

  function applyControlState(next: CameraThereminControlState) {
    controlSettingsRef.current = next;
    setChordCycle(next.chordCycle);
    setChordMode(next.chordMode);
    setDegreeSpan(next.degreeSpan);
    setOctaveShift(next.octaveShift);
    setSmoothing(next.smoothing);
    setTrackingMode(next.trackingMode);
  }

  function isCameraActive() {
    return (
      trackerRef.current !== null ||
      snapshotRef.current.status === "requesting-camera" ||
      snapshotRef.current.status === "loading-model" ||
      snapshotRef.current.status === "tracking"
    );
  }

  async function restartTrackingForMode(nextTrackingMode: TrackingMode) {
    if (!videoRef.current) {
      return;
    }

    await startTracking(nextTrackingMode);
  }

  async function reloadThereminForPrompt(
    controls: CameraThereminControlState,
    synthPrompt: string,
  ) {
    const musicContext = contextRef.current;
    const currentSnapshot = snapshotRef.current;
    const nextNote = currentSnapshot.frame?.pitchHand
      ? quantizeMotionToScale(currentSnapshot.frame.pitchHand, {
          chordCycle: controls.chordCycle,
          chordMode: controls.chordMode,
          degreeSpan: controls.degreeSpan,
          octaveShift: controls.octaveShift,
          referenceFrequency: musicContext.key.referenceFrequency,
          scaleId: musicContext.key.scaleId,
          tonic: musicContext.key.tonic,
          volumeHand: currentSnapshot.frame.volumeHand,
        })
      : null;

    if (audioArmedRef.current) {
      await stopCameraThereminSynth();
      await startCameraThereminSynth({
        bpm: musicContext.bpm,
        fxPattern: fxPatternRef.current,
        prompt: synthPrompt,
      });
    }

    updateCameraThereminSynth(audioArmedRef.current ? nextNote : null);
    if (currentSnapshot.frame && nextNote) {
      drawOverlay(currentSnapshot.frame, nextNote);
      commitSnapshot({
        ...currentSnapshot,
        note: nextNote,
      });
    }
  }

  async function reloadThereminForFxPattern(nextFxPattern: FxPatternInput) {
    const requestId = fxReloadRequestRef.current + 1;
    fxReloadRequestRef.current = requestId;

    try {
      await stopCameraThereminSynth();
      if (
        fxReloadRequestRef.current !== requestId ||
        !audioArmedRef.current
      ) {
        return;
      }

      await startCameraThereminSynth({
        bpm: contextRef.current.bpm,
        fxPattern: nextFxPattern,
        prompt: promptRef.current,
      });
      if (fxReloadRequestRef.current !== requestId) {
        return;
      }

      updateCameraThereminSynth(snapshotRef.current.note);
    } catch (unknownError) {
      if (fxReloadRequestRef.current !== requestId) {
        return;
      }

      audioArmedRef.current = false;
      setAudioArmed(false);
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "FX slot reload failed.",
      );
    }
  }

  function drawOverlay(
    frame: ThereminHandsFrame,
    currentNote: QuantizedThereminNote,
  ) {
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

    const drawnLandmarkSets = new Set<readonly MotionLandmark[]>();
    for (const hand of frame.hands) {
      const isPitchHand = hand === frame.pitchHand;
      const isVolumeHand = hand === frame.volumeHand;
      context2d.strokeStyle = isPitchHand
        ? "rgba(52, 211, 153, 0.68)"
        : isVolumeHand
          ? "rgba(125, 211, 252, 0.68)"
          : "rgba(244, 244, 245, 0.5)";

      if (!drawnLandmarkSets.has(hand.landmarks)) {
        drawnLandmarkSets.add(hand.landmarks);
        for (const [leftIndex, rightIndex] of hand.connections ?? connectionPairs) {
          const left = hand.landmarks[leftIndex];
          const right = hand.landmarks[rightIndex];
          if (!left || !right) {
            continue;
          }
          context2d.beginPath();
          context2d.moveTo(left.x * width, left.y * height);
          context2d.lineTo(right.x * width, right.y * height);
          context2d.stroke();
        }

        for (const landmark of hand.landmarks) {
          context2d.beginPath();
          context2d.fillStyle = isPitchHand
            ? "rgba(167, 243, 208, 0.88)"
            : isVolumeHand
              ? "rgba(186, 230, 253, 0.88)"
              : "rgba(250, 250, 250, 0.78)";
          context2d.arc(
            landmark.x * width,
            landmark.y * height,
            ratio * 2.2,
            0,
            Math.PI * 2,
          );
          context2d.fill();
        }
      }
    }

    if (frame.pitchHand) {
      context2d.beginPath();
      context2d.fillStyle = currentNote.volume > 0.02
        ? "rgba(52, 211, 153, 0.92)"
        : "rgba(248, 113, 113, 0.86)";
      context2d.arc(
        frame.pitchHand.x * width,
        frame.pitchHand.y * height,
        ratio * 6,
        0,
        Math.PI * 2,
      );
      context2d.fill();
    }

    if (frame.volumeHand) {
      context2d.beginPath();
      context2d.fillStyle = "rgba(125, 211, 252, 0.9)";
      context2d.arc(
        frame.volumeHand.x * width,
        frame.volumeHand.y * height,
        ratio * 5.2,
        0,
        Math.PI * 2,
      );
      context2d.fill();
    }
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

function waitForPromptOverlay() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, PROMPT_APPLY_OVERLAY_MS);
  });
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

function MotionRoleMap({
  frame,
  trackingMode,
}: {
  frame: ThereminHandsFrame | null;
  trackingMode: TrackingMode;
}) {
  const map = getTrackingRoleMap(frame?.source ?? trackingMode);

  return (
    <div className="mt-5 border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
        <Hand className="size-4 text-zinc-200" />
        motion map
      </div>
      <div className="grid gap-2 text-xs">
        <HandRoleRow
          ariaLabel="pitch motion route"
          controls={map.pitch.controls}
          detail={map.pitch.detail}
          hand={map.pitch.label}
          isTracking={Boolean(frame?.pitchHand)}
        />
        <HandRoleRow
          ariaLabel="volume motion route"
          controls={map.volume.controls}
          detail={map.volume.detail}
          hand={map.volume.label}
          isTracking={Boolean(frame?.volumeHand)}
        />
      </div>
    </div>
  );
}

function HandRoleRow({
  ariaLabel,
  controls,
  detail,
  hand,
  isTracking,
}: {
  ariaLabel: string;
  controls: string;
  detail: string;
  hand: string;
  isTracking: boolean;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="grid grid-cols-[96px_minmax(0,1fr)_70px] items-center gap-2 border border-zinc-800 px-2 py-2"
    >
      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        {hand}
      </div>
      <div className="min-w-0">
        <div className="text-sm text-zinc-100">{controls}</div>
        <div className="mt-0.5 text-[11px] text-zinc-500">{detail}</div>
      </div>
      <div className="justify-self-end rounded-sm border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-300">
        {isTracking ? "tracking" : "waiting"}
      </div>
    </div>
  );
}

function getMotionPointLabel(point: NonNullable<ThereminHandsFrame["pitchHand"]>) {
  return point.label ?? point.handedness ?? formatTrackingModeLabel(point.source);
}

function getTrackingModeDetail(trackingMode: TrackingMode) {
  return (
    trackingModeOptions.find((option) => option.value === trackingMode)?.detail ??
    ""
  );
}

function formatTrackingModeLabel(trackingMode: TrackingMode) {
  if (trackingMode === "gestures") {
    return "gesture tracking";
  }
  if (trackingMode === "face") {
    return "face tracking";
  }
  if (trackingMode === "eyes") {
    return "eye tracking";
  }
  if (trackingMode === "body") {
    return "body tracking";
  }

  return "hand tracking";
}

function getTrackingRoleMap(trackingMode: TrackingMode) {
  if (trackingMode === "gestures") {
    return {
      pitch: {
        controls: "pitch + gesture",
        detail: "Y note / fist-palm articulation",
        label: "right gesture",
      },
      volume: {
        controls: "volume + cycle",
        detail: "height/open level",
        label: "left gesture",
      },
    };
  }

  if (trackingMode === "face") {
    return {
      pitch: {
        controls: "pitch + pan",
        detail: "head Y / head X",
        label: "head",
      },
      volume: {
        controls: "volume + cycle",
        detail: "mouth open / smile",
        label: "mouth",
      },
    };
  }

  if (trackingMode === "eyes") {
    return {
      pitch: {
        controls: "pitch + pan",
        detail: "gaze Y / gaze X",
        label: "gaze",
      },
      volume: {
        controls: "volume gate",
        detail: "blink openness",
        label: "blink",
      },
    };
  }

  if (trackingMode === "body") {
    return {
      pitch: {
        controls: "pitch + pan",
        detail: "right wrist Y / X",
        label: "right wrist",
      },
      volume: {
        controls: "volume + cycle",
        detail: "left wrist height / X",
        label: "left wrist",
      },
    };
  }

  return {
    pitch: {
      controls: "pitch + pan",
      detail: "Y note / X stereo",
      label: "right hand",
    },
    volume: {
      controls: "volume + filter",
      detail: "height/open level",
      label: "left hand",
    },
  };
}
