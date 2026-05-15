import "server-only";

import { Output, generateText } from "ai";
import { z } from "zod";

import {
  buildEvolvingFmSynthPrompt,
  buildEvolvingFmSynthSystemPrompt,
  evolveSynthScene,
  generateSynthSceneFromPrompt,
} from "@/app/tools/evolving-fm-synth/lib/agent";
import {
  SynthSceneSchema,
  type SynthScene,
} from "@/app/tools/evolving-fm-synth/lib/schema";
import { getConfiguredGatewayModelId, getGatewayModel } from "@/lib/ai/gateway";
import type { GlobalMusicContext } from "@/lib/music/context";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export const GenerateSynthSceneModeSchema = z.enum(["generate", "evolve"]);

export type GenerateSynthSceneWithGatewayInput = {
  prompt: string;
  mode: z.infer<typeof GenerateSynthSceneModeSchema>;
  musicalContext?: GlobalMusicContext;
  scene?: SynthScene | null;
  model?: string;
};

export function getSynthGatewayTimeoutMs() {
  if (!process.env.SYNTH_GATEWAY_TIMEOUT_MS) {
    return undefined;
  }

  const configured = Number(process.env.SYNTH_GATEWAY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : undefined;
}

export async function generateSynthSceneWithGateway({
  mode,
  model,
  musicalContext,
  prompt,
  scene,
}: GenerateSynthSceneWithGatewayInput): Promise<SynthScene> {
  const timeoutMs = getSynthGatewayTimeoutMs();
  const draft =
    mode === "evolve" && scene
      ? evolveSynthScene(scene, prompt, musicalContext)
      : generateSynthSceneFromPrompt({ musicalContext, prompt, previousScene: scene });
  const system = buildEvolvingFmSynthSystemPrompt();
  const resolvedPrompt = [
    buildEvolvingFmSynthPrompt({ musicalContext, prompt, scene: draft }),
    "",
    "Use this deterministic local-agent draft as the structural contract.",
    JSON.stringify(draft),
    "",
    "Improve it as an AI sound-design pass while preserving valid schema bounds.",
    "Keep it playable in Tone.js with FMSynth rootWaveform values and custom oscillator partials when rootWaveform is wavetable.",
  ].join("\n");

  await recordPromptMemory({
    action: mode,
    metadata: {
      hasMusicalContext: Boolean(musicalContext),
      hasPreviousScene: Boolean(scene),
    },
    model: model ?? getConfiguredGatewayModelId(),
    resolvedPrompt,
    source: "ai.synth-generation",
    systemPrompt: system,
    toolSlug: "synth-scene",
    userPrompt: prompt,
  });

  const { output } = await generateText({
    model: getGatewayModel(model),
    output: Output.object({ schema: SynthSceneSchema }),
    system,
    ...(timeoutMs ? { timeout: { totalMs: timeoutMs } } : {}),
    prompt: resolvedPrompt,
    temperature: 0.75,
  });

  return SynthSceneSchema.parse(output);
}
