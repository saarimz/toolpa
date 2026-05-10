import {
  type SynthScene,
  type SynthStep,
  type SynthVoice,
  clamp,
  midiToFrequency,
  midiToNoteName,
} from "./schema";

export type SynthEvent = {
  voiceId: string;
  voiceLabel: string;
  stepIndex: number;
  timeSec: number;
  durationSec: number;
  midi: number;
  note: string | number;
  velocity: number;
  modulationIndex: number;
  partials: number[];
};

export type SynthModulationEvent = {
  barIndex: number;
  timeSec: number;
  phase: number;
  cutoffHz: number;
  resonance: number;
  delayWet: number;
  reverbWet: number;
  chorusDepth: number;
  driveAmount: number;
  modulationScale: number;
  harmonicityShift: number;
  partialMorph: number;
};

export type CollectSynthEventsOptions = {
  random?: () => number;
};

export function getSynthStepDurationSec(scene: Pick<SynthScene, "bpm" | "stepsPerBar">) {
  return 60 / scene.bpm / (scene.stepsPerBar / 4);
}

export function getSynthSceneDurationSec(
  scene: Pick<SynthScene, "bpm" | "bars" | "stepsPerBar">,
) {
  return (60 / scene.bpm) * 4 * scene.bars;
}

export function collectSynthEvents(
  scene: SynthScene,
  options: CollectSynthEventsOptions = {},
): SynthEvent[] {
  const random = options.random ?? Math.random;
  const stepDurationSec = getSynthStepDurationSec(scene);

  return scene.voices.flatMap((voice) =>
    voice.mute
      ? []
      : voice.steps.flatMap((step) => {
          if (!step.active || random() > step.probability) {
            return [];
          }

          return [
            createSynthEvent({
              step,
              stepDurationSec,
              voice,
            }),
          ];
        }),
  );
}

export function collectSynthModulationEvents(scene: SynthScene): SynthModulationEvent[] {
  const beatDurationSec = 60 / scene.bpm;
  const barDurationSec = beatDurationSec * 4;
  const totalBars = scene.bars;

  return Array.from({ length: totalBars }, (_, barIndex) => {
    const phase = totalBars <= 1 ? 0 : barIndex / (totalBars - 1);
    const slowSine = Math.sin(phase * Math.PI * 2);
    const slowCosine = Math.cos(phase * Math.PI * 2);
    const brightLift = scene.macros.brightness * (0.65 + phase * 0.55);
    const drift = scene.macros.analogDrift * slowSine;
    const dubBloom = scene.macros.dubSpace * (0.5 + phase * 0.5);

    return {
      barIndex,
      timeSec: barIndex * barDurationSec,
      phase,
      cutoffHz: clamp(
        scene.effects.filter.cutoffHz * (0.72 + brightLift + drift * 0.2),
        80,
        12000,
      ),
      resonance: clamp(
        scene.effects.filter.resonance * (0.85 + scene.macros.evolution * 0.35),
        0.1,
        18,
      ),
      delayWet: clamp(scene.effects.delay.wet * (0.7 + dubBloom * 0.55), 0, 0.9),
      reverbWet: clamp(scene.effects.reverb.wet * (0.75 + dubBloom * 0.42), 0, 0.9),
      chorusDepth: clamp(scene.effects.chorus.depth * (0.8 + scene.macros.analogDrift * 0.5), 0, 1),
      driveAmount: clamp(scene.effects.drive.amount * (0.85 + scene.macros.brightness * 0.45), 0, 0.9),
      modulationScale: clamp(0.78 + scene.macros.mutationDepth * 0.35 + slowCosine * 0.08, 0.5, 1.5),
      harmonicityShift: clamp(drift * 0.12, -0.25, 0.25),
      partialMorph: clamp(phase * scene.macros.evolution, 0, 1),
    };
  });
}

export function createSynthEvent({
  step,
  stepDurationSec,
  voice,
}: {
  step: SynthStep;
  stepDurationSec: number;
  voice: SynthVoice;
}): SynthEvent {
  const durationSec = Math.max(0.03, step.lengthSteps * stepDurationSec);
  const modulationIndex = clamp(
    voice.patch.modulationIndex + voice.patch.modulationIndex * step.modulationShift * 0.35,
    0,
    48,
  );

  return {
    voiceId: voice.id,
    voiceLabel: voice.label,
    stepIndex: step.step,
    timeSec: Math.max(0, step.step * stepDurationSec + step.microShift * stepDurationSec),
    durationSec,
    midi: step.midi,
    note:
      step.tuningCents === 0
        ? midiToNoteName(step.midi)
        : midiToFrequency(step.midi, step.tuningCents),
    velocity: clamp(step.velocity, 0, 1),
    modulationIndex,
    partials: morphPartials(voice.patch.partials, step.partialMorph),
  };
}

export function morphPartials(partials: number[], amount: number): number[] {
  return partials.map((partial, index) => {
    if (index === 0) {
      return 1;
    }

    const oddBias = index % 2 === 0 ? 0.75 : 1.2;
    const folded = 1 / (index + 1) ** (0.7 + amount * 0.9);
    return clamp(partial * (1 - amount * 0.35) + folded * oddBias * amount, 0, 1);
  });
}
