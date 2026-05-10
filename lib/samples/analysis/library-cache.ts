import {
  SampleAnalysisSchema,
  SAMPLE_ANALYSIS_SCHEMA_VERSION,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";
import bakedCache from "@/lib/samples/analysis-cache.json";

type BakedAnalysisCache = {
  schema_version: number;
  pipeline_version: string;
  samples: Record<string, { hash: string; analysis: unknown }>;
};

const cache = bakedCache as BakedAnalysisCache;

export function getLibraryAnalysisPipelineVersion(): string {
  return cache.pipeline_version;
}

export function hasLibraryAnalysis(libraryId: string): boolean {
  if (cache.schema_version !== SAMPLE_ANALYSIS_SCHEMA_VERSION) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(cache.samples, libraryId);
}

export function getLibraryAnalysis(libraryId: string): SampleAnalysis | null {
  if (cache.schema_version !== SAMPLE_ANALYSIS_SCHEMA_VERSION) {
    return null;
  }

  const entry = cache.samples[libraryId];
  if (!entry) {
    return null;
  }

  const parsed = SampleAnalysisSchema.safeParse(entry.analysis);
  return parsed.success ? parsed.data : null;
}

export function listBakedLibraryIds(): string[] {
  return Object.keys(cache.samples);
}
