"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { computeWaveformBars } from "@/lib/audio/waveform";
import type { Track } from "@/lib/pattern/schema";
import { getSampleSchema } from "@/lib/samples/analysis";
import { hasLibraryAnalysis } from "@/lib/samples/analysis/library-cache";
import type { SampleAnalysis } from "@/lib/samples/analysis/schema";
import {
  getLibrarySamplesByRoles,
  type LibraryGenre,
  type LibrarySample,
  type LibrarySampleKind,
} from "@/lib/samples/library";
import type { SampleRole } from "@/lib/samples/roles";
import {
  listUploadedSamples,
  type UploadedSampleRecord,
} from "@/lib/samples/storage";
import { resolveSample } from "@/lib/samples/resolver";
import { persistUploadedSample } from "@/lib/samples/upload";

export type PickedSample = {
  id: string;
  name: string;
  role: Track["role"];
  origin: "library" | "upload";
};

type SamplePickerProps = {
  id: string;
  label: string;
  value: string;
  roles: readonly SampleRole[];
  onSelect: (sample: PickedSample) => void;
};

type AnalysisState =
  | { status: "idle" }
  | { status: "analyzing" }
  | { status: "ready"; analysis: SampleAnalysis }
  | { status: "error"; message: string };

type WaveformState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      bars: number[];
      durationSec: number;
      sampleRate: number;
      channelCount: number;
    }
  | { status: "error"; message: string };

export function SamplePicker({
  id,
  label,
  value,
  roles,
  onSelect,
}: SamplePickerProps) {
  const [uploads, setUploads] = useState<UploadedSampleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    status: "idle",
  });
  const [waveformState, setWaveformState] = useState<WaveformState>({
    status: "idle",
  });
  const [showRawSchema, setShowRawSchema] = useState(false);
  const librarySamples = useMemo(() => getLibrarySamplesByRoles(roles), [roles]);
  const libraryGroups = useMemo(
    () => groupLibrarySamples(librarySamples),
    [librarySamples],
  );
  const selectedUploadMissing =
    value.startsWith("upload:") && !uploads.some((upload) => upload.id === value);

  useEffect(() => {
    let cancelled = false;

    async function loadUploads() {
      const records = await listUploadedSamples();
      if (!cancelled) {
        setUploads(records);
      }
    }

    void loadUploads().catch((unknownError) => {
      if (!cancelled) {
        setError(
          unknownError instanceof Error ? unknownError.message : "Could not load uploads",
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const runAnalysis = useCallback(async (sampleId: string) => {
    if (!sampleId) {
      setAnalysisState({ status: "idle" });
      return;
    }

    setShowRawSchema(false);
    setAnalysisState({ status: "analyzing" });
    try {
      const analysis = await getSampleSchema(sampleId);
      setAnalysisState({ status: "ready", analysis });
    } catch (analysisError) {
      setAnalysisState({
        status: "error",
        message:
          analysisError instanceof Error
            ? analysisError.message
            : "Analysis failed",
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const setIdle = () => {
      queueMicrotask(() => {
        if (!cancelled) {
          setAnalysisState({ status: "idle" });
        }
      });
    };

    if (!value) {
      setIdle();
      return () => {
        cancelled = true;
      };
    }

    if (value.startsWith("library:") && hasLibraryAnalysis(value)) {
      queueMicrotask(() => {
        if (!cancelled) {
          void runAnalysis(value);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    setIdle();
    return () => {
      cancelled = true;
    };
  }, [value, runAnalysis]);

  useEffect(() => {
    let cancelled = false;
    const setIdle = () => {
      queueMicrotask(() => {
        if (!cancelled) {
          setWaveformState({ status: "idle" });
        }
      });
    };
    const setLoading = () => {
      queueMicrotask(() => {
        if (!cancelled) {
          setWaveformState({ status: "loading" });
        }
      });
    };

    if (!value) {
      setIdle();
      return () => {
        cancelled = true;
      };
    }

    setLoading();
    void resolveSample(value)
      .then((resolved) => {
        if (cancelled) {
          return;
        }

        setWaveformState({
          status: "ready",
          bars: computeWaveformBars(resolved.audioBuffer, 96),
          durationSec: resolved.audioBuffer.duration,
          sampleRate: resolved.audioBuffer.sampleRate,
          channelCount: resolved.audioBuffer.numberOfChannels,
        });
      })
      .catch((unknownError) => {
        if (!cancelled) {
          setWaveformState({
            status: "error",
            message:
              unknownError instanceof Error
                ? unknownError.message
                : "Could not decode waveform",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  async function handleUpload(file: File | null) {
    if (!file) {
      return;
    }

    setError(null);

    try {
      const record = await persistUploadedSample(file);
      setUploads((current) => [
        record,
        ...current.filter((candidate) => candidate.id !== record.id),
      ]);
      onSelect({
        id: record.id,
        name: record.name,
        role: "unknown",
        origin: "upload",
      });
      void runAnalysis(record.id);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Upload failed");
    }
  }

  function handleSelect(nextId: string) {
    const librarySample = librarySamples.find((sample) => sample.id === nextId);
    if (librarySample) {
      onSelect(toPickedLibrarySample(librarySample));
      return;
    }

    const upload = uploads.find((sample) => sample.id === nextId);
    if (upload) {
      onSelect({
        id: upload.id,
        name: upload.name,
        role: "unknown",
        origin: "upload",
      });
    }
  }

  return (
    <div className="flex min-w-0 flex-1 basis-[30rem] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-zinc-500" htmlFor={id}>
          {label}
        </label>
        <select
          id={id}
          value={value}
          onChange={(event) => handleSelect(event.target.value)}
          className="h-9 min-w-64 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
        >
          {selectedUploadMissing ? <option value={value}>uploaded sample</option> : null}
          {libraryGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.samples.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {formatLibraryOptionLabel(sample)}
                </option>
              ))}
            </optgroup>
          ))}
          {uploads.length > 0 ? (
            <optgroup label="uploads">
              {uploads.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.name} / upload
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-200 hover:border-zinc-500">
          <Upload className="size-4" />
          upload
          <input
            className="sr-only"
            type="file"
            accept="audio/*,.wav,.mp3,.aif,.aiff,.flac,.ogg,.m4a"
            onChange={(event) => void handleUpload(event.currentTarget.files?.[0] ?? null)}
          />
        </label>
        {error ? (
          <span className="text-xs text-red-300">{error}</span>
        ) : (
          <Button className="pointer-events-none h-9 px-2 text-zinc-600">audio</Button>
        )}
      </div>
      <AnalysisPanel
        sampleId={value}
        state={analysisState}
        waveform={waveformState}
        showRaw={showRawSchema}
        onToggleRaw={() => setShowRawSchema((prev) => !prev)}
        onAnalyze={() => void runAnalysis(value)}
      />
    </div>
  );
}

type LibrarySampleGroup = {
  label: string;
  samples: LibrarySample[];
};

const genreLabels: Record<LibraryGenre, string> = {
  "ambient-experimental": "ambient / experimental",
  "cinematic-fx": "cinematic fx",
  "club-house": "club / house",
  "jungle-dnb": "jungle / dnb",
  "uk-dubstep": "uk dubstep",
  "vocal-world": "vocal / world",
};

const kindLabels: Record<LibrarySampleKind, string> = {
  "amen-break": "amen break",
  "bass-hit": "bass hit",
  "bass-loop": "bass loop",
  "drum-break": "drum break",
  "drum-hit": "drum hit",
  "drum-loop": "drum loop",
  "fx-hit": "fx hit",
  "fx-texture": "fx texture",
  "melodic-hit": "melodic hit",
  "melodic-loop": "melodic loop",
  "pad-drone": "pad / drone",
  "percussion-loop": "percussion loop",
  "top-loop": "top loop",
  "vocal-phrase": "vocal phrase",
};

const roleLabels: Record<SampleRole, string> = {
  break: "breaks",
  fx: "fx",
  loop: "loops",
  melodic: "melodic",
  oneshot: "one-shots",
  pad: "pads",
};

const genreSortOrder: Array<LibraryGenre | "core"> = [
  "jungle-dnb",
  "uk-dubstep",
  "ambient-experimental",
  "cinematic-fx",
  "club-house",
  "vocal-world",
  "core",
];

const roleSortOrder: SampleRole[] = [
  "break",
  "loop",
  "oneshot",
  "melodic",
  "pad",
  "fx",
];

function groupLibrarySamples(samples: readonly LibrarySample[]): LibrarySampleGroup[] {
  const sorted = [...samples].sort(compareLibrarySamples);
  const groups = new Map<string, LibrarySampleGroup>();

  for (const sample of sorted) {
    const label = `${formatGenre(sample.genre)} / ${roleLabels[sample.role]}`;
    const group = groups.get(label) ?? { label, samples: [] };
    group.samples.push(sample);
    groups.set(label, group);
  }

  return [...groups.values()];
}

function compareLibrarySamples(left: LibrarySample, right: LibrarySample) {
  return (
    genreRank(left.genre) - genreRank(right.genre) ||
    roleSortOrder.indexOf(left.role) - roleSortOrder.indexOf(right.role) ||
    (left.kind ?? "").localeCompare(right.kind ?? "") ||
    left.name.localeCompare(right.name)
  );
}

function genreRank(genre: LibrarySample["genre"]) {
  return genreSortOrder.indexOf(genre ?? "core");
}

function formatGenre(genre: LibrarySample["genre"]) {
  return genre ? genreLabels[genre] : "core library";
}

function formatLibraryOptionLabel(sample: LibrarySample) {
  const kind = sample.kind ? kindLabels[sample.kind] : roleLabels[sample.role];
  const bpm = sample.estimatedBpm ? ` / ${sample.estimatedBpm} bpm` : "";
  return `${sample.name} / ${kind}${bpm} / ${sample.pack}`;
}

type AnalysisPanelProps = {
  sampleId: string;
  state: AnalysisState;
  waveform: WaveformState;
  showRaw: boolean;
  onToggleRaw: () => void;
  onAnalyze: () => void;
};

function AnalysisPanel({
  sampleId,
  state,
  waveform,
  showRaw,
  onToggleRaw,
  onAnalyze,
}: AnalysisPanelProps) {
  if (!sampleId) {
    return null;
  }

  const statusLabel = describeStatus(state);

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-zinc-500">analysis</span>
        <span className="text-zinc-200">{statusLabel}</span>
        <button
          type="button"
          onClick={onAnalyze}
          className="rounded-sm border border-zinc-700 px-2 py-0.5 text-zinc-200 hover:border-zinc-500"
        >
          {state.status === "ready" ? "re-analyze" : "analyze"}
        </button>
        {state.status === "ready" ? (
          <button
            type="button"
            onClick={onToggleRaw}
            className="rounded-sm border border-zinc-800 px-2 py-0.5 text-zinc-400 hover:border-zinc-500"
          >
            {showRaw ? "hide schema" : "show schema"}
          </button>
        ) : null}
      </div>
      <WaveformPreview state={waveform} />
      {state.status === "ready" ? (
        <AnalysisSummary analysis={state.analysis} />
      ) : null}
      {state.status === "ready" && showRaw ? (
        <pre className="mt-2 max-h-60 overflow-auto rounded-sm bg-black/60 p-2 text-[10px] leading-tight text-zinc-300">
          {JSON.stringify(state.analysis, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

const loadingWaveformBars = Array.from(
  { length: 96 },
  (_, index) => 0.12 + Math.abs(Math.sin(index * 0.65)) * 0.36,
);

function WaveformPreview({ state }: { state: WaveformState }) {
  const bars = state.status === "ready" ? state.bars : loadingWaveformBars;
  const label =
    state.status === "ready"
      ? `${formatDuration(state.durationSec)} / ${formatSampleRate(state.sampleRate)} / ${state.channelCount} ch`
      : state.status === "loading"
        ? "loading waveform"
        : state.status === "error"
          ? `waveform unavailable: ${state.message}`
          : "waveform not loaded";
  const isReady = state.status === "ready";
  const isError = state.status === "error";

  return (
    <div className="mt-2">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-zinc-500">waveform</span>
        <span className={isError ? "text-red-300" : "text-zinc-300"}>{label}</span>
      </div>
      <div
        role="img"
        aria-label={`full waveform, ${label}`}
        className="flex h-16 items-center gap-px overflow-hidden rounded-sm border border-zinc-800 bg-black/60 px-1 py-2"
      >
        {bars.map((height, index) => (
          <span
            key={index}
            className={isReady ? "flex-1 bg-zinc-200" : "flex-1 bg-zinc-700/50"}
            style={{ height: `${Math.max(isReady ? 3 : 8, Math.round(height * 100))}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function formatDuration(durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return "unknown length";
  }

  if (durationSec >= 60) {
    const minutes = Math.floor(durationSec / 60);
    const seconds = (durationSec % 60).toFixed(1).padStart(4, "0");
    return `${minutes}:${seconds}`;
  }

  return `${durationSec.toFixed(durationSec >= 10 ? 1 : 2)}s`;
}

function formatSampleRate(sampleRate: number) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return "unknown rate";
  }

  const khz = sampleRate / 1000;
  return `${khz.toFixed(Number.isInteger(khz) ? 0 : 1)} kHz`;
}

function AnalysisSummary({ analysis }: { analysis: SampleAnalysis }) {
  const bpm =
    analysis.rhythm.bpm !== null
      ? `${analysis.rhythm.bpm.toFixed(1)} bpm (${(analysis.rhythm.bpm_confidence * 100).toFixed(0)}%)`
      : "no bpm";
  const key =
    analysis.tonal.key && analysis.tonal.key_strength > 0.5
      ? `${analysis.tonal.key} ${analysis.tonal.scale ?? ""} (${(analysis.tonal.key_strength * 100).toFixed(0)}%)`
      : "no key";
  const role =
    analysis.role !== null
      ? `${analysis.role} (${(analysis.role_confidence * 100).toFixed(0)}%)`
      : "role unknown";

  return (
    <div className="mt-2 grid grid-cols-1 gap-y-1 sm:grid-cols-2">
      <span>role: {role}</span>
      <span>tempo: {bpm}</span>
      <span>tonality: {key}</span>
      <span>
        loudness: {analysis.global.lufs_integrated.toFixed(1)} LUFS, peak{" "}
        {analysis.global.true_peak_dbfs.toFixed(1)} dBFS
      </span>
      <span>onsets: {analysis.rhythm.onsets_s.length}</span>
      <span>slices: {analysis.slices.length}</span>
      {analysis.llm_descriptors ? (
        <>
          <span className="col-span-full">
            timbre: {analysis.llm_descriptors.timbre.join(", ") || "—"}
          </span>
          <span className="col-span-full">
            mood: {analysis.llm_descriptors.mood.join(", ") || "—"}
          </span>
        </>
      ) : (
        <span className="col-span-full text-zinc-500">descriptors pending…</span>
      )}
    </div>
  );
}

function describeStatus(state: AnalysisState): string {
  switch (state.status) {
    case "idle":
      return "not analyzed";
    case "analyzing":
      return "analyzing…";
    case "ready":
      return "ready";
    case "error":
      return `error: ${state.message}`;
  }
}

function toPickedLibrarySample(sample: LibrarySample): PickedSample {
  return {
    id: sample.id,
    name: sample.name,
    role: sample.role,
    origin: "library",
  };
}
