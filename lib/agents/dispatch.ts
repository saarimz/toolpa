import {
  buildIntelligenceSamplerPrompt,
  buildIntelligenceSamplerSystemPrompt,
} from "@/app/tools/intelligence-sampler/lib/prompt";
import {
  buildDrumMachinePrompt,
  buildDrumMachineSystemPrompt,
} from "@/app/tools/drum-machine/lib/prompt";
import {
  buildGridSamplerPrompt,
  buildGridSamplerSystemPrompt,
} from "@/app/tools/grid-sampler/lib/prompt";
import {
  buildSpliceLabPrompt,
  buildSpliceLabSystemPrompt,
} from "@/app/tools/splice-lab/lib/prompt";
import type { AiSampleContext } from "@/lib/ai/sample-context";
import type {
  DrumSampleMode,
  DrumTrackSampleContext,
} from "@/lib/ai/contracts";
import type { AgentManifest } from "@/lib/agents/contract";
import { getAgentManifest } from "@/lib/agents/registry";
import type { GlobalMusicContext } from "@/lib/music/context";
import { getScaleDefinition } from "@/lib/music/scale-catalog";
import type { Pattern } from "@/lib/pattern/schema";

export type ToolPromptInput = {
  toolSlug: string;
  pattern: Pattern;
  sample: AiSampleContext;
  secondarySample: AiSampleContext | null;
  bpm: number;
  swing: number;
  vibe: string;
  sliceCount?: number;
  traversal?: string;
  musicalContext?: GlobalMusicContext;
  sampleMode?: DrumSampleMode;
  trackSamples?: DrumTrackSampleContext[];
  agentMode: "structured" | "tool-calling";
};

export type ResolvedToolPrompt = {
  system: string;
  prompt: string;
};

type ToolPromptDispatcher = (input: ToolPromptInput) => ResolvedToolPrompt;

const promptDispatchers: Record<string, ToolPromptDispatcher> = {
  "intelligence-sampler": (input) => ({
    system: buildIntelligenceSamplerSystemPrompt(),
    prompt: buildIntelligenceSamplerPrompt({
      pattern: input.pattern,
      sample: input.sample,
      bpm: input.musicalContext?.bpm ?? input.bpm,
      swing: input.swing,
      vibe: input.vibe,
      musicalContext: input.musicalContext,
    }),
  }),
  "grid-sampler": (input) => ({
    system: buildGridSamplerSystemPrompt(input.agentMode === "tool-calling"),
    prompt: buildGridSamplerPrompt({
      pattern: input.pattern,
      sample: input.sample,
      vibe: input.vibe,
      sliceCount: input.sliceCount ?? 64,
      traversal: input.traversal ?? "LR",
    }),
  }),
  "drum-machine": (input) => ({
    system: buildDrumMachineSystemPrompt(),
    prompt: buildDrumMachinePrompt({
      pattern: input.pattern,
      sample: input.sample,
      sampleMode: input.sampleMode,
      trackSamples: input.trackSamples,
      vibe: input.vibe,
    }),
  }),
  "splice-lab": (input) => {
    const sourceTrackCount = input.pattern.tracks.filter((track) =>
      track.id.startsWith("source-"),
    ).length;

    if (sourceTrackCount < 2) {
      throw new Error("splice-lab requires at least two sources");
    }

    return {
      system: buildSpliceLabSystemPrompt(),
      prompt: buildSpliceLabPrompt({
        pattern: input.pattern,
        vibe: input.vibe,
        sliceCount: input.sliceCount ?? 16,
      }),
    };
  },
};

export function resolveToolPrompts(input: ToolPromptInput): ResolvedToolPrompt {
  const dispatcher = promptDispatchers[input.toolSlug];
  if (dispatcher) {
    return dispatcher(input);
  }

  const manifest = getAgentManifest(input.toolSlug);
  if (!manifest || manifest.level !== 1) {
    throw new Error(`Unsupported tool ${input.toolSlug}`);
  }

  return buildGenericToolPrompt(input, manifest);
}

function buildGenericToolPrompt(
  input: ToolPromptInput,
  manifest: AgentManifest,
): ResolvedToolPrompt {
  return {
    system: [
      `You are the ${input.toolSlug} L1 agent inside toolpa.`,
      "Return one valid Pattern JSON object only.",
      "Use the shared Pattern schema fields conservatively: active, velocity, probability, microShift, conditions, pitchSemitones, pitchCents, tuningRef, decay, reverse, repeats, and chokeGroup.",
      "Expose a compact visible decision summary in metadata.rationale.",
    ].join("\n"),
    prompt: [
      `tool: ${input.toolSlug}`,
      `description: ${manifest.description}`,
      `instrument: ${manifest.instrument.type}`,
      `workflow: ${manifest.instrument.workflow}`,
      `document: ${manifest.instrument.document}`,
      `vibe: ${input.vibe || "make a useful pattern for this tool"}`,
      `sample: ${input.sample.name} (${input.sample.pack}, ${input.sample.role})`,
      buildSampleAnalysisLine(input.sample.analysis),
      `tempo: ${input.bpm} BPM`,
      `swing: ${input.swing}`,
      buildMusicContextPromptLine(input),
      `current pattern: ${JSON.stringify(input.pattern)}`,
      "Preserve sample ids unless a step intentionally references another loaded source.",
    ].filter(Boolean).join("\n"),
  };
}

function buildSampleAnalysisLine(
  analysis: Record<string, unknown> | null,
): string {
  if (!analysis || Object.keys(analysis).length === 0) {
    return "";
  }
  return `sample analysis: ${JSON.stringify(analysis)}`;
}

function buildMusicContextPromptLine(input: ToolPromptInput) {
  if (!input.musicalContext) {
    return "";
  }

  const scale = getScaleDefinition(input.musicalContext.key.scaleId);
  const parts = [
    `global tempo: ${input.musicalContext.bpm} BPM`,
    `global swing: ${input.musicalContext.swing}`,
    `global key: ${input.musicalContext.key.tonic} ${scale?.name ?? input.musicalContext.key.scaleId}`,
  ];

  if (scale?.microtonal) {
    parts.push(`scale tuning: ${scale.family}; microtonal scale id ${scale.id}`);
  }

  return parts.join("\n");
}
