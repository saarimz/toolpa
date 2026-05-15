import {
  collectSynthEvents,
  getSynthSceneDurationSec,
  getSynthStepDurationSec,
} from "@/app/tools/evolving-fm-synth/lib/events";
import {
  midiToFrequency,
  type SynthScene,
  type SynthVoice,
} from "@/app/tools/evolving-fm-synth/lib/schema";
import { createOfflineFxOutput } from "@/lib/audio/fx-chain";
import type { FxPatternInput } from "@/lib/audio/fx-manifest";
import {
  encodeAudioBufferToWav,
  normalizeAudioBufferPeak,
} from "@/lib/audio/wav-render";

export type RenderSynthSceneWavOptions = {
  durationSec?: number;
  fxPattern?: FxPatternInput | null;
  maxDurationSec?: number;
  sampleRate?: number;
};

export async function renderSynthSceneToWav(
  scene: SynthScene,
  options: RenderSynthSceneWavOptions = {},
): Promise<Blob> {
  const audioBuffer = await renderSynthSceneToAudioBuffer(scene, options);
  return new Blob([encodeAudioBufferToWav(normalizeAudioBufferPeak(audioBuffer))], {
    type: "audio/wav",
  });
}

export async function renderSynthSceneToAudioBuffer(
  scene: SynthScene,
  options: RenderSynthSceneWavOptions = {},
): Promise<AudioBuffer> {
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("OfflineAudioContext is not available in this browser");
  }

  const sampleRate = options.sampleRate ?? 44100;
  const sceneDurationSec = getSynthSceneDurationSec(scene);
  const renderDurationSec =
    options.durationSec ??
    Math.min(sceneDurationSec, options.maxDurationSec ?? sceneDurationSec) +
      getSynthReleaseTailSec(scene);
  const context = new OfflineAudioContext(
    2,
    Math.ceil(renderDurationSec * sampleRate),
    sampleRate,
  );
  const output = createOfflineFxOutput({
    bpm: scene.bpm,
    context,
    fxPattern: options.fxPattern,
    limiterDb: scene.effects.masterDb,
    stepDurationSec: getSynthStepDurationSec(scene),
    totalSteps: scene.bars * scene.stepsPerBar,
  });
  const voicesById = new Map(scene.voices.map((voice) => [voice.id, voice]));

  for (const event of collectSynthEvents(scene, { random: () => 0 })) {
    const voice = voicesById.get(event.voiceId);
    if (!voice || event.timeSec > renderDurationSec) {
      continue;
    }

    scheduleSynthVoiceEvent({
      context,
      event,
      output,
      scene,
      voice,
    });
  }

  return context.startRendering();
}

type OfflineSynthEvent = ReturnType<typeof collectSynthEvents>[number];

function scheduleSynthVoiceEvent({
  context,
  event,
  output,
  scene,
  voice,
}: {
  context: OfflineAudioContext;
  event: OfflineSynthEvent;
  output: AudioNode;
  scene: SynthScene;
  voice: SynthVoice;
}) {
  const carrier = context.createOscillator();
  const gain = context.createGain();
  const panner = context.createStereoPanner();
  const filter = context.createBiquadFilter();
  const startTime = Math.max(0, event.timeSec);
  const releaseSec = Math.max(0.02, voice.patch.release);
  const stopTime = startTime + event.durationSec + releaseSec;
  const frequency =
    typeof event.note === "number" ? event.note : midiToFrequency(event.midi);
  const targetGain =
    event.velocity * dbToGain(voice.gainDb) * dbToGain(scene.effects.masterDb) * 0.42;

  carrier.frequency.setValueAtTime(frequency, startTime);
  carrier.detune.setValueAtTime(voice.patch.detuneCents, startTime);
  carrier.setPeriodicWave(createPeriodicWave(context, event.partials));
  panner.pan.setValueAtTime(voice.pan, startTime);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(scene.effects.filter.cutoffHz, startTime);
  filter.Q.setValueAtTime(scene.effects.filter.resonance, startTime);
  scheduleSynthEnvelope(gain.gain, {
    attackSec: voice.patch.attack,
    decaySec: voice.patch.decay,
    durationSec: event.durationSec,
    releaseSec,
    startTime,
    sustain: voice.patch.sustain,
    targetGain,
  });

  carrier.connect(gain);
  gain.connect(panner);
  panner.connect(filter);
  filter.connect(output);

  if (event.modulationIndex > 0) {
    const modulator = context.createOscillator();
    const modulationGain = context.createGain();
    modulator.frequency.setValueAtTime(
      frequency * voice.patch.harmonicity,
      startTime,
    );
    modulationGain.gain.setValueAtTime(event.modulationIndex * 6, startTime);
    modulator.connect(modulationGain);
    modulationGain.connect(carrier.frequency);
    modulator.start(startTime);
    modulator.stop(stopTime);
  }

  carrier.start(startTime);
  carrier.stop(stopTime);
}

function scheduleSynthEnvelope(
  gain: AudioParam,
  {
    attackSec,
    decaySec,
    durationSec,
    releaseSec,
    startTime,
    sustain,
    targetGain,
  }: {
    attackSec: number;
    decaySec: number;
    durationSec: number;
    releaseSec: number;
    startTime: number;
    sustain: number;
    targetGain: number;
  },
) {
  const attackEnd = startTime + Math.max(0.001, Math.min(attackSec, durationSec * 0.45));
  const decayEnd = Math.min(
    startTime + durationSec,
    attackEnd + Math.max(0.001, decaySec),
  );
  const releaseStart = startTime + durationSec;
  const endTime = releaseStart + releaseSec;
  const sustainGain = targetGain * sustain;

  gain.cancelScheduledValues(startTime);
  gain.setValueAtTime(0, startTime);
  gain.linearRampToValueAtTime(targetGain, attackEnd);
  gain.linearRampToValueAtTime(sustainGain, decayEnd);
  gain.setValueAtTime(sustainGain, releaseStart);
  gain.linearRampToValueAtTime(0, endTime);
}

function createPeriodicWave(
  context: OfflineAudioContext,
  partials: number[],
): PeriodicWave {
  const real = new Float32Array(partials.length + 1);
  const imaginary = new Float32Array(partials.length + 1);
  partials.forEach((partial, index) => {
    imaginary[index + 1] = partial;
  });

  return context.createPeriodicWave(real, imaginary, {
    disableNormalization: false,
  });
}

function getSynthReleaseTailSec(scene: SynthScene) {
  const maxRelease = Math.max(
    ...scene.voices.map((voice) => voice.patch.release),
    scene.effects.reverb.decay * scene.effects.reverb.wet,
    scene.effects.delay.feedback * 2,
    0.25,
  );

  return Math.min(8, maxRelease + 0.25);
}

function dbToGain(value: number) {
  return 10 ** (value / 20);
}
