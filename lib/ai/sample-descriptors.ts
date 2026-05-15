import "server-only";

import { Output, generateText } from "ai";

import { getConfiguredGatewayModelId, getGatewayModel } from "@/lib/ai/gateway";
import { recordPromptMemory } from "@/lib/prompt-memory/server";
import {
  LlmDescriptorsSchema,
  type LlmDescriptors,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";

export type DescribeSampleInput = {
  analysis: SampleAnalysis;
  sourceName: string | null;
  model?: string;
};

const SYSTEM_PROMPT = [
  "You are a sample-tagging assistant inside a transparent AI music tool.",
  "You receive a JSON object describing measured DSP features of an audio sample.",
  "You DO NOT hear the audio. You translate the numbers into short descriptive tags.",
  "Never invent or override numeric facts (BPM, key, RMS, durations).",
  "Tags must be lowercase, 1-3 words each, concrete and producer-friendly.",
].join(" ");

export async function describeSample(
  input: DescribeSampleInput,
): Promise<LlmDescriptors> {
  const compact = compactAnalysisForPrompt(input.analysis);
  const prompt = buildDescribePrompt(compact, input.sourceName);

  await recordPromptMemory({
    action: "sample-descriptors",
    metadata: { sourceName: input.sourceName },
    model: input.model ?? getConfiguredGatewayModelId(),
    resolvedPrompt: prompt,
    source: "ai.sample-descriptors",
    systemPrompt: SYSTEM_PROMPT,
    toolSlug: "sample-analysis",
  });

  const { output } = await generateText({
    model: getGatewayModel(input.model),
    output: Output.object({ schema: LlmDescriptorsSchema }),
    system: SYSTEM_PROMPT,
    prompt,
    temperature: 0.6,
  });
  return output;
}

export function buildDescribePrompt(
  compact: Record<string, unknown>,
  sourceName: string | null,
): string {
  const lines: string[] = [];
  if (sourceName) {
    lines.push(`Sample filename: ${sourceName}`);
  }
  lines.push(
    "Measured DSP features (do not contradict these numbers):",
    "```json",
    JSON.stringify(compact, null, 2),
    "```",
    "",
    "Return JSON with four arrays of 3-5 tags each:",
    "- timbre: textural / sonic descriptors (e.g. 'dark', 'lo-fi', 'saturated', 'glassy')",
    "- mood: emotional descriptors (e.g. 'urgent', 'wistful', 'aggressive', 'serene')",
    "- use_case: production placement ideas (e.g. 'intro hit', 'chorus stab', 'transition riser')",
    "- suggested_genres: 3-5 fitting genres",
  );
  return lines.join("\n");
}

export function compactAnalysisForPrompt(
  analysis: SampleAnalysis,
): Record<string, unknown> {
  return {
    duration_s: round(analysis.source.duration_s, 3),
    channels: analysis.source.channels,
    inferred_role: analysis.role,
    role_confidence: round(analysis.role_confidence, 3),
    loudness: {
      lufs_integrated: round(analysis.global.lufs_integrated, 2),
      rms_dbfs: round(analysis.global.rms_dbfs, 2),
      true_peak_dbfs: round(analysis.global.true_peak_dbfs, 2),
      crest_factor_db: round(analysis.global.crest_factor_db, 2),
      stereo_width: round(analysis.global.stereo_width, 3),
      is_silent: analysis.global.is_silent,
    },
    spectral: {
      centroid_hz_mean: round(analysis.spectral.centroid_hz.mean, 1),
      centroid_hz_std: round(analysis.spectral.centroid_hz.std, 1),
      rolloff85_hz_mean: round(analysis.spectral.rolloff85_hz.mean, 1),
      flatness_mean: round(analysis.spectral.flatness.mean, 3),
      flux_mean: round(analysis.spectral.flux.mean, 4),
    },
    tonal: {
      key: analysis.tonal.key,
      scale: analysis.tonal.scale,
      key_strength: round(analysis.tonal.key_strength, 3),
    },
    rhythm: {
      bpm: analysis.rhythm.bpm !== null ? round(analysis.rhythm.bpm, 2) : null,
      bpm_confidence: round(analysis.rhythm.bpm_confidence, 3),
      onset_count: analysis.rhythm.onsets_s.length,
      onset_rate_hz: round(analysis.rhythm.onset_rate_hz, 3),
      swing_ratio:
        analysis.rhythm.swing_ratio !== null
          ? round(analysis.rhythm.swing_ratio, 3)
          : null,
    },
    envelope: analysis.envelope
      ? {
          attack_ms: analysis.envelope.attack_ms,
          decay_t60_ms: analysis.envelope.decay_t60_ms,
          peak_position_frac: round(analysis.envelope.peak_position_frac, 3),
        }
      : null,
    slice_count: analysis.slices.length,
  };
}

function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
