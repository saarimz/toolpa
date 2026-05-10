import { assertLibrarySample } from "@/lib/samples/library";
import { getUploadedSample } from "@/lib/samples/storage";

export type ResolvedSample = {
  id: string;
  name: string;
  audioBuffer: AudioBuffer;
  origin: "library" | "upload";
};

let sharedAudioContext: AudioContext | null = null;
const decodedCache = new Map<string, Promise<ResolvedSample>>();

export function getSharedAudioContext(): AudioContext {
  if (typeof window === "undefined") {
    throw new Error("AudioContext is only available in the browser");
  }

  sharedAudioContext ??= new AudioContext();
  return sharedAudioContext;
}

async function decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const context = getSharedAudioContext();
  return context.decodeAudioData(arrayBuffer.slice(0));
}

export async function resolveSample(sampleId: string): Promise<ResolvedSample> {
  const cached = decodedCache.get(sampleId);
  if (cached) {
    return cached;
  }

  const promise = sampleId.startsWith("library:")
    ? resolveLibrarySample(sampleId)
    : resolveUploadedSample(sampleId);
  decodedCache.set(sampleId, promise);
  return promise;
}

async function resolveLibrarySample(sampleId: string): Promise<ResolvedSample> {
  const sample = assertLibrarySample(sampleId);
  const response = await fetch(sample.href);

  if (!response.ok) {
    throw new Error(`Could not fetch sample ${sample.name}`);
  }

  return {
    id: sample.id,
    name: sample.name,
    audioBuffer: await decodeAudioData(await response.arrayBuffer()),
    origin: "library",
  };
}

async function resolveUploadedSample(sampleId: string): Promise<ResolvedSample> {
  const sample = await getUploadedSample(sampleId);
  if (!sample) {
    throw new Error("Uploaded sample is not available in this browser");
  }

  return {
    id: sample.id,
    name: sample.name,
    audioBuffer: await decodeAudioData(sample.arrayBuffer),
    origin: "upload",
  };
}

export function clearResolvedSampleCache() {
  decodedCache.clear();
}
