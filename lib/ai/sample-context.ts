import { getLibraryAnalysis } from "@/lib/samples/analysis/library-cache";
import {
  pickAnalysisFields,
  type AnalysisPath,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";
import { getLibrarySample } from "@/lib/samples/library";
import type { Track } from "@/lib/pattern/schema";

export type AiSampleContext = {
  id: string;
  name: string;
  pack: string;
  role: Track["role"];
  estimatedBpm?: number;
  analysis: Record<string, unknown> | null;
};

export type GetAiSampleContextInput = {
  id: string;
  name?: string;
  role?: Track["role"];
  providedAnalysis?: SampleAnalysis | null;
  requiredAnalysis?: readonly AnalysisPath[];
};

export function getAiSampleContext(
  input: GetAiSampleContextInput,
): AiSampleContext {
  const librarySample = getLibrarySample(input.id);
  const base = librarySample
    ? {
        id: librarySample.id,
        name: librarySample.name,
        pack: librarySample.pack,
        role: librarySample.role,
        estimatedBpm: librarySample.estimatedBpm,
      }
    : {
        id: input.id,
        name: input.name ?? "Uploaded sample",
        pack: "Browser upload",
        role: input.role ?? "unknown",
      };

  const required = input.requiredAnalysis ?? [];
  const analysisSource =
    input.providedAnalysis ?? (librarySample ? getLibraryAnalysis(input.id) : null);

  const analysis =
    required.length > 0 && analysisSource
      ? pickAnalysisFields(analysisSource, required)
      : null;

  return { ...base, analysis };
}
