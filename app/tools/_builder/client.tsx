"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Code2,
  Hammer,
  Loader2,
  Square,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { PromptFirstSection } from "@/components/prompt-first-section";
import { readNdjsonStream } from "@/lib/ai/client-stream";
import {
  deriveGeneratedToolName,
  slugifyToolName,
} from "@/lib/agents/builder-naming";
import type {
  BuilderStreamChunk,
  BuildToolSpecialization,
} from "@/lib/agents/builder-contracts";
import type { GeneratedToolAudit } from "@/lib/agents/generated-audit";
import type { BuilderProfilePlan } from "@/lib/agents/builder-profiles";
import {
  buildBuilderProgress,
  type BuilderProgressStage,
  type BuilderProgressStatus,
  type BuilderProgressSummary,
} from "@/lib/agents/builder-progress";

type StreamLine = {
  id: number;
  label: string;
  body: string;
};

type ToolBuilderClientProps = {
  builderDetail?: string;
  builderPlan?: BuilderProfilePlan;
  builderRoute?: string;
  builderSlug?: string;
  editSlug?: string;
  generatedAudit?: GeneratedToolAudit;
  initialDescription?: string;
  initialInstrumentType?: string;
  initialName?: string;
  initialReferenceAgent?: string;
  initialSlug?: string;
  lockInstrumentType?: boolean;
  mode?: "create" | "rebuild";
};

export function ToolBuilderClient({
  builderDetail = "L2 driven",
  builderPlan,
  builderRoute = "/build",
  builderSlug = "tool-builder",
  editSlug,
  generatedAudit,
  initialDescription,
  initialInstrumentType,
  initialName,
  initialReferenceAgent,
  initialSlug,
  lockInstrumentType = false,
  mode = "create",
}: ToolBuilderClientProps = {}) {
  const defaultDescription =
    initialDescription ||
    "a tool that takes a vocal sample and stutters it with probabilistic repeats";
  const abortRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(0);
  const [description, setDescription] = useState(defaultDescription);
  const [slug, setSlug] = useState(
    initialSlug || slugifyToolName(initialName || deriveGeneratedToolName(defaultDescription)),
  );
  const [name, setName] = useState(
    initialName || deriveGeneratedToolName(defaultDescription),
  );
  const [nameEdited, setNameEdited] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [instrumentType, setInstrumentType] = useState(
    initialInstrumentType || "sample",
  );
  const [referenceAgent, setReferenceAgent] = useState(() =>
    initialReferenceAgent ?? getDefaultReferenceAgent(initialInstrumentType || "sample"),
  );
  const [tokenBudget, setTokenBudget] = useState(50000);
  const [isBuilding, setIsBuilding] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [stream, setStream] = useState<StreamLine[]>([]);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [breaches, setBreaches] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [builderChunks, setBuilderChunks] = useState<BuilderStreamChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const builderSpecialization = builderPlan
    ? createBuildToolSpecialization(builderPlan)
    : undefined;
  const isRebuildMode = mode === "rebuild" && Boolean(editSlug || initialSlug);

  async function buildTool() {
    const resolvedName = name.trim() || deriveGeneratedToolName(description);
    const resolvedSlug = slug.trim() || slugifyToolName(resolvedName);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    nextIdRef.current = 0;
    setIsBuilding(true);
    setPhase("starting");
    setStream([]);
    setDecisions([]);
    setAlternatives([]);
    setBreaches([]);
    setFiles([]);
    setBuilderChunks([]);
    setError(null);

    try {
      const response = await fetch(isRebuildMode ? "/api/build/edit" : "/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRebuildMode
            ? {
                description,
                slug: editSlug ?? resolvedSlug,
                tokenBudget,
                register: true,
              }
            : {
                description,
                slug: resolvedSlug,
                name: resolvedName,
                instrumentType,
                referenceAgent,
                builderSpecialization,
                tokenBudget,
                register: true,
              },
        ),
        signal: controller.signal,
      });

      await readNdjsonStream<BuilderStreamChunk>(
        response,
        (chunk) => handleChunk(chunk),
        "Build",
      );
    } catch (unknownError) {
      if (!controller.signal.aborted) {
        setError(unknownError instanceof Error ? unknownError.message : "Build failed");
      }
    } finally {
      setIsBuilding(false);
      setPhase((current) => (current === "complete" ? current : "stopped"));
    }
  }

  function stopBuild() {
    abortRef.current?.abort();
    setIsBuilding(false);
    setPhase("stopped");
  }

  function updateDescription(nextDescription: string) {
    setDescription(nextDescription);
    const nextName = deriveGeneratedToolName(nextDescription);
    if (!nameEdited) {
      setName(nextName);
    }
    if (!slugEdited) {
      setSlug(slugifyToolName(nameEdited ? name : nextName));
    }
  }

  function updateName(nextName: string) {
    setName(nextName);
    setNameEdited(true);
    if (!slugEdited) {
      setSlug(slugifyToolName(nextName || deriveGeneratedToolName(description)));
    }
  }

  function updateSlug(nextSlug: string) {
    setSlug(nextSlug);
    setSlugEdited(true);
  }

  function handleChunk(chunk: BuilderStreamChunk) {
    setBuilderChunks((current) => [...current, chunk]);

    if (chunk.type === "decision") {
      setPhase("planning");
      setDecisions((current) => [chunk.message, ...current]);
      pushStream("decision", chunk.message);
      return;
    }

    if (chunk.type === "alternative") {
      setAlternatives((current) => [chunk.message, ...current]);
      pushStream("alternative", chunk.message);
      return;
    }

    if (chunk.type === "tool-call") {
      setPhase(chunk.name);
      pushStream(chunk.name, `${JSON.stringify(chunk.input)} -> ${JSON.stringify(chunk.result)}`);
      return;
    }

    if (chunk.type === "file") {
      setPhase("writing files");
      setFiles((current) => [chunk.path, ...current]);
      pushStream("file", chunk.path);
      return;
    }

    if (chunk.type === "manifest") {
      setPhase("manifest");
      pushStream("manifest", JSON.stringify(chunk.manifest, null, 2));
      return;
    }

    if (chunk.type === "verification") {
      setPhase(`verifying ${chunk.name}`);
      pushStream(
        chunk.name,
        chunk.passed ? "passed" : chunk.stderr || chunk.stdout || "failed",
      );
      return;
    }

    if (chunk.type === "breach") {
      setPhase("breach");
      setBreaches((current) => [chunk.message, ...current]);
      pushStream("breach", chunk.message);
      return;
    }

    if (chunk.type === "complete") {
      setPhase("complete");
      pushStream(
        "complete",
        `${chunk.manifest.slug} ${chunk.registered ? "registered" : "generated"}`,
      );
      return;
    }

    if (chunk.type === "reasoning") {
      pushStream("reasoning", chunk.delta);
      return;
    }

    setError(chunk.message);
    pushStream("error", chunk.message);
  }

  function pushStream(label: string, body: string) {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setStream((current) => [{ id, label, body }, ...current].slice(0, 80));
  }

  const locked = isBuilding;
  const progress = buildBuilderProgress(builderChunks, { error, isBuilding });
  const currentSlug = slug.trim() || slugifyToolName(name.trim() || deriveGeneratedToolName(description));

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-100 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div>
              <p className="text-xs text-zinc-500">{builderRoute}</p>
              <h1 className="mt-1 text-2xl text-zinc-100">
                {isRebuildMode ? "Rebuild a generated tool" : "Build a tool"}
              </h1>
              <p className="mt-1 text-xs text-zinc-500">
                {builderSlug} / {builderDetail}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                <ArrowLeft className="size-4" />
                dashboard
              </Link>
              <div className="flex h-9 items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-400">
                {isBuilding ? (
                  <Loader2 className="size-4 animate-spin text-zinc-200" />
                ) : (
                  <Wrench className="size-4" />
                )}
                <span>{phase}</span>
              </div>
            </div>
          </header>

          <div className="relative overflow-hidden rounded-sm border border-zinc-800 bg-[radial-gradient(circle_at_1px_1px,rgba(244,244,245,0.11)_1px,transparent_0)] [background-size:22px_22px] p-3 sm:p-4">
            {isBuilding ? (
              <LlmGeneratingOverlay
                detail="Prompting the builder agent and streaming tool files into the sandbox."
                label="building tool"
                tone="soft"
              />
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
              <PromptFirstSection className="rounded-sm border border-zinc-700 bg-zinc-950/95 p-4 shadow-2xl shadow-black/20">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                      step 1
                    </p>
                    <h2 className="mt-1 text-sm text-zinc-100">
                      {isRebuildMode ? "Describe the rebuild" : "Describe it"}
                    </h2>
                  </div>
                  <span className="rounded-sm border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    prompt
                  </span>
                </div>
                <label className="block text-xs text-zinc-500">
                  description
                  <textarea
                    className="mt-2 min-h-40 w-full resize-y rounded-sm border border-zinc-800 bg-zinc-950 p-3 text-sm leading-6 text-zinc-100 outline-none focus:border-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-600"
                    disabled={locked}
                    value={description}
                    onChange={(event) => updateDescription(event.target.value)}
                  />
                </label>
              </PromptFirstSection>

              <section className="rounded-sm border border-zinc-800 bg-zinc-950/95 p-4">
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                    step 2
                  </p>
                  <h2 className="mt-1 text-sm text-zinc-100">
                    {isRebuildMode ? "Existing tool" : "Pick a family"}
                  </h2>
                </div>
                {isRebuildMode ? (
                  <div className="mb-3 rounded-sm border border-zinc-800 bg-black/20 p-3 text-xs leading-5 text-zinc-300">
                    Rebuilding{" "}
                    <span className="font-mono text-zinc-100">
                      {editSlug ?? currentSlug}
                    </span>
                    . The editor reads the existing tool, edits only that tool directory,
                    then reruns manifest, static, typecheck, test, audio, and registry gates.
                  </div>
                ) : null}
                <label className="block text-xs text-zinc-500">
                  tool family
                  <select
                    aria-label="instrument"
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-200 disabled:text-zinc-600"
                    disabled={locked || lockInstrumentType || isRebuildMode}
                    value={instrumentType}
                    onChange={(event) => {
                      const nextType = event.target.value;
                      setInstrumentType(nextType);
                      setReferenceAgent(getDefaultReferenceAgent(nextType));
                    }}
                  >
                    <option value="sample">sample</option>
                    <option value="synth">synth</option>
                    <option value="hybrid">hybrid</option>
                    <option value="effect">effect</option>
                  </select>
                </label>
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  {isRebuildMode
                    ? "The rebuild path does not create a new tool or change the slug."
                    : "The builder copies the closest reference tool, writes files, then runs the safety gates before it registers anything."}
                </p>
              </section>
            </div>

            <div className="mt-4 grid gap-3 rounded-sm border border-zinc-800 bg-zinc-950/95 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                  step 3
                </p>
                <p className="mt-1 text-sm text-zinc-100">
                  {isRebuildMode ? "Rebuild and verify" : "Build and verify"}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Keep this page open while the agent writes, checks, and registers the
                  generated tool.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button
                  type="button"
                  disabled={locked || description.length < 8}
                  onClick={() => void buildTool()}
                >
                  {isBuilding ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Hammer className="size-4" />
                  )}
                  {isRebuildMode ? "rebuild" : "build"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!locked}
                  onClick={stopBuild}
                >
                  <Square className="size-4" />
                  stop
                </Button>
              </div>
            </div>

            <details className="mt-4 rounded-sm border border-zinc-800 bg-zinc-950/95 p-3">
              <summary className="cursor-pointer text-xs uppercase tracking-[0.16em] text-zinc-500">
                advanced naming and budget
              </summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="block text-xs text-zinc-500">
                  name
                  <input
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-200 disabled:text-zinc-600"
                    disabled={locked}
                    value={name}
                    onChange={(event) => updateName(event.target.value)}
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  slug
                  <input
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-200 disabled:text-zinc-600"
                    disabled={locked}
                    value={slug}
                    onChange={(event) => updateSlug(event.target.value)}
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  reference
                  <select
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-200 disabled:text-zinc-600"
                    disabled={locked}
                    value={referenceAgent}
                    onChange={(event) => setReferenceAgent(event.target.value)}
                  >
                    <option value="intelligence-sampler">intelligence-sampler</option>
                    <option value="grid-sampler">grid-sampler</option>
                    <option value="drum-machine">drum-machine</option>
                    <option value="splice-lab">splice-lab</option>
                    <option value="evolving-fm-synth">evolving-fm-synth</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-500">
                  token budget
                  <input
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-zinc-200 disabled:text-zinc-600"
                    disabled={locked}
                    max={250000}
                    min={1000}
                    step={1000}
                    type="number"
                    value={tokenBudget}
                    onChange={(event) => setTokenBudget(Number(event.target.value))}
                  />
                </label>
              </div>
            </details>
          </div>

          {error ? (
            <div className="mt-4 border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-100">
              {error}
            </div>
          ) : null}

          <details className="mt-4 rounded-sm border border-zinc-800 bg-zinc-950 p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
              <Code2 className="size-4" />
              agent transcript
            </summary>
            <section className="mt-3 border-t border-zinc-900">
              {stream.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-600">
                  build stream will appear here
                </div>
              ) : (
                <div className="divide-y divide-zinc-900">
                  {stream.map((line) => (
                    <div
                      key={line.id}
                      className="grid gap-3 py-3 text-xs md:grid-cols-[120px_1fr]"
                    >
                      <div className="text-zinc-500">{line.label}</div>
                      <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-zinc-300">
                        {line.body}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </details>
        </section>

        <aside className="grid content-start gap-4">
          <BuilderRunMonitor progress={progress} />
          {builderPlan ? <SpecializedBuilderProfilePanel plan={builderPlan} /> : null}
          {generatedAudit ? <GeneratedToolAuditPanel audit={generatedAudit} /> : null}
          <details className="rounded-sm border border-zinc-800 bg-zinc-950 p-3">
            <summary className="cursor-pointer text-xs uppercase tracking-[0.16em] text-zinc-500">
              advanced build details
            </summary>
            <div className="mt-3 grid gap-3">
              <SidePanel title="decisions" items={decisions} empty="no decisions yet" />
              <SidePanel
                title="alternatives not taken"
                items={alternatives}
                empty="no alternatives yet"
              />
              <SidePanel
                title="breach"
                items={breaches}
                empty="no sandbox breach"
                tone="danger"
              />
              <SidePanel title="files produced" items={files} empty="no files yet" />
            </div>
          </details>
        </aside>
      </div>
    </main>
  );
}

function SpecializedBuilderProfilePanel({ plan }: { plan: BuilderProfilePlan }) {
  return (
    <section
      aria-label="specialized builder profile"
      className="border border-zinc-800 bg-zinc-950 p-3"
    >
      <div className="mb-3">
        <h2 className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          specialized L2 profile
        </h2>
        <p className="mt-1 text-xs leading-5 text-zinc-300">{plan.summary}</p>
      </div>

      <dl className="grid gap-2 border-y border-zinc-900 py-3 text-xs">
        <PlanDatum label="target" value={`${plan.target.instrumentType} / ${plan.target.document}`} />
        <PlanDatum label="workflow" value={plan.target.workflow} />
        <PlanDatum label="template" value={plan.templateKit} />
        <PlanDatum label="reference" value={plan.referenceAgent} />
      </dl>

      <div className="mt-3 text-xs uppercase tracking-[0.14em] text-zinc-600">
        verification gates
      </div>
      <ol className="mt-2 grid list-decimal gap-2 pl-4 text-xs leading-5 text-zinc-400">
        {plan.verificationGates.slice(0, 4).map((gate) => (
          <li key={gate}>{gate}</li>
        ))}
      </ol>
    </section>
  );
}

function PlanDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="truncate font-mono text-zinc-300">{value}</dd>
    </div>
  );
}

function BuilderRunMonitor({ progress }: { progress: BuilderProgressSummary }) {
  const currentStage =
    progress.stages.find((stage) => stage.status === "active") ??
    progress.stages.find((stage) => stage.status === "pending") ??
    progress.stages[progress.stages.length - 1];

  return (
    <section
      aria-label="builder run monitor"
      className="border border-zinc-800 bg-zinc-950 p-3"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            builder run monitor
          </h2>
          <p className="mt-1 text-xs text-zinc-300">{progress.nextAction}</p>
        </div>
        <div className={`shrink-0 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${runStatusClass(progress.status)}`}>
          {progress.status}
        </div>
      </div>

      <div className="mb-3 rounded-sm border border-zinc-900 bg-black/20 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-zinc-500">
            {progress.completedCount}/{progress.totalCount} gates
          </span>
          <span className="text-zinc-400">{progress.activeLabel}</span>
        </div>
        {currentStage ? (
          <div className="mt-3 grid grid-cols-[18px_1fr] gap-2">
            <StageStatusIcon status={currentStage.status} />
            <div>
              <div className="text-xs text-zinc-100">{currentStage.label}</div>
              <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">
                {currentStage.description}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <details className="rounded-sm border border-zinc-900 bg-zinc-950 p-2">
        <summary className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-zinc-600">
          all safety gates
        </summary>
        <ol className="mt-3 grid gap-2">
          {progress.stages.map((stage) => (
            <li
              className={`grid grid-cols-[18px_1fr_auto] gap-2 rounded-sm border p-2 ${stageRowClass(stage.status)}`}
              key={stage.id}
            >
              <StageStatusIcon status={stage.status} />
              <div className="min-w-0">
                <div className="text-xs text-zinc-100">{stage.label}</div>
                <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">
                  {stage.description}
                </p>
                {stage.evidence ? (
                  <p className="mt-1 truncate font-mono text-[11px] text-zinc-400">
                    {stage.evidence}
                  </p>
                ) : null}
              </div>
              <span className="self-start text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                {stage.status}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function GeneratedToolAuditPanel({ audit }: { audit: GeneratedToolAudit }) {
  return (
    <section
      aria-label="generated tool audit"
      className="border border-zinc-800 bg-zinc-950 p-3"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            generated tool audit
          </h2>
          <p className="mt-1 text-xs leading-5 text-zinc-300">{audit.summary}</p>
        </div>
        <span className={getGeneratedAuditStatusClassName(audit.status)}>
          {audit.status}
        </span>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-3">
        <AuditMetric label="generated" value={String(audit.generatedCount)} />
        <AuditMetric label="ready" value={String(audit.readyCount)} />
        <AuditMetric label="issues" value={String(audit.issues.length)} />
      </div>

      {audit.entries.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {audit.entries.slice(0, 5).map((entry) => (
            <div className="rounded-sm border border-zinc-900 bg-black/20 p-2 text-xs" key={entry.slug}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-zinc-200">{entry.slug}</span>
                <span className="shrink-0 text-[10px] uppercase text-zinc-500">
                  {entry.instrumentType} / {entry.document}
                </span>
              </div>
              <div className="mt-1 truncate text-zinc-600">{entry.route}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-zinc-600">
          Build and register a generated tool to populate .audit/generated-tools.json.
        </p>
      )}

      {audit.issues.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {audit.issues.slice(0, 4).map((issue) => (
            <div
              className={`rounded-sm border bg-black/20 p-2 text-xs ${getGeneratedAuditIssueClassName(
                issue.severity,
              )}`}
              key={issue.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-zinc-300">
                  {issue.slug ?? issue.id}
                </span>
                <span className="shrink-0 uppercase tracking-[0.12em]">
                  {issue.severity}
                </span>
              </div>
              <div className="mt-1 leading-5 text-zinc-500">{issue.detail}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function AuditMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-zinc-900 bg-black/20 p-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">
        {label}
      </div>
      <div className="mt-1 text-zinc-200">{value}</div>
    </div>
  );
}

function StageStatusIcon({ status }: { status: BuilderProgressStatus }) {
  if (status === "passed") {
    return <CheckCircle2 className="mt-0.5 size-4 text-emerald-300" aria-hidden="true" />;
  }

  if (status === "failed" || status === "blocked") {
    return <AlertTriangle className="mt-0.5 size-4 text-red-300" aria-hidden="true" />;
  }

  if (status === "active") {
    return <Activity className="mt-0.5 size-4 text-zinc-100" aria-hidden="true" />;
  }

  return <Circle className="mt-0.5 size-4 text-zinc-700" aria-hidden="true" />;
}

function getGeneratedAuditStatusClassName(status: GeneratedToolAudit["status"]) {
  const base = "shrink-0 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-[0.14em]";
  if (status === "ready") {
    return `${base} border-emerald-400/40 bg-emerald-400/10 text-emerald-100`;
  }

  if (status === "attention") {
    return `${base} border-amber-400/40 bg-amber-400/10 text-amber-100`;
  }

  return `${base} border-zinc-800 bg-zinc-900 text-zinc-500`;
}

function getGeneratedAuditIssueClassName(
  severity: GeneratedToolAudit["issues"][number]["severity"],
) {
  if (severity === "error") {
    return "border-red-900 text-red-300";
  }

  if (severity === "warning") {
    return "border-amber-900 text-amber-200";
  }

  return "border-zinc-800 text-zinc-400";
}

function runStatusClass(status: BuilderProgressSummary["status"]) {
  if (status === "complete") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "failed" || status === "blocked") {
    return "border-red-400/40 bg-red-400/10 text-red-100";
  }

  if (status === "running") {
    return "border-zinc-400/40 bg-zinc-100/10 text-zinc-100";
  }

  return "border-zinc-800 bg-zinc-900 text-zinc-500";
}

function stageRowClass(status: BuilderProgressStage["status"]) {
  if (status === "passed") {
    return "border-emerald-400/20 bg-emerald-400/5";
  }

  if (status === "failed" || status === "blocked") {
    return "border-red-400/30 bg-red-400/10";
  }

  if (status === "active") {
    return "border-zinc-500 bg-zinc-900";
  }

  return "border-zinc-900 bg-zinc-950";
}

function getDefaultReferenceAgent(instrumentType: string) {
  if (instrumentType === "synth") {
    return "evolving-fm-synth";
  }

  if (instrumentType === "effect" || instrumentType === "hybrid") {
    return "splice-lab";
  }

  return "intelligence-sampler";
}

function createBuildToolSpecialization(
  plan: BuilderProfilePlan,
): BuildToolSpecialization {
  return {
    domain: plan.domain,
    builderSlug: plan.builderManifest.slug,
    targetInstrumentType: plan.target.instrumentType,
    targetDocument: plan.target.document,
    targetWorkflow: plan.target.workflow,
    templateKit: plan.templateKit,
    referenceAgent: plan.referenceAgent,
    constraints: plan.constraints,
    verificationGates: plan.verificationGates,
  };
}

function SidePanel({
  title,
  items,
  empty,
  tone = "default",
}: {
  title: string;
  items: string[];
  empty: string;
  tone?: "default" | "danger";
}) {
  return (
    <section className="border border-zinc-800 bg-zinc-950 p-3">
      <h2 className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-500">{title}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-700">{empty}</p>
      ) : (
        <div className="grid gap-2">
          {items.map((item, index) => (
            <div
              className={tone === "danger" ? "text-xs text-red-200" : "text-xs text-zinc-300"}
              key={`${item}-${index}`}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
