"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, GitCompare, RefreshCw, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { PromptFirstSection } from "@/components/prompt-first-section";
import type { GenerateStreamChunk } from "@/lib/ai/contracts";
import { readGenerateStream } from "@/lib/ai/client-stream";
import { PatternSchema } from "@/lib/pattern/schema";
import { useIntelligenceSamplerStore } from "@/app/tools/intelligence-sampler/store";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";
import { usePromptParamState } from "@/lib/tools/use-prompt-param";

export function GenerationPanel() {
  const abortRef = useRef<AbortController | null>(null);
  const [vibe, setVibe] = usePromptParamState(
    "chopped source pattern with sparse anchors and off-grid texture",
  );
  const [streamText, setStreamText] = useState("");
  const [promptText, setPromptText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAlternatives, setIsGeneratingAlternatives] = useState(false);
  const [liveRegeneration, setLiveRegeneration] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [toolCalls, setToolCalls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const pattern = useIntelligenceSamplerStore((state) => state.pattern);
  const ghostPatterns = useIntelligenceSamplerStore((state) => state.ghostPatterns);
  const isPlaying = useIntelligenceSamplerStore((state) => state.isPlaying);
  const sampleId = useIntelligenceSamplerStore((state) => state.sampleId);
  const sampleName = useIntelligenceSamplerStore((state) => state.sampleName);
  const sampleRole = useIntelligenceSamplerStore((state) => state.sampleRole);
  const setPattern = useIntelligenceSamplerStore((state) => state.setPattern);
  const setGhostPatterns = useIntelligenceSamplerStore((state) => state.setGhostPatterns);
  const musicalContext = useGlobalMusicContextStore((state) => state.context);

  const refreshSuggestions = useCallback(async () => {
    setIsSuggesting(true);
    setSuggestionError(null);

    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolSlug: "intelligence-sampler",
          prompt: vibe,
          context: {
            sampleId,
            sampleName,
            sampleRole,
            bpm: pattern.bpm,
            swing: pattern.swing,
            musicalContext,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Suggestion request failed (${response.status})`);
      }

      const data = (await response.json()) as { suggestions?: unknown };
      if (
        !Array.isArray(data.suggestions) ||
        data.suggestions.some((suggestion) => typeof suggestion !== "string")
      ) {
        throw new Error("Suggestion response was malformed");
      }

      setSuggestions(data.suggestions.slice(0, 3));
    } catch (unknownError) {
      setSuggestionError(
        unknownError instanceof Error
          ? unknownError.message
          : "Could not generate suggestions",
      );
    } finally {
      setIsSuggesting(false);
    }
  }, [musicalContext, pattern.bpm, pattern.swing, sampleId, sampleName, sampleRole, vibe]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshSuggestions();
    }, 0);

    return () => window.clearTimeout(timeout);
    // Suggestions are generated once from the initial prompt; refresh is explicit after edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setError(null);
    setStreamText("");
    setPromptText("");
    setToolCalls([]);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolSlug: "intelligence-sampler",
          mode: "fresh",
          prompt: vibe,
          context: {
            pattern,
            sampleId,
            sampleName,
            sampleRole,
            bpm: pattern.bpm,
            swing: pattern.swing,
          },
        }),
        signal: controller.signal,
      });

      await readGenerateStream(response, handleChunk);
    } catch (unknownError) {
      if (!controller.signal.aborted) {
        setError(
          unknownError instanceof Error ? unknownError.message : "Generation failed",
        );
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateAlternatives() {
    setIsGeneratingAlternatives(true);
    setError(null);
    const accepted: unknown[] = [];

    try {
      for (let index = 0; index < 3; index += 1) {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolSlug: "intelligence-sampler",
            mode: "fresh",
            prompt: `${vibe}\nCandidate ${index + 1}: make a meaningfully different choice.`,
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
        });

        await readGenerateStream(response, (chunk) => {
          if (chunk.type === "final") {
            accepted.push(chunk.pattern);
          }
        });
      }

      const parsed = accepted
        .map((candidate) => PatternSchema.safeParse(candidate))
        .filter((candidate) => candidate.success)
        .map((candidate) => candidate.data);

      if (parsed[0]) {
        setPattern(parsed[0]);
        setGhostPatterns(parsed.slice(1));
      }
    } catch (unknownError) {
      setError(
        unknownError instanceof Error ? unknownError.message : "Alternatives failed",
      );
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

    if (chunk.type === "tool-call") {
      setToolCalls((current) => [
        `${chunk.name}: ${JSON.stringify(chunk.input)} -> ${JSON.stringify(chunk.result)}`,
        ...current,
      ]);
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

  const promptLocked = isGenerating || isGeneratingAlternatives;
  const suggestionControlsLocked = isGenerating || isGeneratingAlternatives || isSuggesting;

  useEffect(() => {
    if (!liveRegeneration || !isPlaying || isGenerating) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void generate();
    }, 8000);

    return () => window.clearTimeout(timeout);
    // Live regeneration intentionally uses the latest prompt/pattern snapshot on each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, isPlaying, liveRegeneration]);

  return (
    <PromptFirstSection className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="relative overflow-hidden border-b border-zinc-800 p-4 lg:border-b-0 lg:border-r">
        {isGenerating ? (
          <LlmGeneratingOverlay
            detail="abort, copy JSON, play current grid stay available; prompt edits, suggestion chips, new generate are locked."
            label="generating pattern"
          />
        ) : isGeneratingAlternatives ? (
          <LlmGeneratingOverlay
            detail="Prompting the LLM for three distinct pattern alternatives."
            label="generating alternatives"
          />
        ) : null}

        <GenerationStatus
          isGenerating={isGenerating}
          isSuggesting={isSuggesting}
          hasPromptStream={promptText.length > 0}
          hasPatternStream={streamText.length > 0}
        />
        <label className="block text-xs text-zinc-500">
          generation prompt
          <textarea
            className="mt-2 h-24 w-full resize-none rounded-sm border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-100 outline-none focus:border-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
            value={vibe}
            disabled={promptLocked}
            onChange={(event) => setVibe(event.target.value)}
          />
        </label>
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">suggestions</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
              disabled={suggestionControlsLocked}
              onClick={() => void refreshSuggestions()}
            >
              <RefreshCw className={isSuggesting ? "size-3 animate-spin" : "size-3"} />
              {isGenerating ? "locked" : isSuggesting ? "thinking" : "refresh"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.length === 0 && isSuggesting ? (
              <span className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-600">
                generating
              </span>
            ) : null}
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="max-w-full rounded-full border border-zinc-200/30 bg-white/10 px-3 py-1.5 text-left text-xs leading-5 text-zinc-100 hover:border-zinc-200 hover:bg-white/20 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-950 disabled:text-zinc-600"
                disabled={suggestionControlsLocked}
                onClick={() => setVibe(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          {suggestionError ? (
            <p className="mt-2 text-xs text-red-300">{suggestionError}</p>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
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
            {isGeneratingAlternatives ? "making 3" : "alternatives"}
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
          <Button
            onClick={() => void navigator.clipboard.writeText(JSON.stringify(pattern, null, 2))}
          >
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
            streamText || "pattern json / visible rationale will appear here",
          ]
            .filter(Boolean)
            .join("\n\n")}
        </pre>
      </div>
    </PromptFirstSection>
  );
}

function GenerationStatus({
  isGenerating,
  isSuggesting,
  hasPromptStream,
  hasPatternStream,
}: {
  isGenerating: boolean;
  isSuggesting: boolean;
  hasPromptStream: boolean;
  hasPatternStream: boolean;
}) {
  if (isGenerating) {
    return (
      <div
        aria-live="polite"
        className="mb-3 border border-zinc-200/30 bg-white/10 p-3 text-xs"
      >
        <div className="mb-2 flex items-center gap-2 text-zinc-100">
          <span className="inline-block size-2 animate-pulse rounded-full bg-zinc-100" />
          generating pattern
        </div>
        <div className="grid gap-2 text-zinc-400 sm:grid-cols-3">
          <StatusLine label="working" value="abort, copy JSON, play current grid" />
          <StatusLine label="locked" value="prompt edits, suggestion chips, new generate" />
          <StatusLine
            label="stream"
            value={
              hasPatternStream
                ? "JSON is arriving"
                : hasPromptStream
                  ? "prompt sent, waiting for JSON"
                  : "opening model stream"
            }
          />
        </div>
      </div>
    );
  }

  if (isSuggesting) {
    return (
      <div
        aria-live="polite"
        className="mb-3 border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500"
      >
        generating prompt suggestions; pattern generation, copy JSON, and playback still work.
      </div>
    );
  }

  return (
    <div className="mb-3 border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-600">
      idle; prompt edits, suggestion refresh, generation, copy JSON, and playback are available.
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-zinc-600">{label}</div>
      <div className="mt-1 text-zinc-300">{value}</div>
    </div>
  );
}
