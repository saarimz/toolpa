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
};

const inFlight = new Map<string, Promise<SampleAnalysis>>();

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
      return baked;
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
    waitForDescriptors: options.waitForDescriptors ?? false,
    sourceName: sampleNameForLlmContext(sampleId),
  });
}

export type AnalyzeOptions = {
  waitForDescriptors?: boolean;
  sourceName?: string;
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

  const baseline = cached ?? (await runFullDspPipeline(arrayBuffer));
  if (!cached) {
    await putCachedAnalysis(baseline);
  }

  if (baseline.llm_descriptors) {
    return baseline;
  }

  if (!options.waitForDescriptors) {
    void enrichDescriptorsAsync(baseline, options.sourceName).catch(() => {});
    return baseline;
  }

  return enrichDescriptorsAsync(baseline, options.sourceName);
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
