export type EffectPatchDocument = {
  apiVersion: "1.0";
  drive: number;
  filterHz: number;
  mix: number;
};

export const defaultDocument: EffectPatchDocument = {
  apiVersion: "1.0",
  drive: 1.8,
  filterHz: 1800,
  mix: 0.5,
};

export async function renderOffline(
  document: EffectPatchDocument = defaultDocument,
  durationSec = 1,
): Promise<AudioBuffer> {
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("OfflineAudioContext is required for the generated effect audio gate");
  }

  const sampleRate = 44100;
  const context = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);
  const oscillator = context.createOscillator();
  const inputGain = context.createGain();
  const filter = context.createBiquadFilter();
  const dry = context.createGain();
  const wet = context.createGain();
  const shaper = context.createWaveShaper();
  const output = context.createDynamicsCompressor();
  const mix = Math.max(0, Math.min(1, document.mix));

  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(146.83, 0);
  inputGain.gain.setValueAtTime(0.18, 0);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.max(120, Math.min(8000, document.filterHz)), 0);
  filter.Q.setValueAtTime(0.8, 0);
  dry.gain.setValueAtTime(1 - mix, 0);
  wet.gain.setValueAtTime(mix, 0);
  shaper.curve = createDriveCurve(document.drive);
  shaper.oversample = "2x";
  output.threshold.setValueAtTime(-2, 0);
  output.knee.setValueAtTime(0, 0);
  output.ratio.setValueAtTime(18, 0);
  output.attack.setValueAtTime(0.003, 0);
  output.release.setValueAtTime(0.05, 0);

  oscillator.connect(inputGain);
  inputGain.connect(dry);
  inputGain.connect(filter);
  filter.connect(shaper);
  shaper.connect(wet);
  dry.connect(output);
  wet.connect(output);
  output.connect(context.destination);
  oscillator.start(0);
  oscillator.stop(durationSec);

  return context.startRendering();
}

function createDriveCurve(drive: number): Float32Array<ArrayBuffer> {
  const amount = Math.max(0.1, Math.min(8, drive));
  const curve = new Float32Array(
    new ArrayBuffer(1024 * Float32Array.BYTES_PER_ELEMENT),
  );
  for (let index = 0; index < curve.length; index += 1) {
    const x = (index / (curve.length - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * amount) * 0.8;
  }
  return curve;
}

export const renderId = "harmonic-distrotion-effect:audio-stream";
