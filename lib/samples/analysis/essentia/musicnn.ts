import * as tf from "@tensorflow/tfjs";
import esPkg from "essentia.js";
import {
  EssentiaTFInputExtractor,
  TensorflowMusiCNN,
} from "essentia.js/dist/essentia.js-model.es.js";

import type { ModelTags, TagScore } from "@/lib/samples/analysis/schema";

const MUSICNN_MODEL_ID = "msd-musicnn-1";

const MODEL_URL =
  process.env.MUSICNN_MODEL_URL
  ?? "https://raw.githubusercontent.com/MTG/essentia.js/master/examples/demos/autotagging-rt/data/msd-musicnn-1/model.json";

export const MSD_MUSICNN_TAGS = [
  "rock",
  "pop",
  "alternative",
  "indie",
  "electronic",
  "female vocalists",
  "dance",
  "00s",
  "alternative rock",
  "jazz",
  "beautiful",
  "metal",
  "chillout",
  "male vocalists",
  "classic rock",
  "soul",
  "indie rock",
  "mellow",
  "electronica",
  "80s",
  "folk",
  "90s",
  "chill",
  "instrumental",
  "punk",
  "oldies",
  "blues",
  "hard rock",
  "ambient",
  "acoustic",
  "experimental",
  "female vocalist",
  "guitar",
  "hip-hop",
  "70s",
  "party",
  "country",
  "easy listening",
  "sexy",
  "catchy",
  "funk",
  "electro",
  "heavy metal",
  "progressive rock",
  "60s",
  "rnb",
  "indie pop",
  "sad",
  "house",
  "happy",
] as const;

const VOICE_TAG_INDICES = [
  MSD_MUSICNN_TAGS.indexOf("female vocalists"),
  MSD_MUSICNN_TAGS.indexOf("male vocalists"),
  MSD_MUSICNN_TAGS.indexOf("female vocalist"),
];

const MODEL_SAMPLE_RATE = 16000;
const MIN_SECONDS = 3;
const TOP_TAG_COUNT = 8;

let modelPromise: Promise<MusicnnModel> | null = null;

type MusicnnModel = {
  model: { predict: (features: unknown, average?: boolean) => Promise<number[][] | number[]> };
};

export function isMusicnnAvailable(): boolean {
  return typeof tf !== "undefined" && typeof TensorflowMusiCNN === "function";
}

export async function runMusicnn(
  channels: Float32Array[],
  sampleRate: number,
): Promise<ModelTags | null> {
  const mono = channels[0] ?? new Float32Array(0);
  if (mono.length / sampleRate < MIN_SECONDS) {
    return null;
  }

  const resampled = sampleRate === MODEL_SAMPLE_RATE
    ? mono
    : downsampleLinear(mono, sampleRate, MODEL_SAMPLE_RATE);

  try {
    const { model } = await getModel();
    const features = computeFeatures(resampled);
    const preds = await model.predict(features, true);
    const flat = Array.isArray(preds[0])
      ? (preds as number[][]).reduce<number[]>((accumulator, row) => {
          if (accumulator.length === 0) {
            return [...row];
          }
          for (let index = 0; index < row.length; index++) {
            accumulator[index] += row[index];
          }
          return accumulator;
        }, [])
      : (preds as number[]);
    const length = Math.max(1, Array.isArray(preds[0]) ? (preds as number[][]).length : 1);
    const averaged = flat.map((value) => value / length);

    const tags = topTags(averaged, TOP_TAG_COUNT);
    const voiceProb = VOICE_TAG_INDICES
      .filter((index) => index >= 0)
      .reduce((max, index) => Math.max(max, averaged[index] ?? 0), 0);

    return {
      musicnn: tags,
      voice_present_prob: clamp01(voiceProb),
      model_id: MUSICNN_MODEL_ID,
    };
  } catch (error) {
    console.warn(
      `[musicnn] inference failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return null;
  }
}

function computeFeatures(mono: Float32Array): unknown {
  const extractor = new EssentiaTFInputExtractor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (esPkg as any).EssentiaWASM,
    "musicnn",
  );
  return extractor.computeFrameWise(mono, 256);
}

async function getModel(): Promise<MusicnnModel> {
  if (modelPromise) {
    return modelPromise;
  }
  modelPromise = (async () => {
    await tf.ready();
    const model = new TensorflowMusiCNN(tf, MODEL_URL);
    await model.initialize();
    return { model };
  })().catch((error) => {
    modelPromise = null;
    throw error;
  });
  return modelPromise;
}

function topTags(scores: number[], count: number): TagScore[] {
  return scores
    .map((score, index) => ({
      label: MSD_MUSICNN_TAGS[index] ?? `tag-${index}`,
      score: clamp01(score),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, count);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function downsampleLinear(
  source: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) {
    return source;
  }
  const ratio = sourceRate / targetRate;
  const length = Math.floor(source.length / ratio);
  const out = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const position = index * ratio;
    const lower = Math.floor(position);
    const upper = Math.min(source.length - 1, lower + 1);
    const t = position - lower;
    out[index] = source[lower] * (1 - t) + source[upper] * t;
  }
  return out;
}
