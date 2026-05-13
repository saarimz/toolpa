"use client";

import {
  getCachedAnalysis,
  putCachedAnalysis,
} from "@/lib/samples/analysis/cache";
import {
  getLibraryAnalysis,
  hasLibraryAnalysis,
} from "@/lib/samples/analysis/library-cache";
import { sha256Hex } from "@/lib/samples/analysis/hash";
import { decodeArrayBufferInBrowser } from "@/lib/samples/analysis/pipeline/decode";
import { runDspPipeline } from "@/lib/samples/analysis/pipeline/index";
import {
  LlmDescriptorsSchema,
  SampleAnalysisSchema,
  type LlmDescriptors,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";
import { assertLibrarySample } from "@/lib/samples/library";
import { getUploadedSample } from "@/lib/samples/storage";

export type SampleSchemaOptions = {
  waitForDescriptors?: boolean;
  enrichDescriptors?: boolean;
};

const inFlight = new Map<string, Promise<SampleAnalysis>>();
const descriptorInFlight = new Map<string, Promise<SampleAnalysis>>();

export function isAnalysisCached(sampleId: string): boolean {
  if (sampleId.startsWith("library:")) {
    return hasLibraryAnalysis(sampleId);
  }
  return false;
}

export async function getSampleSchema(
  sampleId: string,
  options: SampleSchemaOptions = {},
): Promise<SampleAnalysis> {
  if (sampleId.startsWith("library:")) {
    const baked = getLibraryAnalysis(sampleId);
    if (baked) {
      const cached = await getCachedAnalysis(baked.source.sha256);
      const baseline = cached ?? baked;
      if (baseline.llm_descriptors) {
        return baseline;
      }
      if (!options.waitForDescriptors) {
        if (options.enrichDescriptors !== false) {
          void enrichDescriptorsAsync(baseline, sampleNameForLlmContext(sampleId)).catch(
            () => {},
          );
        }
        return baseline;
      }
      if (options.enrichDescriptors === false) {
        return baseline;
      }
      return enrichDescriptorsAsync(baseline, sampleNameForLlmContext(sampleId));
    }
  }

  const existing = inFlight.get(sampleId);
  if (existing) {
    return existing;
  }

  const work = analyzeSampleById(sampleId, options).finally(() =>
    inFlight.delete(sampleId),
  );
  inFlight.set(sampleId, work);
  return work;
}

async function analyzeSampleById(
  sampleId: string,
  options: SampleSchemaOptions,
): Promise<SampleAnalysis> {
  const arrayBuffer = await loadAudioBytes(sampleId);
  return analyzeArrayBuffer(arrayBuffer, {
    enrichDescriptors: options.enrichDescriptors,
    waitForDescriptors: options.waitForDescriptors ?? false,
    sourceName: sampleNameForLlmContext(sampleId),
  });
}

export type AnalyzeOptions = {
  waitForDescriptors?: boolean;
  sourceName?: string;
  enrichDescriptors?: boolean;
};

export async function analyzeArrayBuffer(
  arrayBuffer: ArrayBuffer,
  options: AnalyzeOptions = {},
): Promise<SampleAnalysis> {
  const hash = await sha256Hex(arrayBuffer);
  const cached = await getCachedAnalysis(hash);
  if (cached && cached.llm_descriptors) {
    return cached;
  }

  const baseline =
    cached
    ?? (await tryServerAnalysis(arrayBuffer))
    ?? (await runFullDspPipeline(arrayBuffer));
  if (!cached) {
    await putCachedAnalysis(baseline);
  }

  if (baseline.llm_descriptors) {
    return baseline;
  }

  if (options.enrichDescriptors === false) {
    return baseline;
  }

  if (!options.waitForDescriptors) {
    void enrichDescriptorsAsync(baseline, options.sourceName).catch(() => {});
    return baseline;
  }

  return enrichDescriptorsAsync(baseline, options.sourceName);
}

async function tryServerAnalysis(
  arrayBuffer: ArrayBuffer,
): Promise<SampleAnalysis | null> {
  try {
    const response = await fetch("/api/analyze-upload", {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: arrayBuffer.slice(0),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { analysis?: unknown };
    const parsed = SampleAnalysisSchema.safeParse(payload.analysis);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function runFullDspPipeline(
  arrayBuffer: ArrayBuffer,
): Promise<SampleAnalysis> {
  const decoded = await decodeArrayBufferInBrowser(arrayBuffer);
  const analysis = await runDspPipeline({
    arrayBuffer,
    channels: decoded.channels,
    sampleRate: decoded.sampleRate,
    durationSec: decoded.durationSec,
  });
  return SampleAnalysisSchema.parse(analysis);
}

async function enrichDescriptorsAsync(
  analysis: SampleAnalysis,
  sourceName: string | undefined,
): Promise<SampleAnalysis> {
  const existing = descriptorInFlight.get(analysis.source.sha256);
  if (existing) {
    return existing;
  }

  const work = (async () => {
    try {
      const descriptors = await fetchDescriptors(analysis, sourceName);
      if (!descriptors) {
        return analysis;
      }
      const enriched: SampleAnalysis = { ...analysis, llm_descriptors: descriptors };
      await putCachedAnalysis(enriched);
      return enriched;
    } catch {
      return analysis;
    }
  })().finally(() => {
    descriptorInFlight.delete(analysis.source.sha256);
  });

  descriptorInFlight.set(analysis.source.sha256, work);
  return work;
}

async function fetchDescriptors(
  analysis: SampleAnalysis,
  sourceName: string | undefined,
): Promise<LlmDescriptors | null> {
  const response = await fetch("/api/sample-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ analysis, sourceName: sourceName ?? null }),
  });
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { descriptors?: unknown };
  const parsed = LlmDescriptorsSchema.safeParse(data.descriptors);
  return parsed.success ? parsed.data : null;
}

async function loadAudioBytes(sampleId: string): Promise<ArrayBuffer> {
  if (sampleId.startsWith("library:")) {
    const sample = assertLibrarySample(sampleId);
    const response = await fetch(sample.href);
    if (!response.ok) {
      throw new Error(`Could not fetch sample ${sample.name}`);
    }
    return response.arrayBuffer();
  }

  const upload = await getUploadedSample(sampleId);
  if (!upload) {
    throw new Error("Uploaded sample is not available in this browser");
  }
  return upload.arrayBuffer.slice(0);
}

function sampleNameForLlmContext(sampleId: string): string {
  if (sampleId.startsWith("library:")) {
    try {
      return assertLibrarySample(sampleId).name;
    } catch {
      return sampleId;
    }
  }
  return sampleId;
}
