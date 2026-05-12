import { sha256Hex } from "@/lib/samples/analysis/hash";
import {
  extractGlobal,
  extractRhythm,
  extractSpectral,
  extractTonal,
} from "@/lib/samples/analysis/essentia/extract";
import { runMusicnn } from "@/lib/samples/analysis/essentia/musicnn";
import {
  analyzeEnvelope,
  analyzeSlices,
} from "@/lib/samples/analysis/pipeline/slices";
import {
  evidenceFromAnalysis,
  inferRole,
} from "@/lib/samples/analysis/pipeline/role";
import {
  SAMPLE_ANALYSIS_SCHEMA_VERSION,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";

export const ESSENTIA_PIPELINE_VERSION = "2.0.0-essentia";

export type EssentiaPipelineInput = {
  arrayBuffer: ArrayBuffer;
  channels: Float32Array[];
  sampleRate: number;
  durationSec: number;
  includeMusicnn?: boolean;
};

export async function runEssentiaPipeline({
  arrayBuffer,
  channels,
  sampleRate,
  durationSec,
  includeMusicnn = false,
}: EssentiaPipelineInput): Promise<SampleAnalysis> {
  const sha256 = await sha256Hex(arrayBuffer);
  const global = extractGlobal(channels);
  const { spectral, chromaMean } = extractSpectral(channels, sampleRate);
  const tonal = extractTonal(channels, chromaMean);
  const rhythm = extractRhythm(channels, sampleRate);
  const slices = analyzeSlices(channels, sampleRate, rhythm.onsets_s);
  const envelope = analyzeEnvelope(
    channels,
    sampleRate,
    durationSec,
    rhythm.onsets_s.length,
  );

  const partial: Pick<
    SampleAnalysis,
    "source" | "global" | "spectral" | "tonal" | "rhythm" | "envelope" | "slices" | "beats"
  > = {
    source: {
      sample_rate: sampleRate,
      channels: channels.length,
      duration_s: durationSec,
      sha256,
    },
    global,
    spectral,
    tonal,
    rhythm,
    envelope,
    slices,
    beats: [],
  };

  const role = inferRole(evidenceFromAnalysis(partial));
  const tags = includeMusicnn ? await runMusicnn(channels, sampleRate) : null;

  return {
    schema_version: SAMPLE_ANALYSIS_SCHEMA_VERSION,
    ...partial,
    role: role.role,
    role_confidence: role.confidence,
    tags,
    llm_descriptors: null,
    pipeline_version: ESSENTIA_PIPELINE_VERSION,
    analyzed_at: Date.now(),
  };
}
