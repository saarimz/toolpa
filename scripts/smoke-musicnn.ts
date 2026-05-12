import * as tf from "@tensorflow/tfjs";
import esPkg from "essentia.js";
import {
  EssentiaTFInputExtractor,
  TensorflowMusiCNN,
} from "essentia.js/dist/essentia.js-model.es.js";

const MODEL_URL =
  "https://raw.githubusercontent.com/MTG/essentia.js/master/examples/demos/autotagging-rt/data/msd-musicnn-1/model.json";

async function main() {
  console.log("tfjs version:", tf.version.tfjs);
  await tf.ready();
  console.log("backend:", tf.getBackend());

  const sampleRate = 16000;
  const length = sampleRate * 4;
  const pcm = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    pcm[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / sampleRate);
  }

  console.log("loading EssentiaTFInputExtractor…");
  const extractor = new EssentiaTFInputExtractor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (esPkg as any).EssentiaWASM,
    "musicnn",
  );
  const features = extractor.computeFrameWise(pcm, 256);
  console.log("features keys:", Object.keys(features));
  console.log(
    "melSpectrum shape:",
    features.melSpectrum?.length,
    "x",
    features.melSpectrum?.[0]?.length,
  );

  console.log("loading MusiCNN model from URL…");
  const musicnn = new TensorflowMusiCNN(tf, MODEL_URL);
  await musicnn.initialize();
  console.log("model ready");

  const preds = await musicnn.predict(features, true);
  console.log(
    "preds shape:",
    Array.isArray(preds) ? preds.length : "scalar",
    Array.isArray(preds?.[0]) ? `x ${preds[0].length}` : "",
  );
  console.log("first row:", Array.isArray(preds) ? preds[0] : preds);
}

main().catch((error) => {
  console.error("smoke failed:", error?.message ?? error);
  process.exit(1);
});
