"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Gauge,
  Loader2,
  Music2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import {
  ChromaticTonics,
  GlobalBpmSchema,
  GlobalSwingSchema,
  MAX_BPM,
  MIN_BPM,
  type Tonic,
} from "@/lib/music/context";
import {
  ScaleAgentOutputSchema,
  type ScaleAgentOutput,
} from "@/lib/music/scale-agent.shared";
import {
  getScaleDefinitions,
  getScaleDefinition,
  resolveScaleKey,
} from "@/lib/music/scale-catalog";
import {
  TempoAgentOutputSchema,
  type TempoAgentOutput,
} from "@/lib/music/tempo-agent.shared";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

type MacroMusicChoice = {
  scale: ScaleAgentOutput;
  tempo: TempoAgentOutput;
};

type ScaleSuggestionOptions = {
  tonic?: Tonic;
};

export function GlobalMusicControls() {
  const context = useGlobalMusicContextStore((state) => state.context);
  const hydrate = useGlobalMusicContextStore((state) => state.hydrate);
  const setBpm = useGlobalMusicContextStore((state) => state.setBpm);
  const setSwing = useGlobalMusicContextStore((state) => state.setSwing);
  const setScaleKey = useGlobalMusicContextStore((state) => state.setScaleKey);
  const selectedScale = getScaleDefinition(context.key.scaleId);
  const scaleDefinitions = getScaleDefinitions();
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [macroPrompt, setMacroPrompt] = useState("");
  const [macroChoice, setMacroChoice] = useState<MacroMusicChoice | null>(null);
  const [macroError, setMacroError] = useState<string | null>(null);
  const [isMacroSearching, setIsMacroSearching] = useState(false);
  const [macroAppliedPrompt, setMacroAppliedPrompt] = useState<string | null>(null);
  const macroSelectedScale = macroChoice
    ? getScaleDefinition(macroChoice.scale.selected.scaleId)
    : null;
  const trimmedMacroPrompt = macroPrompt.trim();
  const canRunMacroSuggestion = trimmedMacroPrompt.length > 0 && !isMacroSearching;
  const hasAppliedCurrentPrompt =
    Boolean(macroChoice) && macroAppliedPrompt === trimmedMacroPrompt;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  function chooseTonic(tonic: string) {
    const next = resolveScaleKey({ tonic, scaleId: context.key.scaleId });
    setScaleKey(next);
    setMacroChoice(null);
  }

  function chooseScale(scaleId: string) {
    const next = resolveScaleKey({ tonic: context.key.tonic, scaleId });
    setScaleKey(next);
    setMacroChoice(null);
  }

  function updateBpm(value: string) {
    const next = Number(value);
    const parsed = Number.isFinite(next)
      ? GlobalBpmSchema.safeParse(next)
      : { success: false as const };
    if (parsed.success) {
      setBpm(parsed.data);
      setMacroChoice(null);
    }
  }

  function updateSwing(value: string) {
    const next = Number(value);
    const parsed = Number.isFinite(next)
      ? GlobalSwingSchema.safeParse(next)
      : { success: false as const };
    if (parsed.success) {
      setSwing(parsed.data);
      setMacroChoice(null);
    }
  }

  function applyTempoChoice(choice: TempoAgentOutput["selected"]) {
    setBpm(choice.bpm);
    setSwing(choice.swing);
  }

  async function fetchTempoSuggestion(prompt: string) {
    const response = await fetch("/api/music/tempo-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
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
    return parsed.data;
  }

  async function fetchScaleSuggestion(
    prompt: string,
    options: ScaleSuggestionOptions = {},
  ) {
    const response = await fetch("/api/music/scale-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        tonic: options.tonic ?? context.key.tonic,
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
    return parsed.data;
  }

  async function runMacroSuggestion() {
    if (!trimmedMacroPrompt) {
      return;
    }

    setIsMacroSearching(true);
    setMacroError(null);

    try {
      const prompt = trimmedMacroPrompt;
      const requestedTonic = inferPromptTonic(prompt);
      const [tempoResult, scaleResult] = await Promise.all([
        fetchTempoSuggestion(prompt),
        fetchScaleSuggestion(prompt, { tonic: requestedTonic ?? context.key.tonic }),
      ]);
      const selected = resolveScaleKey({
        tonic: scaleResult.selected.tonic,
        scaleId: scaleResult.selected.scaleId,
      });

      applyTempoChoice(tempoResult.selected);
      setScaleKey(selected);
      setMacroChoice({ scale: scaleResult, tempo: tempoResult });
      setMacroAppliedPrompt(prompt);
    } catch (unknownError) {
      setMacroError(
        unknownError instanceof Error ? unknownError.message : "Macro suggestion failed",
      );
      setMacroAppliedPrompt(null);
    } finally {
      setIsMacroSearching(false);
    }
  }

  return (
    <section className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
          <SlidersHorizontal className="size-4 text-zinc-200" />
          global music context
        </div>
        <div className="text-xs text-zinc-500">
          {context.bpm} bpm / {formatSwingPercent(context.swing)} swing /{" "}
          {context.key.tonic} {selectedScale?.name ?? context.key.scaleId}
        </div>
      </div>

      <div className="relative overflow-hidden border border-zinc-800 bg-zinc-950 p-4">
        {isMacroSearching ? (
          <LlmGeneratingOverlay
            detail="Prompting both music agents from one context prompt."
            label="generating tempo and key"
          />
        ) : null}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
            <Sparkles className="size-4 text-zinc-200" />
            1. macro context
          </div>
          <div className="text-xs text-zinc-500">
            {context.bpm} bpm / {formatSwingPercent(context.swing)} swing /{" "}
            {context.key.tonic} {selectedScale?.name ?? context.key.scaleId}
          </div>
        </div>

        <div className="space-y-1">
          <label
            className="flex items-center gap-1 text-xs text-zinc-500"
            htmlFor="global-macro-prompt"
          >
            <Sparkles className="size-3" />
            tempo + key prompt
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="global-macro-prompt"
              className="h-9 min-w-0 flex-1 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 placeholder:text-zinc-700"
              value={macroPrompt}
              onChange={(event) => {
                setMacroPrompt(event.currentTarget.value);
                setMacroChoice(null);
                setMacroAppliedPrompt(null);
              }}
              placeholder="Describe tempo, swing, key, and scale..."
            />
            <button
              type="button"
              className={[
                "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-sm border px-3 text-xs transition disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-700",
                hasAppliedCurrentPrompt
                  ? "border-emerald-300/60 bg-emerald-400/10 text-emerald-100"
                  : "border-zinc-200/50 text-zinc-100 hover:border-zinc-200",
              ].join(" ")}
              disabled={!canRunMacroSuggestion}
              onClick={() => void runMacroSuggestion()}
            >
              {isMacroSearching ? <Loader2 className="size-3 animate-spin" /> : null}
              {hasAppliedCurrentPrompt && !isMacroSearching ? <Check className="size-3" /> : null}
              {isMacroSearching
                ? "setting"
                : hasAppliedCurrentPrompt
                  ? "applied"
                  : trimmedMacroPrompt
                    ? "set both"
                    : "enter prompt"}
            </button>
          </div>
          <div className="mt-1 text-xs text-zinc-600" aria-live="polite">
            {trimmedMacroPrompt
              ? hasAppliedCurrentPrompt
                ? "Macro context applied to BPM, swing, root, and scale."
                : "Ready to set tempo and key from this prompt."
              : "Enter a prompt to enable macro context."}
          </div>
        </div>

        {macroChoice ? (
          <div className="mt-3 border border-zinc-200/20 bg-white/5 p-2 text-xs text-zinc-300">
            <div className="text-zinc-100">
              {macroChoice.tempo.selected.bpm} BPM /{" "}
              {formatSwingPercent(macroChoice.tempo.selected.swing)} swing /{" "}
              {macroChoice.scale.selected.tonic}{" "}
              {macroSelectedScale?.name ?? macroChoice.scale.selected.scaleId}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="text-zinc-500">{macroChoice.tempo.selected.rationale}</div>
              <div className="text-zinc-500">{macroChoice.scale.selected.rationale}</div>
            </div>
          </div>
        ) : null}
        {macroError ? <div className="mt-2 text-xs text-red-300">{macroError}</div> : null}
      </div>

      <div className="border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
              <SlidersHorizontal className="size-4 text-zinc-200" />
              2. set manually
            </div>
            <div className="mt-1 text-sm text-zinc-300">
              {context.bpm} bpm / {formatSwingPercent(context.swing)} swing /{" "}
              {context.key.tonic} {selectedScale?.name ?? context.key.scaleId}
            </div>
          </div>
          <button
            type="button"
            className="h-9 shrink-0 rounded-sm border border-zinc-200/50 px-3 text-xs text-zinc-100 hover:border-zinc-200 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-700"
            disabled={isMacroSearching}
            onClick={() => setIsManualOpen((current) => !current)}
          >
            {isManualOpen ? "hide manual" : "set manually"}
          </button>
        </div>

        {isManualOpen ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="border border-zinc-900 bg-black/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                  <Gauge className="size-4 text-zinc-200" />
                  bpm + swing
                </div>
                <div className="text-xs text-zinc-500">
                  {context.bpm} bpm / {formatSwingPercent(context.swing)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <Gauge className="size-3" />
                    bpm
                  </span>
                  <input
                    className="h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                    type="number"
                    min={MIN_BPM}
                    max={MAX_BPM}
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
                    className="w-full accent-zinc-200"
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

            <div className="border border-zinc-900 bg-black/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                  <Music2 className="size-4 text-zinc-200" />
                  root + scale
                </div>
                <div className="text-xs text-zinc-500">
                  {context.key.tonic} {selectedScale?.name ?? context.key.scaleId}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
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
            </div>
          </div>
        ) : null}
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

const PromptTonicAliases: Array<{ aliases: string[]; tonic: Tonic }> = [
  { tonic: "C#", aliases: ["c#", "c sharp", "db", "d flat"] },
  { tonic: "Eb", aliases: ["eb", "e flat", "d#", "d sharp"] },
  { tonic: "F#", aliases: ["f#", "f sharp", "gb", "g flat"] },
  { tonic: "Ab", aliases: ["ab", "a flat", "g#", "g sharp"] },
  { tonic: "Bb", aliases: ["bb", "b flat", "a#", "a sharp"] },
  { tonic: "C", aliases: ["c"] },
  { tonic: "D", aliases: ["d"] },
  { tonic: "E", aliases: ["e"] },
  { tonic: "F", aliases: ["f"] },
  { tonic: "G", aliases: ["g"] },
  { tonic: "A", aliases: ["a"] },
  { tonic: "B", aliases: ["b"] },
];

function inferPromptTonic(prompt: string): Tonic | null {
  const normalized = prompt
    .toLowerCase()
    .replaceAll("♯", "#")
    .replaceAll("♭", "b");

  for (const { aliases, tonic } of PromptTonicAliases) {
    if (aliases.some((alias) => promptContainsAlias(normalized, alias))) {
      return tonic;
    }
  }

  return null;
}

function promptContainsAlias(prompt: string, alias: string) {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9#])${escapedAlias}([^a-z0-9#]|$)`).test(prompt);
}
