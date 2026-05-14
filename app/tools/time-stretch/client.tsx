"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioWaveform,
  Clock3,
  Loader2,
  Pause,
  Play,
  SlidersHorizontal,
  StretchHorizontal,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PromptFirstSection } from "@/components/prompt-first-section";
import { SamplePicker, type PickedSample } from "@/components/sample-picker";
import { ToolExportPanel } from "@/components/tool-export-panel";
import {
  applyTimeStretchPromptToPatch,
  buildTimeStretchPrompt,
} from "@/app/tools/time-stretch/lib/prompt";
import {
  getStretchRenderInfo,
  renderTimeStretchToAudioBuffer,
  type TimeStretchAudioBufferLike,
} from "@/app/tools/time-stretch/lib/render";
import {
  DEFAULT_TIME_STRETCH_PATCH,
  getTargetDurationSec,
  sanitizeTimeStretchPatch,
  TimeStretchModeSchema,
  TimeStretchPerformanceModeSchema,
  type TimeStretchMode,
  type TimeStretchPatch,
  type TimeStretchPerformanceMode,
} from "@/app/tools/time-stretch/lib/schema";
import { timeStretchManifest } from "@/app/tools/time-stretch/manifest";
import { useGlobalBpmSync } from "@/lib/music/use-global-context-sync";
import { usePromptParamState } from "@/lib/tools/use-prompt-param";
import { getDefaultLibrarySample } from "@/lib/samples/library";
import type { SampleRole } from "@/lib/samples/roles";
import { getSharedAudioContext, resolveSample } from "@/lib/samples/resolver";
import { createWavExportArtifact } from "@/lib/tool-exports/audio";

const TOOL_SLUG = "time-stretch";
const sampleRoles: SampleRole[] = ["pad", "loop", "melodic", "break", "fx", "oneshot"];
const defaultSample = getDefaultLibrarySample(sampleRoles);
const defaultPrompt =
  "stretch this into a 32 bar ambient cloud with soft transients, wide stereo, and subharmonic bloom";
const targetBarOptions = [1, 2, 4, 8, 16, 32, 64, 128];

type RenderStatus = "idle" | "loading-source" | "rendering" | "ready" | "error";

export function TimeStretchClient() {
  const [sample, setSample] = useState<PickedSample>({
    id: defaultSample.id,
    name: defaultSample.name,
    origin: "library",
    role: defaultSample.role,
  });
  const [patch, setPatch] = useState<TimeStretchPatch>(() =>
    sanitizeTimeStretchPatch({
      ...DEFAULT_TIME_STRETCH_PATCH,
      sourceId: defaultSample.id,
      sourceName: defaultSample.name,
    }),
  );
  const [prompt, setPrompt] = usePromptParamState(defaultPrompt);
  const [promptStatus, setPromptStatus] = useState("manual");
  const [sourceBuffer, setSourceBuffer] = useState<TimeStretchAudioBufferLike | null>(null);
  const [renderedBuffer, setRenderedBuffer] = useState<AudioBuffer | null>(null);
  const [status, setStatus] = useState<RenderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const renderRequestRef = useRef(0);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const setSyncedBpm = useCallback((bpm: number) => {
    setPatch((current) => sanitizeTimeStretchPatch({ ...current, bpm }));
  }, []);
  useGlobalBpmSync(setSyncedBpm);

  const targetDurationSec = getTargetDurationSec(patch);
  const stretchRatio = sourceBuffer
    ? getStretchRenderInfo(sourceBuffer, patch).stretchRatio
    : null;
  const patchDocument = useMemo(
    () => ({
      patch,
      prompt,
      renderedDurationSec: renderedBuffer?.duration ?? null,
      sourceDurationSec: sourceBuffer?.duration ?? null,
      stretchRatio,
    }),
    [patch, prompt, renderedBuffer, sourceBuffer, stretchRatio],
  );

  const stopPlayback = useCallback(() => {
    const source = sourceNodeRef.current;
    sourceNodeRef.current = null;
    setIsPlaying(false);
    try {
      source?.stop();
    } catch {
      // The buffer may have already ended.
    }
  }, []);

  useEffect(
    () => () => {
      stopPlayback();
    },
    [stopPlayback],
  );

  async function loadSource() {
    if (sourceBuffer && patch.sourceId === sample.id) {
      return sourceBuffer;
    }

    setStatus("loading-source");
    const resolved = await resolveSample(sample.id);
    setSourceBuffer(resolved.audioBuffer);
    return resolved.audioBuffer;
  }

  async function renderStretch() {
    const requestId = renderRequestRef.current + 1;
    renderRequestRef.current = requestId;
    setError(null);
    stopPlayback();

    try {
      const source = await loadSource();
      if (renderRequestRef.current !== requestId) {
        throw new Error("Render was replaced by a newer request");
      }

      setStatus("rendering");
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      const nextBuffer = await renderTimeStretchToAudioBuffer(source, patch, {
        maxDurationSec: timeStretchManifest.exports.audio.maxDefaultDurationSec,
      });

      if (renderRequestRef.current !== requestId) {
        throw new Error("Render was replaced by a newer request");
      }

      setRenderedBuffer(nextBuffer);
      setStatus("ready");
      return nextBuffer;
    } catch (unknownError) {
      if (renderRequestRef.current === requestId) {
        setStatus("error");
        setError(
          unknownError instanceof Error
            ? unknownError.message
            : "Time stretch render failed",
        );
      }
      throw unknownError;
    }
  }

  async function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    try {
      const buffer = renderedBuffer ?? (await renderStretch());
      const context = getSharedAudioContext();
      if (context.state !== "running") {
        await context.resume();
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (sourceNodeRef.current === source) {
          sourceNodeRef.current = null;
          setIsPlaying(false);
        }
      };
      sourceNodeRef.current = source;
      source.start();
      setIsPlaying(true);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Playback failed");
    }
  }

  function updatePatch(nextPatch: Partial<TimeStretchPatch>) {
    setPatch((current) => sanitizeTimeStretchPatch({ ...current, ...nextPatch }));
    setRenderedBuffer(null);
    setStatus((current) => (current === "ready" ? "idle" : current));
  }

  function applyPrompt() {
    const result = applyTimeStretchPromptToPatch(patch, prompt);
    setPatch(result.patch);
    setRenderedBuffer(null);
    setStatus("idle");
    setPromptStatus(result.decisions.join(" / "));
  }

  function selectSample(nextSample: PickedSample) {
    stopPlayback();
    setSample(nextSample);
    setPatch((current) =>
      sanitizeTimeStretchPatch({
        ...current,
        sourceId: nextSample.id,
        sourceName: nextSample.name,
      }),
    );
    setSourceBuffer(null);
    setRenderedBuffer(null);
    setStatus("idle");
    setError(null);
  }

  async function exportRenderedWav() {
    const audioBuffer = renderedBuffer ?? (await renderStretch());
    return createWavExportArtifact({
      audioBuffer,
      filename: `${TOOL_SLUG}-${formatBars(patch.targetBars)}bars.wav`,
      source: {
        document: patchDocument,
        documentId: `${patch.sourceId}:${patch.targetBars}:${patch.mode}`,
        documentKind: "time-stretch-patch",
        schemaVersion: patch.schemaVersion,
        toolSlug: TOOL_SLUG,
      },
    });
  }

  const isBusy = status === "loading-source" || status === "rendering";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-200">
            /dashboard
          </Link>
          <h1 className="mt-1 text-lg tracking-normal text-zinc-100">time-stretch</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>L1</span>
          <span className="text-zinc-200">assist</span>
          <span>{patch.mode}</span>
          <span>{formatDuration(targetDurationSec)}</span>
        </div>
      </header>

      <section className="grid border-b border-zinc-800 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
          <SamplePicker
            id="time-stretch-source"
            label="sample source"
            value={sample.id}
            roles={sampleRoles}
            onSelect={(nextSample) => selectSample(nextSample)}
          />

          <PromptFirstSection className="mt-4 border-zinc-900 pb-4">
            <label className="block text-xs text-zinc-500">
              stretch prompt
              <textarea
                aria-label="stretch prompt"
                className="mt-2 h-24 w-full resize-none rounded-sm border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-100 outline-none focus:border-zinc-200"
                value={prompt}
                onChange={(event) => setPrompt(event.currentTarget.value)}
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => applyPrompt()}>
                <WandSparkles className="size-4" />
                apply prompt
              </Button>
            </div>

            <div className="mt-3 text-xs text-zinc-500">{promptStatus}</div>
          </PromptFirstSection>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <NumberField
              key={`bpm-${patch.bpm}`}
              label="bpm"
              max={260}
              min={40}
              step={1}
              value={patch.bpm}
              onChange={(value) => updatePatch({ bpm: value })}
            />
            <SelectField
              label="bars"
              value={String(patch.targetBars)}
              options={targetBarOptions.map((bars) => ({
                label: formatBars(bars),
                value: String(bars),
              }))}
              onChange={(value) => updatePatch({ targetBars: Number(value) })}
            />
            <SelectField
              label="mode"
              value={patch.mode}
              options={TimeStretchModeSchema.options.map((mode) => ({
                label: mode,
                value: mode,
              }))}
              onChange={(value) => updatePatch({ mode: value as TimeStretchMode })}
            />
            <SelectField
              label="performance"
              value={patch.performanceMode}
              options={TimeStretchPerformanceModeSchema.options.map((mode) => ({
                label: mode,
                value: mode,
              }))}
              onChange={(value) =>
                updatePatch({ performanceMode: value as TimeStretchPerformanceMode })
              }
            />
            <NumberField
              key={`window-${patch.windowMs}`}
              label="window ms"
              max={2000}
              min={20}
              step={5}
              value={patch.windowMs}
              onChange={(value) => updatePatch({ windowMs: value })}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <RangeField
              label="spectral blur"
              value={patch.spectralBlur}
              onChange={(value) => updatePatch({ spectralBlur: value })}
            />
            <RangeField
              label="texture"
              value={patch.texture}
              onChange={(value) => updatePatch({ texture: value })}
            />
            <RangeField
              label="stereo width"
              max={2}
              value={patch.stereoWidth}
              onChange={(value) => updatePatch({ stereoWidth: value })}
            />
            <RangeField
              label="octave down"
              value={patch.octaveDownMix}
              onChange={(value) => updatePatch({ octaveDownMix: value })}
            />
            <RangeField
              label="subharmonic"
              value={patch.subharmonicMix}
              onChange={(value) => updatePatch({ subharmonicMix: value })}
            />
            <RangeField
              label="freeze position"
              value={patch.freezePosition}
              onChange={(value) => updatePatch({ freezePosition: value })}
            />
            <RangeField
              label="movement"
              value={patch.movementDepth}
              onChange={(value) => updatePatch({ movementDepth: value })}
            />
            <RangeField
              label="degradation"
              value={patch.degradation}
              onChange={(value) => updatePatch({ degradation: value })}
            />
            <RangeField
              label="wow flutter"
              value={patch.wowFlutter}
              onChange={(value) => updatePatch({ wowFlutter: value })}
            />
            <RangeField
              label="dropout"
              value={patch.dropoutAmount}
              onChange={(value) => updatePatch({ dropoutAmount: value })}
            />
            <RangeField
              label="noise"
              value={patch.noiseAmount}
              onChange={(value) => updatePatch({ noiseAmount: value })}
            />
            <RangeField
              label="filter drift"
              value={patch.filterDrift}
              onChange={(value) => updatePatch({ filterDrift: value })}
            />
            <RangeField
              label="sub motion"
              value={patch.subMotion}
              onChange={(value) => updatePatch({ subMotion: value })}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={isBusy} onClick={() => void renderStretch()}>
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <StretchHorizontal className="size-4" />
              )}
              {formatRenderButton(status)}
            </Button>
            <Button
              disabled={isBusy}
              variant={isPlaying ? "danger" : "ghost"}
              onClick={() => void togglePlayback()}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              {isPlaying ? "stop" : "play render"}
            </Button>
          </div>

          <div className="mt-3">
            <ToolExportPanel
              audioExport={() => exportRenderedWav()}
              document={patchDocument}
              filenameStem={TOOL_SLUG}
              manifest={timeStretchManifest}
            />
          </div>

          {error ? <p className="mt-3 text-xs text-amber-200">{error}</p> : null}
        </div>

        <aside className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
            <Clock3 className="size-4 text-zinc-200" />
            timing
          </div>
          <div className="grid gap-2 text-xs">
            <Metric label="source" value={sample.name} />
            <Metric
              label="source length"
              value={sourceBuffer ? formatDuration(sourceBuffer.duration) : "not decoded"}
            />
            <Metric label="target length" value={formatDuration(targetDurationSec)} />
            <Metric
              label="stretch ratio"
              value={stretchRatio ? `${stretchRatio.toFixed(2)}x` : "pending"}
            />
            <Metric label="phase" value={patch.phaseMode} />
            <Metric label="transients" value={patch.transientMode} />
            <Metric label="performance" value={patch.performanceMode} />
            <Metric
              label="render"
              value={renderedBuffer ? formatDuration(renderedBuffer.duration) : status}
            />
          </div>

          <div className="mt-4 border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
              <SlidersHorizontal className="size-4 text-zinc-200" />
              agent patch
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-zinc-400">
              {JSON.stringify(
                {
                  prompt: buildTimeStretchPrompt({
                    currentPatch: patch,
                    prompt,
                    sourceDurationSec: sourceBuffer?.duration ?? 0,
                  }),
                  patch,
                },
                null,
                2,
              )}
            </pre>
          </div>
        </aside>
      </section>

      <section className="grid border-b border-zinc-800 lg:grid-cols-2">
        <WaveformPanel
          audioBuffer={sourceBuffer}
          emptyLabel="decode the source to inspect its waveform"
          label="source"
        />
        <WaveformPanel
          audioBuffer={renderedBuffer}
          emptyLabel="render a stretch to inspect output"
          label="stretched render"
        />
      </section>
    </main>
  );
}

function WaveformPanel({
  audioBuffer,
  emptyLabel,
  label,
}: {
  audioBuffer: TimeStretchAudioBufferLike | null;
  emptyLabel: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    const channel = audioBuffer.getChannelData(0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#09090b";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#e4e4e7";
    context.lineWidth = 1;
    context.beginPath();

    for (let x = 0; x < width; x += 1) {
      const start = Math.floor((x / width) * channel.length);
      const end = Math.max(start + 1, Math.floor(((x + 1) / width) * channel.length));
      let min = 0;
      let max = 0;
      for (let index = start; index < end; index += 1) {
        const value = channel[index] ?? 0;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      const y1 = (1 - (max + 1) * 0.5) * height;
      const y2 = (1 - (min + 1) * 0.5) * height;
      context.moveTo(x + 0.5, y1);
      context.lineTo(x + 0.5, y2);
    }
    context.stroke();
  }, [audioBuffer]);

  return (
    <div className="border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 uppercase tracking-[0.16em] text-zinc-500">
          <AudioWaveform className="size-4 text-zinc-200" />
          {label}
        </div>
        <span className="text-zinc-500">
          {audioBuffer ? formatDuration(audioBuffer.duration) : emptyLabel}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        aria-label={`${label} waveform`}
        className="h-32 w-full border border-zinc-800 bg-zinc-950"
        height={128}
        width={960}
      />
    </div>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  const [draftValue, setDraftValue] = useState(String(value));

  function commitDraft(nextValue: string) {
    setDraftValue(nextValue);
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      return;
    }
    onChange(parsed);
  }

  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <input
        className="mt-2 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none focus:border-zinc-200"
        max={max}
        min={min}
        step={step}
        type="number"
        value={draftValue}
        onBlur={() => setDraftValue(String(value))}
        onChange={(event) => commitDraft(event.currentTarget.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <select
        className="mt-2 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none focus:border-zinc-200"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RangeField({
  label,
  max = 1,
  onChange,
  value,
}: {
  label: string;
  max?: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="text-zinc-200">{value.toFixed(2)}</span>
      </span>
      <input
        className="mt-2 w-full accent-zinc-100"
        max={max}
        min={0}
        step={0.01}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right text-zinc-200">{value}</span>
    </div>
  );
}

function formatRenderButton(status: RenderStatus) {
  switch (status) {
    case "loading-source":
      return "loading source";
    case "rendering":
      return "rendering";
    case "ready":
      return "render again";
    case "error":
    case "idle":
      return "render stretch";
  }
}

function formatDuration(durationSec: number) {
  if (durationSec >= 60) {
    const minutes = Math.floor(durationSec / 60);
    const seconds = Math.round(durationSec % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${durationSec.toFixed(2)}s`;
}

function formatBars(bars: number) {
  return Number.isInteger(bars) ? String(bars) : bars.toFixed(2);
}
