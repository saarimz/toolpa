"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Copy,
  Lightbulb,
  Loader2,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";

import { AudioOutputRecorder } from "@/components/audio-output-recorder";
import { PromptFirstSection } from "@/components/prompt-first-section";
import { Button } from "@/components/ui/button";
import {
  SamplePicker,
  type PickedSample,
} from "@/components/sample-picker";
import {
  startSamplePlaybackSlice,
  type SampleAuditionHandle,
} from "@/lib/audio/sample-playback";
import {
  SampleUseIdeasOutputSchema,
  type SampleUseIdea,
} from "@/lib/ai/sample-ideas.shared";
import { getSampleSchema } from "@/lib/samples/analysis";
import type { SampleAnalysis } from "@/lib/samples/analysis/schema";
import { getDefaultLibrarySample } from "@/lib/samples/library";
import type { SampleRole } from "@/lib/samples/roles";

const TOOL_SLUG = "sample-analysis";
const sampleRoles: SampleRole[] = ["break", "loop", "oneshot", "melodic", "pad", "fx"];
const defaultSample = getDefaultLibrarySample(sampleRoles);
const defaultIntent =
  "How are you trying to use this sample? Give me arrangement and complement ideas.";

type AnalysisStatus = "idle" | "analyzing" | "ready" | "error";
type AsyncStatus = "idle" | "loading" | "ready" | "error";

export function SampleAnalysisClient() {
  const [sample, setSample] = useState<PickedSample>({
    id: defaultSample.id,
    name: defaultSample.name,
    origin: "library",
    role: defaultSample.role,
  });
  const [intentPrompt, setIntentPrompt] = useState(defaultIntent);
  const [analysis, setAnalysis] = useState<SampleAnalysis | null>(null);
  const [ideas, setIdeas] = useState<SampleUseIdea[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [descriptorStatus, setDescriptorStatus] = useState<AsyncStatus>("idle");
  const [ideasStatus, setIdeasStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isAuditioning, setIsAuditioning] = useState(false);
  const requestIdRef = useRef(0);
  const auditionHandleRef = useRef<SampleAuditionHandle | null>(null);
  const isBusy =
    status === "analyzing" ||
    descriptorStatus === "loading" ||
    ideasStatus === "loading";

  useEffect(
    () => () => {
      auditionHandleRef.current?.stop();
      auditionHandleRef.current = null;
    },
    [],
  );

  async function analyzeSample() {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrentRequest = () => requestIdRef.current === requestId;

    setStatus("analyzing");
    setDescriptorStatus("idle");
    setIdeasStatus("idle");
    setError(null);
    setIdeas([]);

    try {
      const baseline = await getSampleSchema(sample.id, {
        enrichDescriptors: false,
        waitForDescriptors: false,
      });

      if (!isCurrentRequest()) {
        return;
      }

      setAnalysis(baseline);
      setStatus("ready");
      setDescriptorStatus(baseline.llm_descriptors ? "ready" : "loading");
      setIdeasStatus("loading");

      const descriptorTask = baseline.llm_descriptors
        ? Promise.resolve(baseline)
        : getSampleSchema(sample.id, { waitForDescriptors: true });

      const descriptorWork = descriptorTask
        .then((enriched) => {
          if (!isCurrentRequest()) {
            return;
          }
          setAnalysis((current) =>
            current?.source.sha256 === baseline.source.sha256
              ? {
                  ...current,
                  llm_descriptors:
                    enriched.llm_descriptors ?? current.llm_descriptors,
                }
              : current,
          );
          setDescriptorStatus(enriched.llm_descriptors ? "ready" : "error");
        })
        .catch((unknownError) => {
          if (!isCurrentRequest()) {
            return;
          }
          setDescriptorStatus("error");
          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "AI descriptors unavailable",
          );
        });

      const ideasWork = fetchSampleIdeas({
        analysis: baseline,
        intentPrompt: intentPrompt.trim() || defaultIntent,
        sourceName: sample.name,
      })
        .then((nextIdeas) => {
          if (!isCurrentRequest()) {
            return;
          }
          setIdeas(nextIdeas);
          setIdeasStatus("ready");
        })
        .catch((unknownError) => {
          if (!isCurrentRequest()) {
            return;
          }
          setIdeasStatus("error");
          setStatus("ready");
          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "AI ideas unavailable",
          );
        });

      await Promise.allSettled([descriptorWork, ideasWork]);
    } catch (unknownError) {
      if (!isCurrentRequest()) {
        return;
      }
      setStatus("error");
      setDescriptorStatus("idle");
      setIdeasStatus("idle");
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Sample analysis failed",
      );
    }
  }

  async function toggleAudition() {
    if (auditionHandleRef.current) {
      stopAudition();
      return;
    }

    try {
      setError(null);
      const handle = await startSamplePlaybackSlice(sample.id, 0, { sliceCount: 1 });
      auditionHandleRef.current = handle;
      setIsAuditioning(true);
      void handle.finished.then(() => {
        if (auditionHandleRef.current !== handle) {
          return;
        }
        auditionHandleRef.current = null;
        setIsAuditioning(false);
      });
    } catch (unknownError) {
      auditionHandleRef.current = null;
      setIsAuditioning(false);
      setError(
        unknownError instanceof Error ? unknownError.message : "Could not play sample",
      );
    }
  }

  function stopAudition() {
    const handle = auditionHandleRef.current;
    auditionHandleRef.current = null;
    setIsAuditioning(false);
    handle?.stop();
  }

  async function copyResult() {
    if (!analysis) {
      return;
    }

    await navigator.clipboard.writeText(
      JSON.stringify({ analysis, ideas, intentPrompt, sample }, null, 2),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 p-4">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-200">
            /dashboard
          </Link>
          <h1 className="mt-1 text-lg tracking-normal text-zinc-100">
            sample-analysis
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>L1</span>
          <span className="text-zinc-200">assist</span>
          <span>{sample.role}</span>
        </div>
      </header>

      <PromptFirstSection className="grid lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
          <SamplePicker
            id="sample-analysis-source"
            label="sample source"
            value={sample.id}
            roles={sampleRoles}
            onSelect={(nextSample) => {
              stopAudition();
              setSample(nextSample);
              requestIdRef.current += 1;
              setAnalysis(null);
              setIdeas([]);
              setStatus("idle");
              setDescriptorStatus("idle");
              setIdeasStatus("idle");
              setError(null);
            }}
          />

          <label className="mt-4 block text-xs text-zinc-500">
            intent prompt
            <textarea
              className="mt-2 h-28 w-full resize-none rounded-sm border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-100 outline-none focus:border-zinc-200"
              value={intentPrompt}
              onChange={(event) => setIntentPrompt(event.currentTarget.value)}
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={isBusy} onClick={() => void analyzeSample()}>
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {formatAnalyzeButtonLabel(status, descriptorStatus, ideasStatus)}
            </Button>
            <Button
              variant={isAuditioning ? "danger" : "ghost"}
              onClick={() => void toggleAudition()}
            >
              {isAuditioning ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
              {isAuditioning ? "stop sample" : "play sample"}
            </Button>
            <AudioOutputRecorder filename={TOOL_SLUG} sourceId={TOOL_SLUG} />
            <Button disabled={!analysis} onClick={() => void copyResult()}>
              <Copy className="size-4" />
              {copied ? "copied" : "copy json"}
            </Button>
          </div>
          {error ? <p className="mt-3 text-xs text-amber-200">{error}</p> : null}
        </div>

        <aside className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
            <BarChart3 className="size-4 text-zinc-200" />
            measured
          </div>
          {analysis ? (
            <AnalysisReadout
              analysis={analysis}
              descriptorStatus={descriptorStatus}
            />
          ) : (
            <div className="border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">
              {status === "analyzing" ? "analysis running" : "analysis pending"}
            </div>
          )}
        </aside>
      </PromptFirstSection>

      <section className="p-4">
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <Lightbulb className="size-4 text-zinc-200" />
          ideas
        </div>
        {ideas.length > 0 ? (
          <ol className="grid gap-3 lg:grid-cols-5">
            {ideas.map((idea, index) => (
              <li
                className="border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5"
                key={`${idea.title}-${index}`}
              >
                <div className="mb-2 text-zinc-100">
                  {index + 1}. {idea.title}
                </div>
                <p className="text-zinc-400">{idea.approach}</p>
                <p className="mt-2 text-zinc-500">{idea.complement}</p>
                <p className="mt-2 text-zinc-300">{idea.productionMove}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">
            {formatIdeasPlaceholder(ideasStatus)}
          </div>
        )}
      </section>
    </main>
  );
}

function AnalysisReadout({
  analysis,
  descriptorStatus,
}: {
  analysis: SampleAnalysis;
  descriptorStatus: AsyncStatus;
}) {
  const descriptors = analysis.llm_descriptors;

  return (
    <div className="grid gap-2 text-xs">
      <Metric label="role" value={formatRole(analysis)} />
      <Metric label="tempo" value={formatBpm(analysis)} />
      <Metric label="tonality" value={formatKey(analysis)} />
      <Metric
        label="loudness"
        value={`${analysis.global.lufs_integrated.toFixed(1)} LUFS / ${analysis.global.true_peak_dbfs.toFixed(1)} dBFS peak`}
      />
      <Metric label="duration" value={`${analysis.source.duration_s.toFixed(2)}s`} />
      <Metric label="onsets" value={String(analysis.rhythm.onsets_s.length)} />
      <Metric label="slices" value={String(analysis.slices.length)} />
      <Metric
        label="brightness"
        value={`${analysis.spectral.centroid_hz.mean.toFixed(0)} hz centroid`}
      />
      {descriptors ? (
        <>
          <Metric label="timbre" value={descriptors.timbre.join(", ") || "--"} />
          <Metric label="mood" value={descriptors.mood.join(", ") || "--"} />
        </>
      ) : (
        <Metric label="descriptors" value={formatDescriptorPlaceholder(descriptorStatus)} />
      )}
    </div>
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

function formatRole(analysis: SampleAnalysis) {
  return analysis.role
    ? `${analysis.role} (${Math.round(analysis.role_confidence * 100)}%)`
    : "unknown";
}

function formatBpm(analysis: SampleAnalysis) {
  return analysis.rhythm.bpm
    ? `${analysis.rhythm.bpm.toFixed(1)} bpm (${Math.round(analysis.rhythm.bpm_confidence * 100)}%)`
    : "no bpm";
}

function formatKey(analysis: SampleAnalysis) {
  return analysis.tonal.key
    ? `${analysis.tonal.key} ${analysis.tonal.scale ?? ""} (${Math.round(analysis.tonal.key_strength * 100)}%)`
    : "no key";
}

async function readApiError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.message ?? payload.error ?? "AI ideas unavailable";
  } catch {
    return "AI ideas unavailable";
  }
}

async function fetchSampleIdeas({
  analysis,
  intentPrompt,
  sourceName,
}: {
  analysis: SampleAnalysis;
  intentPrompt: string;
  sourceName: string;
}): Promise<SampleUseIdea[]> {
  const response = await fetch("/api/sample-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      analysis,
      intentPrompt,
      sourceName,
      task: "ideas",
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const payload = (await response.json()) as {
    ideas?: unknown;
  };
  const parsedIdeas = SampleUseIdeasOutputSchema.safeParse(payload.ideas);
  if (!parsedIdeas.success) {
    throw new Error("AI response did not include five structured ideas.");
  }
  return parsedIdeas.data.ideas;
}

function formatAnalyzeButtonLabel(
  status: AnalysisStatus,
  descriptorStatus: AsyncStatus,
  ideasStatus: AsyncStatus,
): string {
  if (status === "analyzing") {
    return "analyzing";
  }
  if (descriptorStatus === "loading") {
    return "describing";
  }
  if (ideasStatus === "loading") {
    return "thinking";
  }
  return "analyze";
}

function formatDescriptorPlaceholder(status: AsyncStatus): string {
  switch (status) {
    case "loading":
      return "loading...";
    case "error":
      return "unavailable";
    case "ready":
      return "none";
    case "idle":
      return "pending";
  }
}

function formatIdeasPlaceholder(status: AsyncStatus): string {
  switch (status) {
    case "loading":
      return "ideas running";
    case "error":
      return "ideas unavailable";
    case "ready":
      return "no ideas returned";
    case "idle":
      return "structured ideas pending";
  }
}
