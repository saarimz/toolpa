"use client";

import { useRef, useState } from "react";
import { Hammer, Loader2, Square, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { readNdjsonStream } from "@/lib/ai/client-stream";
import type { BuilderStreamChunk } from "@/lib/agents/builder-contracts";

type StreamLine = {
  id: number;
  label: string;
  body: string;
};

export function ToolBuilderClient() {
  const abortRef = useRef<AbortController | null>(null);
  const nextIdRef = useRef(0);
  const [description, setDescription] = useState(
    "a tool that takes a vocal sample and stutters it with probabilistic repeats",
  );
  const [slug, setSlug] = useState("vocal-stutter");
  const [name, setName] = useState("Vocal Stutter");
  const [instrumentType, setInstrumentType] = useState("sample");
  const [referenceAgent, setReferenceAgent] = useState("intelligence-sampler");
  const [tokenBudget, setTokenBudget] = useState(50000);
  const [isBuilding, setIsBuilding] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [stream, setStream] = useState<StreamLine[]>([]);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [breaches, setBreaches] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function buildTool() {
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
    setError(null);

    try {
      const response = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          slug: slug || undefined,
          name: name || undefined,
          instrumentType,
          referenceAgent,
          tokenBudget,
          register: true,
        }),
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

  function handleChunk(chunk: BuilderStreamChunk) {
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

    setError(chunk.message);
    pushStream("error", chunk.message);
  }

  function pushStream(label: string, body: string) {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setStream((current) => [{ id, label, body }, ...current].slice(0, 80));
  }

  const locked = isBuilding;

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-6 text-zinc-100">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
            <div>
              <p className="text-xs text-zinc-500">/build</p>
              <h1 className="mt-1 text-xl">tool-builder <span className="text-zinc-600">L2 driven</span></h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              {isBuilding ? <Loader2 className="size-4 animate-spin text-cyan-300" /> : <Wrench className="size-4" />}
              <span>{phase}</span>
            </div>
          </header>

          <div className="relative overflow-hidden">
            {isBuilding ? (
              <LlmGeneratingOverlay
                detail="Prompting the builder agent and streaming tool files into the sandbox."
                label="building tool"
                tone="fuchsia"
              />
            ) : null}

            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <label className="block text-xs text-zinc-500">
                description
                <textarea
                  className="mt-2 h-32 w-full resize-none rounded-sm border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none focus:border-cyan-300 disabled:cursor-not-allowed disabled:text-zinc-600"
                  disabled={locked}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div className="grid gap-3">
                <label className="block text-xs text-zinc-500">
                  instrument
                  <select
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-300 disabled:text-zinc-600"
                    disabled={locked}
                    value={instrumentType}
                    onChange={(event) => {
                      const nextType = event.target.value;
                      setInstrumentType(nextType);
                      if (nextType === "synth") {
                        setReferenceAgent("evolving-fm-synth");
                      } else if (nextType === "effect" || nextType === "hybrid") {
                        setReferenceAgent("splice-lab");
                      } else {
                        setReferenceAgent("intelligence-sampler");
                      }
                    }}
                  >
                    <option value="sample">sample</option>
                    <option value="synth">synth</option>
                    <option value="hybrid">hybrid</option>
                    <option value="effect">effect</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-500">
                  name
                  <input
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-300 disabled:text-zinc-600"
                    disabled={locked}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  slug
                  <input
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-300 disabled:text-zinc-600"
                    disabled={locked}
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                  />
                </label>
                <label className="block text-xs text-zinc-500">
                  reference
                  <select
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-300 disabled:text-zinc-600"
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
                    className="mt-2 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-300 disabled:text-zinc-600"
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
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={locked || description.length < 8}
                onClick={() => void buildTool()}
              >
                {isBuilding ? <Loader2 className="size-4 animate-spin" /> : <Hammer className="size-4" />}
                build
              </Button>
              <Button type="button" variant="ghost" disabled={!locked} onClick={stopBuild}>
                <Square className="size-4" />
                stop stream
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-4 border border-red-400/40 bg-red-400/10 p-3 text-xs text-red-100">
              {error}
            </div>
          ) : null}

          <section className="mt-5 border-y border-zinc-800">
            {stream.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-600">
                build stream will appear here
              </div>
            ) : (
              <div className="divide-y divide-zinc-900">
                {stream.map((line) => (
                  <div key={line.id} className="grid gap-3 py-3 text-xs md:grid-cols-[120px_1fr]">
                    <div className="text-zinc-500">{line.label}</div>
                    <pre className="min-w-0 whitespace-pre-wrap break-words font-mono text-zinc-300">
                      {line.body}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>

        <aside className="grid content-start gap-4">
          <SidePanel title="decisions" items={decisions} empty="no decisions yet" />
          <SidePanel title="alternatives not taken" items={alternatives} empty="no alternatives yet" />
          <SidePanel title="breach" items={breaches} empty="no sandbox breach" tone="danger" />
          <SidePanel title="files produced" items={files} empty="no files yet" />
        </aside>
      </div>
    </main>
  );
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
