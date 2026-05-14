"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, GitCompare, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { PromptFirstSection } from "@/components/prompt-first-section";
import type { GenerateStreamChunk } from "@/lib/ai/contracts";
import { readGenerateStream } from "@/lib/ai/client-stream";
import { PatternSchema } from "@/lib/pattern/schema";
import { useGridSamplerStore } from "@/app/tools/grid-sampler/store";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { usePromptParamState } from "@/lib/tools/use-prompt-param";

export function GridGenerationPanel() {
  const abortRef = useRef<AbortController | null>(null);
  const [vibe, setVibe] = usePromptParamState(
    "dense grid with diagonal stutters, pad swells, and sudden gaps",
  );
  const [streamText, setStreamText] = useState("");
  const [promptText, setPromptText] = useState("");
  const [toolCalls, setToolCalls] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAlternatives, setIsGeneratingAlternatives] = useState(false);
  const [liveRegeneration, setLiveRegeneration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceSampleId = useGridSamplerStore((state) => state.sourceSampleId);
  const sourceSampleName = useGridSamplerStore((state) => state.sourceSampleName);
  const sourceSampleRole = useGridSamplerStore((state) => state.sourceSampleRole);
  const sliceCount = useGridSamplerStore((state) => state.sliceCount);
  const traversal = useGridSamplerStore((state) => state.traversal);
  const agentMode = useGridSamplerStore((state) => state.agentMode);
  const isPlaying = useGridSamplerStore((state) => state.isPlaying);
  const ghostPatterns = useGridSamplerStore((state) => state.ghostPatterns);
  const setAgentMode = useGridSamplerStore((state) => state.setAgentMode);
  const setPattern = useGridSamplerStore((state) => state.setPattern);
  const setGhostPatterns = useGridSamplerStore((state) => state.setGhostPatterns);
  const toPattern = useGridSamplerStore((state) => state.toPattern);
  const musicalContext = useGlobalMusicContextStore((state) => state.context);

  async function generate(prompt = vibe, collectOnly = false) {
    const controller = new AbortController();
    if (!collectOnly) {
      abortRef.current?.abort();
      abortRef.current = controller;
    }
    setIsGenerating(!collectOnly);
    setError(null);
    if (!collectOnly) {
      setStreamText("");
      setPromptText("");
      setToolCalls([]);
    }

    let finalPattern: unknown = null;

    try {
      const pattern = toPattern();
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolSlug: "grid-sampler",
          mode: "fresh",
          agentMode,
          prompt,
          context: {
            pattern,
            sampleId: sourceSampleId,
            sampleName: sourceSampleName,
            sampleRole: sourceSampleRole,
            bpm: pattern.bpm,
            swing: pattern.swing,
            musicalContext,
            sliceCount,
            traversal,
          },
        }),
        signal: collectOnly ? undefined : controller.signal,
      });

      await readGenerateStream(response, (chunk) => {
        if (collectOnly) {
          if (chunk.type === "final") {
            finalPattern = chunk.pattern;
          }
          return;
        }

        handleChunk(chunk);
        if (chunk.type === "final") {
          finalPattern = chunk.pattern;
        }
      });
    } catch (unknownError) {
      if (collectOnly || !controller.signal.aborted) {
        setError(
          unknownError instanceof Error ? unknownError.message : "Generation failed",
        );
      }
    } finally {
      setIsGenerating(false);
    }

    return finalPattern;
  }

  async function generateAlternatives() {
    setIsGeneratingAlternatives(true);
    setError(null);

    try {
      const results = await Promise.all(
        Array.from({ length: 3 }, (_, index) =>
          generate(`${vibe}\nCandidate ${index + 1}: choose a different route.`, true),
        ),
      );
      const parsed = results
        .map((candidate) => PatternSchema.safeParse(candidate))
        .filter((candidate) => candidate.success)
        .map((candidate) => candidate.data);

      if (parsed[0]) {
        setPattern(parsed[0]);
        setGhostPatterns(parsed.slice(1));
      }
    } finally {
      setIsGeneratingAlternatives(false);
    }
  }

  function handleChunk(chunk: GenerateStreamChunk) {
    if (chunk.type === "prompt") {
      setPromptText(chunk.prompt);
      return;
    }

    if (chunk.type === "tool-call") {
      setToolCalls((current) => [
        `${chunk.name}: ${JSON.stringify(chunk.input)} -> ${JSON.stringify(chunk.result)}`,
        ...current,
      ]);
      return;
    }

    if (chunk.type === "partial") {
      setStreamText((current) => `${JSON.stringify(chunk.pattern, null, 2)}\n${current}`);
      const parsed = PatternSchema.safeParse(chunk.pattern);
      if (parsed.success) {
        setPattern(parsed.data);
      }
      return;
    }

    if (chunk.type === "final") {
      const parsed = PatternSchema.safeParse(chunk.pattern);
      if (parsed.success) {
        setPattern(parsed.data);
      }
      setStreamText(JSON.stringify(chunk.pattern, null, 2));
      return;
    }

    setError(chunk.message);
  }

  useEffect(() => {
    if (!liveRegeneration || !isPlaying || isGenerating) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void generate(`${vibe}\nLive regeneration: mutate without stopping playback.`);
    }, 8000);

    return () => window.clearTimeout(timeout);
    // Live regeneration intentionally samples the latest tool state at tick time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, isPlaying, liveRegeneration]);

  return (
    <PromptFirstSection className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="relative overflow-hidden border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
        {isGenerating ? (
          <LlmGeneratingOverlay
            detail="Prompting the LLM for a new grid pattern while playback and abort stay available."
            label="generating grid pattern"
          />
        ) : isGeneratingAlternatives ? (
          <LlmGeneratingOverlay
            detail="Prompting the LLM for three different grid routes."
            label="generating alternatives"
          />
        ) : null}

        <div aria-live="polite" className="mb-3 border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
          {isGenerating
            ? "generating; playback and abort remain available"
            : isGeneratingAlternatives
              ? "generating three alternatives"
              : "idle; structured and tool-calling agent modes available"}
        </div>
        <label className="block text-xs text-zinc-500">
          generation prompt
          <textarea
            className="mt-2 h-24 w-full resize-none rounded-sm border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-100 outline-none focus:border-zinc-200 disabled:text-zinc-600"
            value={vibe}
            disabled={isGenerating || isGeneratingAlternatives}
            onChange={(event) => setVibe(event.target.value)}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="inline-flex h-9 items-center gap-2 border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-300">
            mode
            <select
              value={agentMode}
              onChange={(event) =>
                setAgentMode(event.target.value as "structured" | "tool-calling")
              }
              className="bg-zinc-950 text-zinc-100"
            >
              <option value="structured">structured</option>
              <option value="tool-calling">tool-calling</option>
            </select>
          </label>
          <Button
            variant="solid"
            disabled={isGenerating || isGeneratingAlternatives}
            onClick={() => void generate()}
          >
            <Sparkles className="size-4" />
            {isGenerating ? "generating" : "generate"}
          </Button>
          <Button
            disabled={isGenerating || isGeneratingAlternatives}
            onClick={() => void generateAlternatives()}
          >
            <GitCompare className="size-4" />
            alternatives
          </Button>
          <Button
            disabled={!isGenerating}
            onClick={() => {
              abortRef.current?.abort();
              setIsGenerating(false);
            }}
          >
            <X className="size-4" />
            abort
          </Button>
          <Button onClick={() => void navigator.clipboard.writeText(JSON.stringify(toPattern(), null, 2))}>
            <Copy className="size-4" />
            copy json
          </Button>
          <label className="inline-flex h-9 items-center gap-2 border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={liveRegeneration}
              onChange={(event) => setLiveRegeneration(event.target.checked)}
              className="accent-zinc-200"
            />
            live regen
          </label>
        </div>
        {ghostPatterns.length > 0 ? (
          <div className="mt-3 border border-dashed border-zinc-700 p-3 text-xs text-zinc-500">
            <div className="mb-2 text-zinc-400">ghost alternatives</div>
            {ghostPatterns.map((ghost) => (
              <button
                key={ghost.id}
                type="button"
                className="mr-2 mt-2 border border-zinc-800 px-2 py-1 text-zinc-500 hover:border-zinc-200 hover:text-zinc-100"
                onClick={() => setPattern(ghost)}
              >
                {ghost.name}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
      </div>
      <div className="grid max-h-80 grid-rows-2 overflow-hidden p-4">
        <pre className="overflow-auto border border-zinc-800 bg-black p-3 text-[11px] leading-5 text-zinc-500">
          {promptText || "prompt stream will appear here"}
        </pre>
        <pre className="mt-2 overflow-auto border border-zinc-800 bg-black p-3 text-[11px] leading-5 text-zinc-100">
          {[
            toolCalls.length > 0 ? `tool calls\n${toolCalls.join("\n")}` : "",
            streamText || "pattern json / rationale will appear here",
          ]
            .filter(Boolean)
            .join("\n\n")}
        </pre>
      </div>
    </PromptFirstSection>
  );
}
