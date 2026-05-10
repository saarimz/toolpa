"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Track } from "@/lib/pattern/schema";
import { getSampleSchema } from "@/lib/samples/analysis";
import { hasLibraryAnalysis } from "@/lib/samples/analysis/library-cache";
import type { SampleAnalysis } from "@/lib/samples/analysis/schema";
import {
  getLibrarySamplesByRoles,
  type LibrarySample,
} from "@/lib/samples/library";
import type { SampleRole } from "@/lib/samples/roles";
import {
  listUploadedSamples,
  type UploadedSampleRecord,
} from "@/lib/samples/storage";
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
  const [showRawSchema, setShowRawSchema] = useState(false);
  const librarySamples = useMemo(() => getLibrarySamplesByRoles(roles), [roles]);
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
    <div className="flex flex-col gap-2">
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
          <optgroup label="library">
            {librarySamples.map((sample) => (
              <option key={sample.id} value={sample.id}>
                {sample.name} / {sample.role}
              </option>
            ))}
          </optgroup>
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
        showRaw={showRawSchema}
        onToggleRaw={() => setShowRawSchema((prev) => !prev)}
        onAnalyze={() => void runAnalysis(value)}
      />
    </div>
  );
}

type AnalysisPanelProps = {
  sampleId: string;
  state: AnalysisState;
  showRaw: boolean;
  onToggleRaw: () => void;
  onAnalyze: () => void;
};

function AnalysisPanel({
  sampleId,
  state,
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
