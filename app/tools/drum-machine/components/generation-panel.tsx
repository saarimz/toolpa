"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, GitCompare, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { readGenerateStream } from "@/lib/ai/client-stream";
import type { GenerateStreamChunk } from "@/lib/ai/contracts";
import { PatternSchema } from "@/lib/pattern/schema";
import { useDrumMachineStore } from "@/app/tools/drum-machine/store";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { usePromptParamState } from "@/lib/tools/use-prompt-param";

export function DrumGenerationPanel() {
  const abortRef = useRef<AbortController | null>(null);
  const [vibe, setVibe] = usePromptParamState("skittery, sparse kick, polyrhythmic hats");
  const [streamText, setStreamText] = useState("");
  const [promptText, setPromptText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAlternatives, setIsGeneratingAlternatives] = useState(false);
  const [liveRegeneration, setLiveRegeneration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pattern = useDrumMachineStore((state) => state.pattern);
  const sampleId = useDrumMachineStore((state) => state.sampleId);
  const sampleName = useDrumMachineStore((state) => state.sampleName);
  const sampleRole = useDrumMachineStore((state) => state.sampleRole);
  const isPlaying = useDrumMachineStore((state) => state.isPlaying);
  const ghostPatterns = useDrumMachineStore((state) => state.ghostPatterns);
  const setPattern = useDrumMachineStore((state) => state.setPattern);
  const setGhostPatterns = useDrumMachineStore((state) => state.setGhostPatterns);
  const musicalContext = useGlobalMusicContextStore((state) => state.context);

  async function generate(prompt = vibe, collectOnly = false) {
    const controller = new AbortController();
    if (!collectOnly) {
      abortRef.current?.abort();
      abortRef.current = controller;
      setIsGenerating(true);
      setStreamText("");
      setPromptText("");
    }
    setError(null);
    let finalPattern: unknown = null;

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolSlug: "drum-machine",
          mode: "polyrhythm",
          prompt,
          context: {
            pattern,
            sampleId,
            sampleName,
            sampleRole,
            bpm: pattern.bpm,
            swing: pattern.swing,
            musicalContext,
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
    try {
      const results = await Promise.all(
        Array.from({ length: 3 }, (_, index) =>
          generate(`${vibe}\nCandidate ${index + 1}: make a distinct drum-machine choice.`, true),
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

    if (chunk.type === "error") {
      setError(chunk.message);
    }
  }

  useEffect(() => {
    if (!liveRegeneration || !isPlaying || isGenerating) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void generate(`${vibe}\nLive regeneration: mutate while preserving the groove identity.`);
    }, 8000);
    return () => window.clearTimeout(timeout);
    // Live regeneration intentionally samples the latest pattern at tick time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, isPlaying, liveRegeneration]);

  return (
    <section className="grid grid-cols-1 border-b border-zinc-800 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="relative overflow-hidden border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
        {isGenerating ? (
          <LlmGeneratingOverlay
            detail="Prompting the LLM for a drum pattern while playback and abort stay available."
            label="generating drum pattern"
          />
        ) : isGeneratingAlternatives ? (
          <LlmGeneratingOverlay
            detail="Prompting the LLM for three distinct drum-machine alternatives."
            label="generating alternatives"
          />
        ) : null}

        <div aria-live="polite" className="mb-3 border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
          {isGenerating
            ? "generating; playback and abort remain available"
            : isGeneratingAlternatives
              ? "generating three alternatives"
              : "idle; fresh, mutate, fills, and polyrhythm prompts are supported"}
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
          <Button variant="solid" disabled={isGenerating} onClick={() => void generate()}>
            <Sparkles className="size-4" />
            {isGenerating ? "generating" : "generate"}
          </Button>
          <Button disabled={isGenerating || isGeneratingAlternatives} onClick={() => void generateAlternatives()}>
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
          <Button onClick={() => void navigator.clipboard.writeText(JSON.stringify(pattern, null, 2))}>
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
          {streamText || "pattern json / rationale will appear here"}
        </pre>
      </div>
    </section>
  );
}
