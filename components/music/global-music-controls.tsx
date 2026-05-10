"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Gauge,
  Music2,
  Search,
  SlidersHorizontal,
  Waves,
} from "lucide-react";

import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import {
  ChromaticTonics,
  GlobalBpmSchema,
  GlobalSwingSchema,
} from "@/lib/music/context";
import {
  ScaleAgentOutputSchema,
  type ScaleAgentOutput,
} from "@/lib/music/scale-agent.shared";
import {
  getScaleDefinitions,
  getScaleDefinition,
  resolveScaleKey,
  searchScaleKeys,
} from "@/lib/music/scale-catalog";
import {
  TempoAgentOutputSchema,
  type TempoAgentChoice,
  type TempoAgentOutput,
} from "@/lib/music/tempo-agent.shared";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

export function GlobalMusicControls() {
  const context = useGlobalMusicContextStore((state) => state.context);
  const hydrate = useGlobalMusicContextStore((state) => state.hydrate);
  const setBpm = useGlobalMusicContextStore((state) => state.setBpm);
  const setSwing = useGlobalMusicContextStore((state) => state.setSwing);
  const setScaleKey = useGlobalMusicContextStore((state) => state.setScaleKey);
  const selectedScale = getScaleDefinition(context.key.scaleId);
  const scaleDefinitions = getScaleDefinitions();
  const [tempoPrompt, setTempoPrompt] = useState("jungle breakbeat");
  const [tempoChoice, setTempoChoice] = useState<TempoAgentOutput | null>(null);
  const [tempoError, setTempoError] = useState<string | null>(null);
  const [isTempoSearching, setIsTempoSearching] = useState(false);
  const [query, setQuery] = useState(selectedScale?.name ?? "minor");
  const [agentChoice, setAgentChoice] = useState<ScaleAgentOutput | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [isAgentSearching, setIsAgentSearching] = useState(false);
  const results = useMemo(
    () =>
      searchScaleKeys(query || selectedScale?.name || "minor", {
        tonic: context.key.tonic,
        limit: 6,
      }),
    [context.key.tonic, query, selectedScale?.name],
  );

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  function chooseTonic(tonic: string) {
    const next = resolveScaleKey({ tonic, scaleId: context.key.scaleId });
    setScaleKey(next);
  }

  function chooseScale(scaleId: string) {
    const next = resolveScaleKey({ tonic: context.key.tonic, scaleId });
    setScaleKey(next);
  }

  function updateBpm(value: string) {
    const next = Number(value);
    const parsed = Number.isFinite(next)
      ? GlobalBpmSchema.safeParse(next)
      : { success: false as const };
    if (parsed.success) {
      setBpm(parsed.data);
    }
  }

  function updateSwing(value: string) {
    const next = Number(value);
    const parsed = Number.isFinite(next)
      ? GlobalSwingSchema.safeParse(next)
      : { success: false as const };
    if (parsed.success) {
      setSwing(parsed.data);
    }
  }

  function applyTempoChoice(choice: TempoAgentChoice) {
    setBpm(choice.bpm);
    setSwing(choice.swing);
  }

  async function runTempoSuggestion() {
    setIsTempoSearching(true);
    setTempoError(null);

    try {
      const response = await fetch("/api/music/tempo-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: tempoPrompt.trim() || `${context.bpm} bpm ${formatSwingPercent(context.swing)} swing`,
          context,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(body) ?? "Tempo suggestion failed");
      }
      const parsed = TempoAgentOutputSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("Tempo suggestion returned malformed data");
      }
      const result = parsed.data;

      applyTempoChoice(result.selected);
      setTempoChoice(result);
    } catch (unknownError) {
      setTempoError(
        unknownError instanceof Error ? unknownError.message : "Tempo suggestion failed",
      );
    } finally {
      setIsTempoSearching(false);
    }
  }

  async function runAgenticScaleSearch() {
    setIsAgentSearching(true);
    setAgentError(null);

    try {
      const response = await fetch("/api/music/scale-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: query.trim() || `${context.key.tonic} ${selectedScale?.name ?? "minor"}`,
          tonic: context.key.tonic,
          context,
          limit: 12,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(body) ?? "Scale search failed");
      }
      const parsed = ScaleAgentOutputSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("Scale search returned malformed data");
      }
      const result = parsed.data;

      const selected = resolveScaleKey({
        tonic: result.selected.tonic,
        scaleId: result.selected.scaleId,
      });
      setScaleKey(selected);
      setAgentChoice(result);
    } catch (unknownError) {
      setAgentError(
        unknownError instanceof Error ? unknownError.message : "Scale search failed",
      );
    } finally {
      setIsAgentSearching(false);
    }
  }

  return (
    <section className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <SlidersHorizontal className="size-4 text-cyan-300" />
          global music context
        </div>
        <div className="text-xs text-zinc-500">
          {context.bpm} bpm / {formatSwingPercent(context.swing)} swing /{" "}
          {context.key.tonic} {selectedScale?.name ?? context.key.scaleId}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="relative overflow-hidden border border-zinc-800 bg-zinc-950 p-4">
          {isTempoSearching ? (
            <LlmGeneratingOverlay
              detail="Prompting the LLM for genre-aware tempo and groove."
              label="generating BPM and swing"
            />
          ) : null}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
              <Gauge className="size-4 text-cyan-300" />
              bpm + swing
            </div>
            <div className="text-xs text-zinc-500">
              {context.bpm} bpm / {formatSwingPercent(context.swing)}
            </div>
          </div>

          <div className="space-y-1">
            <label
              className="flex items-center gap-1 text-xs text-zinc-500"
              htmlFor="global-tempo-prompt"
            >
              <Waves className="size-3" />
              genre prompt
            </label>
            <div className="flex gap-2">
              <input
                id="global-tempo-prompt"
                className="h-9 min-w-0 flex-1 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                value={tempoPrompt}
                onChange={(event) => setTempoPrompt(event.currentTarget.value)}
                placeholder="jungle, uk garage, lofi hip-hop, warehouse techno..."
              />
              <button
                type="button"
                className="h-9 shrink-0 rounded-sm border border-cyan-300/50 px-3 text-xs text-cyan-100 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-700"
                disabled={isTempoSearching}
                onClick={() => void runTempoSuggestion()}
              >
                {isTempoSearching ? "thinking" : "suggest"}
              </button>
            </div>
          </div>

          {tempoChoice ? (
            <div className="mt-3 border border-cyan-300/20 bg-cyan-300/5 p-2 text-xs text-zinc-300">
              <div className="text-cyan-100">
                {tempoChoice.selected.bpm} BPM /{" "}
                {formatSwingPercent(tempoChoice.selected.swing)} swing
              </div>
              <div className="mt-1 text-zinc-500">{tempoChoice.selected.rationale}</div>
              {tempoChoice.alternatives.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tempoChoice.alternatives.map((alternative) => (
                    <button
                      key={`${alternative.bpm}:${alternative.swing}`}
                      type="button"
                      className="rounded-sm border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-100"
                      title={alternative.rationale}
                      onClick={() => applyTempoChoice(alternative)}
                    >
                      {alternative.bpm} / {formatSwingPercent(alternative.swing)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {tempoError ? <div className="mt-2 text-xs text-red-300">{tempoError}</div> : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <Gauge className="size-3" />
                bpm
              </span>
              <input
                className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                type="number"
                min={40}
                max={260}
                value={context.bpm}
                onChange={(event) => updateBpm(event.currentTarget.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">swing</span>
              <input
                className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                type="number"
                min={0}
                max={0.5}
                step={0.01}
                value={context.swing}
                onChange={(event) => updateSwing(event.currentTarget.value)}
              />
            </label>
            <label className="col-span-2 space-y-1">
              <span className="text-xs text-zinc-500">
                swing amount ({formatSwingPercent(context.swing)})
              </span>
              <input
                className="w-full accent-cyan-300"
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={context.swing}
                onChange={(event) => updateSwing(event.currentTarget.value)}
              />
            </label>
          </div>
        </div>

        <div className="relative overflow-hidden border border-zinc-800 bg-zinc-950 p-4">
          {isAgentSearching ? (
            <LlmGeneratingOverlay
              detail="Prompting the LLM for a matching root and scale."
              label="generating root and scale"
            />
          ) : null}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
              <Music2 className="size-4 text-cyan-300" />
              root + scale
            </div>
            <div className="text-xs text-zinc-500">
              {context.key.tonic} {selectedScale?.name ?? context.key.scaleId}
            </div>
          </div>

          <div className="space-y-1">
            <label
              className="flex items-center gap-1 text-xs text-zinc-500"
              htmlFor="global-scale-prompt"
            >
              <Search className="size-3" />
              scale prompt
            </label>
            <div className="flex gap-2">
              <input
                id="global-scale-prompt"
                className="h-9 min-w-0 flex-1 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="microtonal quarter tone, persian, dorian, pelog..."
              />
              <button
                type="button"
                className="h-9 shrink-0 rounded-sm border border-cyan-300/50 px-3 text-xs text-cyan-100 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-700"
                disabled={isAgentSearching}
                onClick={() => void runAgenticScaleSearch()}
              >
                {isAgentSearching ? "thinking" : "agent pick"}
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">root</span>
              <select
                className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
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
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">scale</span>
              <select
                className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                value={context.key.scaleId}
                onChange={(event) => chooseScale(event.currentTarget.value)}
              >
                {scaleDefinitions.map((scaleDefinition) => (
                  <option key={scaleDefinition.id} value={scaleDefinition.id}>
                    {scaleDefinition.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-2 border border-zinc-900 bg-black/20 p-2 text-xs text-zinc-400">
            <div className="text-zinc-200">
              {context.key.tonic} {selectedScale?.name ?? context.key.scaleId}
            </div>
            <div className="mt-1 text-zinc-600">
              {selectedScale?.microtonal ? "microtonal" : selectedScale?.family}
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-2 text-xs text-zinc-500">prompt matches</div>
            <div className="flex flex-wrap gap-2">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className={`rounded-sm border px-2 py-1 text-left text-xs transition ${
                    result.scale.id === context.key.scaleId
                      ? "border-cyan-300 text-cyan-100"
                      : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
                  }`}
                  onClick={() => {
                    setScaleKey(result);
                  }}
                >
                  <span className="block">{result.label}</span>
                  <span className="block text-[10px] text-zinc-600">
                    {result.scale.microtonal ? "microtonal" : result.scale.family}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {agentChoice ? (
            <div className="mt-3 border border-cyan-300/20 bg-cyan-300/5 p-2 text-xs text-zinc-300">
              <div className="text-cyan-100">
                {agentChoice.selected.tonic}{" "}
                {getScaleDefinition(agentChoice.selected.scaleId)?.name ??
                  agentChoice.selected.scaleId}
              </div>
              <div className="mt-1 text-zinc-500">{agentChoice.selected.rationale}</div>
              {agentChoice.alternatives.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {agentChoice.alternatives.map((alternative) => {
                    const alternativeScale = getScaleDefinition(alternative.scaleId);
                    return (
                      <button
                        key={`${alternative.tonic}:${alternative.scaleId}`}
                        type="button"
                        className="rounded-sm border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-100"
                        title={alternative.rationale}
                        onClick={() =>
                          setScaleKey(
                            resolveScaleKey({
                              tonic: alternative.tonic,
                              scaleId: alternative.scaleId,
                            }),
                          )
                        }
                      >
                        {alternative.tonic} {alternativeScale?.name ?? alternative.scaleId}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          {agentError ? <div className="mt-2 text-xs text-red-300">{agentError}</div> : null}
        </div>
      </div>
    </section>
  );
}

function formatSwingPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getErrorMessage(body: unknown) {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return null;
  }

  const error = body.error;
  return typeof error === "string" ? error : null;
}
