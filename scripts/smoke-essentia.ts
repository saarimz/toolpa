import esPkg from "essentia.js";

const essentia = new esPkg.Essentia(esPkg.EssentiaWASM);

console.log("essentia version:", essentia.version);
console.log("algorithm count:", essentia.algorithmNames.split(",").length);

const sampleRate = 44100;
const length = sampleRate;
const pcm = new Float32Array(length);
for (let i = 0; i < length; i++) {
  pcm[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
}

const v1 = essentia.arrayToVector(pcm);
try {
  const key = essentia.KeyExtractor(v1);
  console.log("KeyExtractor:", key.key, key.scale, "strength=", key.strength);
} finally {
  v1.delete();
}

const v2 = essentia.arrayToVector(pcm);
try {
  const ebur = essentia.LoudnessEBUR128(v2, v2);
  console.log("LoudnessEBUR128 integrated:", ebur.integratedLoudness);
} finally {
  v2.delete();
}

const v3 = essentia.arrayToVector(pcm);
try {
  const bpm = essentia.PercivalBpmEstimator(v3);
  console.log("PercivalBpmEstimator:", bpm.bpm);
} finally {
  v3.delete();
}

const v4 = essentia.arrayToVector(pcm);
try {
  const onsets = essentia.OnsetRate(v4);
  console.log("OnsetRate:", onsets.onsetRate);
  if (onsets.onsets?.delete) onsets.onsets.delete();
} finally {
  v4.delete();
}

const v5 = essentia.arrayToVector(pcm.subarray(0, 2048));
try {
  const win = essentia.Windowing(v5);
  const spec = essentia.Spectrum(win.frame);
  const mfcc = essentia.MFCC(spec.spectrum);
  console.log(
    "MFCC bands.size:",
    mfcc.bands?.size?.(),
    "mfcc.size:",
    mfcc.mfcc?.size?.(),
  );
  win.frame.delete();
  spec.spectrum.delete();
  mfcc.bands.delete();
  mfcc.mfcc.delete();
} finally {
  v5.delete();
}

essentia.shutdown();
console.log("done");
