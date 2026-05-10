"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cable, Search, SplitSquareHorizontal } from "lucide-react";

import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import { GlobalMusicControls } from "@/components/music/global-music-controls";
import { Button } from "@/components/ui/button";
import {
  ScaleAgentOutputSchema,
  type ScaleAgentOutput,
} from "@/lib/music/scale-agent.shared";
import { getScaleDefinition, resolveScaleKey } from "@/lib/music/scale-catalog";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

type SessionClientProps = {
  embedTools?: boolean;
  sessionId: string;
};

const sessionTools = [
  {
    slug: "intelligence-sampler",
    route: "/tools/intelligence-sampler",
    document: "pattern",
  },
  {
    slug: "evolving-fm-synth",
    route: "/tools/evolving-fm-synth",
    document: "synth-scene",
  },
] as const;

export function SessionClient({ embedTools = true, sessionId }: SessionClientProps) {
  const context = useGlobalMusicContextStore((state) => state.context);
  const hydrate = useGlobalMusicContextStore((state) => state.hydrate);
  const setScaleKey = useGlobalMusicContextStore((state) => state.setScaleKey);
  const currentScale = getScaleDefinition(context.key.scaleId);
  const [scalePrompt, setScalePrompt] = useState(
    "dub techno break and evolving FM pad, metallic but playable",
  );
  const [scaleResult, setScaleResult] = useState<ScaleAgentOutput | null>(null);
  const [scaleError, setScaleError] = useState<string | null>(null);
  const [isSearchingScale, setIsSearchingScale] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  async function findSessionScale() {
    setIsSearchingScale(true);
    setScaleError(null);

    try {
      const response = await fetch("/api/music/scale-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scalePrompt,
          tonic: context.key.tonic,
          context,
          limit: 12,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(body) ?? "Session scale search failed");
      }

      const parsed = ScaleAgentOutputSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("Session scale search returned malformed data");
      }

      const selected = resolveScaleKey({
        tonic: parsed.data.selected.tonic,
        scaleId: parsed.data.selected.scaleId,
      });
      setScaleKey(selected);
      setScaleResult(parsed.data);
    } catch (error) {
      setScaleError(
        error instanceof Error ? error.message : "Session scale search failed",
      );
    } finally {
      setIsSearchingScale(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-cyan-200">
              /dashboard
            </Link>
            <h1 className="mt-2 text-xl">session {sessionId}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{context.bpm} bpm</span>
            <span>{Math.round(context.swing * 100)}% swing</span>
            <span>
              {context.key.tonic} {currentScale?.name ?? context.key.scaleId}
            </span>
          </div>
        </header>

        <GlobalMusicControls />

        <section className="relative mb-5 overflow-hidden border border-zinc-800 bg-zinc-950 p-4">
          {isSearchingScale ? (
            <LlmGeneratingOverlay
              detail="Prompting the scale-search agent against this multi-tool session."
              label="finding session scale"
            />
          ) : null}
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
            <Search className="size-4 text-cyan-300" />
            session scale search
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="h-10 min-w-0 flex-1 rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
              value={scalePrompt}
              onChange={(event) => setScalePrompt(event.currentTarget.value)}
            />
            <Button disabled={isSearchingScale} onClick={() => void findSessionScale()}>
              <Search className="size-4" />
              find scale
            </Button>
          </div>
          {scaleResult ? (
            <div className="mt-3 text-xs text-zinc-400">
              selected {scaleResult.selected.tonic} {scaleResult.selected.scaleId}:{" "}
              {scaleResult.selected.rationale}
            </div>
          ) : null}
          {scaleError ? <div className="mt-3 text-xs text-red-300">{scaleError}</div> : null}
        </section>

        <section className="mb-5 grid gap-3 border-y border-zinc-800 py-3 md:grid-cols-2">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Cable className="size-4 text-cyan-300" />
            shared context bus: BPM, swing, tonic, scale
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <SplitSquareHorizontal className="size-4 text-fuchsia-300" />
            pattern and synth-scene tools stay separate documents
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {sessionTools.map((tool) => (
            <div key={tool.slug} className="min-h-[720px] border border-zinc-800">
              <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs">
                <span className="text-zinc-300">{tool.slug}</span>
                <span className="text-zinc-600">{tool.document}</span>
              </div>
              {embedTools ? (
                <iframe
                  className="h-[680px] w-full bg-zinc-950"
                  src={tool.route}
                  title={`${tool.slug} session tool`}
                />
              ) : (
                <div
                  className="grid h-[680px] place-items-center bg-zinc-950 text-xs text-zinc-600"
                  title={`${tool.slug} session tool`}
                >
                  {tool.route}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function getErrorMessage(body: unknown) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as { error?: unknown }).error;
    return typeof error === "string" ? error : null;
  }

  return null;
}
