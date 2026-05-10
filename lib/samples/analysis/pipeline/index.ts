import { sha256Hex } from "@/lib/samples/analysis/hash";
import { analyzeGlobal } from "@/lib/samples/analysis/pipeline/global";
import {
  analyzeEnvelope,
  analyzeSlices,
} from "@/lib/samples/analysis/pipeline/slices";
import { analyzeSpectral } from "@/lib/samples/analysis/pipeline/spectral";
import {
  analyzeRhythm,
  analyzeTonal,
} from "@/lib/samples/analysis/pipeline/tonal-rhythm";
import {
  evidenceFromAnalysis,
  inferRole,
} from "@/lib/samples/analysis/pipeline/role";
import {
  SAMPLE_ANALYSIS_SCHEMA_VERSION,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";

export const PIPELINE_VERSION = "1.0.0-mvp";

export type RawAnalysisInput = {
  arrayBuffer: ArrayBuffer;
  channels: Float32Array[];
  sampleRate: number;
  durationSec: number;
};

export async function runDspPipeline({
  arrayBuffer,
  channels,
  sampleRate,
  durationSec,
}: RawAnalysisInput): Promise<SampleAnalysis> {
  const sha256 = await sha256Hex(arrayBuffer);
  const global = analyzeGlobal(channels, sampleRate);
  const { spectral, frames } = analyzeSpectral(channels, sampleRate);
  const tonal = analyzeTonal(frames, sampleRate);
  const totalSamples = channels[0]?.length ?? 0;
  const rhythm = analyzeRhythm(frames, sampleRate, totalSamples);
  const slices = analyzeSlices(channels, sampleRate, rhythm.onsets_s);
  const envelope = analyzeEnvelope(channels, sampleRate, durationSec, rhythm.onsets_s.length);

  const partial: Pick<SampleAnalysis,
    "source" | "global" | "spectral" | "tonal" | "rhythm" | "envelope" | "slices" | "beats"> = {
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

  return {
    schema_version: SAMPLE_ANALYSIS_SCHEMA_VERSION,
    ...partial,
    role: role.role,
    role_confidence: role.confidence,
    llm_descriptors: null,
    pipeline_version: PIPELINE_VERSION,
    analyzed_at: Date.now(),
  };
}
