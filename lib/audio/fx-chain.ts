import {
  collectFxAutomationEvents,
  getFxManifest,
  getFxSlotParams,
  getFxSlotInitialWet,
  hasAudibleFx,
  hasFxSlotPotential,
  normalizeFxPattern,
  resolveFxAutomationWet,
  serializeFxPattern,
  type FxPatternInput,
  type FxSlot,
  type FxSlotId,
} from "@/lib/audio/fx-manifest";

type ToneModule = typeof import("tone");
type ToneFeedbackDelayCtor = typeof import("tone").FeedbackDelay;

type DisposableAudioNode = {
  connect: (destination: unknown) => unknown;
  dispose: () => unknown;
};

type WetToneNode = DisposableAudioNode & {
  wet: AutomatableWetParam;
};

type ToneReverbNode = WetToneNode & {
  ready: Promise<void>;
};

type ToneChorusNode = WetToneNode & {
  depth: number;
  start: () => unknown;
};

type ToneConvolverNode = DisposableAudioNode;

type ToneGainNode = DisposableAudioNode & {
  gain: AutomatableWetParam;
};

type ToneFxStage = {
  input: DisposableAudioNode;
  output: DisposableAudioNode;
  nodes: DisposableAudioNode[];
  setWetAtTime?: (wet: number, timeSec: number, smoothSec: number) => void;
};

export type ToneFxGraph = {
  input: DisposableAudioNode;
  signature: string;
  dispose: () => void;
  setSlotWet: (
    slotId: FxSlotId,
    wet: number,
    timeSec?: number,
    smoothSec?: number,
  ) => void;
};

type AutomatableWetParam = {
  value: number;
  linearRampToValueAtTime?: (value: number, time: number) => unknown;
  setValueAtTime?: (value: number, time: number) => unknown;
};

type OfflineWetStage = {
  input: AudioNode;
  output: AudioNode;
  setWetAtTime?: (wet: number, timeSec: number, smoothSec: number) => void;
};

export async function createToneFxGraph({
  destination,
  fxPattern,
  limiterDb = -1,
  Tone,
}: {
  destination?: unknown;
  fxPattern?: FxPatternInput | null;
  limiterDb?: number;
  Tone: ToneModule;
}): Promise<ToneFxGraph> {
  const pattern = normalizeFxPattern(fxPattern);
  const input = new Tone.Gain(1) as DisposableAudioNode;
  const limiter = new Tone.Limiter(limiterDb) as DisposableAudioNode;
  const nodes: DisposableAudioNode[] = [input];
  const wetControls = new Map<FxSlotId, ToneFxStage["setWetAtTime"]>();
  let tail = input;

  for (const slot of pattern.slots) {
    const stage = await createToneFxStage(Tone, slot);
    if (!stage) {
      continue;
    }
    tail.connect(stage.input);
    tail = stage.output;
    nodes.push(...stage.nodes);
    if (stage.setWetAtTime) {
      wetControls.set(slot.id, stage.setWetAtTime);
    }
  }

  tail.connect(limiter);
  limiter.connect(destination ?? Tone.getDestination());
  nodes.push(limiter);

  return {
    input,
    signature: serializeFxPattern(pattern),
    setSlotWet: (slotId, wet, timeSec = 0, smoothSec = 0) => {
      wetControls.get(slotId)?.(wet, timeSec, smoothSec);
    },
    dispose: () => {
      for (const node of [...nodes].reverse()) {
        node.dispose();
      }
    },
  };
}

export function createOfflineFxOutput({
  bpm,
  context,
  fxPattern,
  limiterDb = -1,
  random = () => 0,
  stepDurationSec,
  totalSteps,
}: {
  bpm: number;
  context: OfflineAudioContext;
  fxPattern?: FxPatternInput | null;
  limiterDb?: number;
  random?: () => number;
  stepDurationSec?: number;
  totalSteps?: number;
}): AudioNode {
  if (!hasAudibleFx(fxPattern)) {
    return createOfflineSafetyLimiter(context, limiterDb);
  }

  const pattern = normalizeFxPattern(fxPattern);
  const input = context.createGain();
  const limiter = createOfflineSafetyLimiter(context, limiterDb);
  const wetControls = new Map<FxSlotId, OfflineWetStage["setWetAtTime"]>();
  let tail: AudioNode = input;

  for (const slot of pattern.slots) {
    const stage = createOfflineFxStage(context, slot, bpm);
    if (!stage) {
      continue;
    }
    tail.connect(stage.input);
    tail = stage.output;
    if (stage.setWetAtTime) {
      wetControls.set(slot.id, stage.setWetAtTime);
    }
  }

  tail.connect(limiter);
  if (stepDurationSec !== undefined && totalSteps !== undefined) {
    for (const event of collectFxAutomationEvents({
      fxPattern: pattern,
      stepDurationSec,
      totalSteps,
    })) {
      wetControls
        .get(event.slotId)
        ?.(resolveFxAutomationWet(event, random), event.timeSec, event.smoothSec);
    }
  }

  return input;
}

async function createToneFxStage(
  Tone: ToneModule,
  slot: FxSlot,
): Promise<ToneFxStage | null> {
  const wet = clamp01(getFxSlotInitialWet(slot));
  if (!hasFxSlotPotential(slot)) {
    return null;
  }

  const manifest = getFxManifest(slot.effect);
  const params = getFxSlotParams(slot);

  if (manifest.model === "delay-line") {
    return createToneDelayStage(Tone, params, wet);
  }
  if (manifest.model === "multi-tap-delay") {
    return createToneCrossDelayStage(Tone, params, wet);
  }
  if (manifest.model === "modulated-delay") {
    return createToneModulatedDelayStage(Tone, params, wet);
  }
  if (manifest.model === "algorithmic-reverb") {
    return createToneReverbStage(Tone, params, wet);
  }
  if (manifest.model === "early-reflection") {
    return createToneReflectionStage(Tone, params, wet, "early");
  }
  if (manifest.model === "gated-reverb" || manifest.model === "reverse-reverb") {
    return createToneReflectionStage(Tone, params, wet, "reverse");
  }
  if (manifest.model === "hybrid-reverb") {
    return createToneHybridReverbStage(Tone, params, wet);
  }
  if (manifest.model === "composite-chain") {
    return createToneSoftFocusStage(Tone, params, wet);
  }
  if (manifest.model === "pan-mod") {
    return createToneAutoPannerStage(Tone, params, wet);
  }
  if (manifest.model === "lofi-sampler") {
    return createToneBitCrusherStage(Tone, params, wet);
  }
  if (manifest.model === "waveshaper-drive") {
    return createToneDistortionStage(Tone, params, wet);
  }
  if (manifest.model === "ring-mod") {
    return createToneRingStage(Tone, params, wet);
  }
  if (manifest.model === "dynamic-filter") {
    return createToneDynamicFilterStage(Tone, params, wet);
  }
  if (manifest.model === "filter-bank-morph") {
    return createToneFilterBankStage(Tone, params, wet);
  }
  if (manifest.model === "slice-gate") {
    return createToneSliceStage(Tone, params, wet);
  }

  return null;
}

function createOfflineFxStage(
  context: OfflineAudioContext,
  slot: FxSlot,
  bpm: number,
): OfflineWetStage | null {
  const wet = clamp01(getFxSlotInitialWet(slot));
  if (!hasFxSlotPotential(slot)) {
    return null;
  }
  const manifest = getFxManifest(slot.effect);
  const params = getFxSlotParams(slot);

  if (manifest.model === "delay-line") {
    return createOfflineDelayStage({
      bpm,
      context,
      delayTime: getStringParam(params.delayTime, "8n."),
      feedback: getNumberParam(params.feedback, 0.42),
      wet,
    });
  }

  if (manifest.model === "multi-tap-delay") {
    return createOfflineCrossDelayStage({
      bpm,
      context,
      delayTime: getStringParam(params.delayTime, "8n."),
      feedback: getNumberParam(params.feedback, 0.46),
      spread: getNumberParam(params.spread, 0.5),
      wet,
    });
  }

  if (manifest.model === "modulated-delay") {
    return createOfflineChorusStage({
      context,
      delayMs: getNumberParam(params.delayMs, 4.5),
      depth: getNumberParam(params.depth, 0.58),
      feedback: getNumberParam(params.feedback, 0),
      frequencyHz: getNumberParam(params.frequencyHz, 0.72),
      wet,
    });
  }

  if (manifest.model === "algorithmic-reverb") {
    return createOfflineConvolverStage({
      context,
      damping: getNumberParam(params.damping, 0.42),
      decaySec: getNumberParam(params.decay, 2.4),
      preDelaySec: getNumberParam(params.preDelay, 0.015),
      wet,
    });
  }

  if (manifest.model === "early-reflection") {
    return createOfflineEarlyReflectionStage({
      context,
      decaySec: getNumberParam(params.decay, 1.4),
      density: getNumberParam(params.density, 0.7),
      preDelaySec: getNumberParam(params.preDelay, 0.02),
      type: getStringParam(params.type, "random"),
      wet,
    });
  }

  if (manifest.model === "hybrid-reverb") {
    const early = createOfflineDelayStage({
      bpm,
      context,
      delayTime: getStringParam(params.delayTime, "32n"),
      feedback: getNumberParam(params.earlyFeedback, 0.18),
      wet: clamp01(wet * 0.45),
    });
    const reverb = createOfflineConvolverStage({
      context,
      damping: getNumberParam(params.damping, 0.42),
      decaySec: getNumberParam(params.decay, 4.8),
      preDelaySec: getNumberParam(params.preDelay, 0.025),
      wet,
    });
    early.output.connect(reverb.input);
    return {
      input: early.input,
      output: reverb.output,
      setWetAtTime: (nextWet, timeSec, smoothSec) => {
        early.setWetAtTime?.(nextWet * 0.45, timeSec, smoothSec);
        reverb.setWetAtTime?.(nextWet, timeSec, smoothSec);
      },
    };
  }

  if (manifest.model === "reverse-reverb" || manifest.model === "gated-reverb") {
    return createOfflineReverseReverbStage({
      context,
      decaySec: getNumberParam(params.decay, 2.8),
      density: getNumberParam(params.density, 0.78),
      gateReleaseSec: getNumberParam(params.gateRelease, 0.2),
      preDelaySec: getNumberParam(params.preDelay, 0.045),
      swell: getNumberParam(params.swell, 0.82),
      wet,
    });
  }

  if (manifest.model === "composite-chain") {
    return createOfflineSoftFocusStage({ context, params, wet });
  }

  if (manifest.model === "pan-mod") {
    return createOfflinePanModStage({ context, params, wet });
  }

  if (manifest.model === "lofi-sampler") {
    return createOfflineLoFiStage({ context, params, wet });
  }

  if (manifest.model === "ring-mod") {
    return createOfflineRingModStage({ context, params, wet });
  }

  if (manifest.model === "dynamic-filter") {
    return createOfflineDynamicFilterStage({ context, params, wet });
  }

  if (manifest.model === "filter-bank-morph") {
    return createOfflineFilterBankStage({ context, params, wet });
  }

  if (manifest.model === "slice-gate") {
    return createOfflineSliceGateStage({ context, params, wet });
  }

  return null;
}

async function createToneReverbStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
) {
  const reverb = new Tone.Reverb({
    decay: getNumberParam(params.decay, 2.4),
    preDelay: getNumberParam(params.preDelay, 0.015),
    wet,
  }) as ToneReverbNode;
  await reverb.ready;
  return {
    input: reverb,
    output: reverb,
    nodes: [reverb],
    setWetAtTime: createToneWetSetter(reverb.wet),
  };
}

function createToneDelayStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const delay = new Tone.FeedbackDelay({
    delayTime: getStringParam(params.delayTime, "8n."),
    feedback: getNumberParam(params.feedback, 0.42),
    wet,
  }) as WetToneNode;
  return {
    input: delay,
    output: delay,
    nodes: [delay],
    setWetAtTime: createToneWetSetter(delay.wet),
  };
}

function createToneCrossDelayStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const DelayCtor =
    (Tone as ToneModule & { PingPongDelay?: ToneFeedbackDelayCtor })
      .PingPongDelay ?? Tone.FeedbackDelay;
  const delay = new DelayCtor({
    delayTime: getStringParam(params.delayTime, "8n."),
    feedback: getNumberParam(params.feedback, 0.46),
    wet,
  }) as WetToneNode;
  return {
    input: delay,
    output: delay,
    nodes: [delay],
    setWetAtTime: createToneWetSetter(delay.wet),
  };
}

function createToneModulatedDelayStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const chorus = new Tone.Chorus({
    delayTime: getNumberParam(params.delayMs, 4.5),
    depth: getNumberParam(params.depth, 0.58),
    feedback: getNumberParam(params.feedback, 0.08),
    frequency: getNumberParam(params.frequencyHz, 0.72),
    wet,
  }) as ToneChorusNode;
  chorus.start();
  return {
    input: chorus,
    output: chorus,
    nodes: [chorus],
    setWetAtTime: createToneWetSetter(chorus.wet),
  };
}

function createToneReflectionStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
  mode: "early" | "reverse",
): ToneFxStage {
  const input = new Tone.Gain(1) as ToneGainNode;
  const output = new Tone.Gain(1) as ToneGainNode;
  const dryGain = new Tone.Gain(1 - wet) as ToneGainNode;
  const wetGain = new Tone.Gain(wet) as ToneGainNode;
  const convolver = new Tone.Convolver(
    mode === "early"
      ? createEarlyReflectionBuffer({
          context: Tone.getContext(),
          decaySec: getNumberParam(params.decay, 1.6),
          density: getNumberParam(params.density, 0.7),
          type: getStringParam(params.type, "random"),
        })
      : createReverseImpulseResponseBuffer({
          context: Tone.getContext(),
          decaySec: getNumberParam(params.decay, 2.8),
          density: getNumberParam(params.density, 0.78),
          gateReleaseSec: getNumberParam(params.gateRelease, 0.2),
          swell: getNumberParam(params.swell, 0.82),
        }),
  ) as ToneConvolverNode;

  input.connect(dryGain);
  dryGain.connect(output);
  input.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    nodes: [input, dryGain, convolver, wetGain, output],
    setWetAtTime: createToneDryWetSetter(dryGain.gain, wetGain.gain),
  };
}

async function createToneHybridReverbStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): Promise<ToneFxStage> {
  const early = new Tone.FeedbackDelay({
    delayTime: getStringParam(params.delayTime, "32n"),
    feedback: getNumberParam(params.earlyFeedback, 0.18),
    wet: clamp01(wet * 0.45),
  }) as WetToneNode;
  const reverb = new Tone.Reverb({
    decay: getNumberParam(params.decay, 4.8),
    preDelay: getNumberParam(params.preDelay, 0.025),
    wet,
  }) as ToneReverbNode;
  early.connect(reverb);
  await reverb.ready;
  return {
    input: early,
    output: reverb,
    nodes: [early, reverb],
    setWetAtTime: (nextWet: number, timeSec: number, smoothSec: number) => {
      createToneWetSetter(early.wet)(nextWet * 0.45, timeSec, smoothSec);
      createToneWetSetter(reverb.wet)(nextWet, timeSec, smoothSec);
    },
  };
}

async function createToneSoftFocusStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): Promise<ToneFxStage> {
  const reverb = new Tone.Reverb({
    decay: getNumberParam(params.decay, 6.8),
    preDelay: 0.035,
    wet: 0.85,
  }) as ToneReverbNode;
  const chorus = new Tone.Chorus({
    delayTime: 11,
    depth: getNumberParam(params.chorusDepth, 0.68),
    frequency: 0.18,
    wet: 0.72,
  }) as ToneChorusNode;
  const pitch = new Tone.PitchShift({
    feedback: 0.04,
    pitch: getNumberParam(params.pitchCents, 700) / 100,
    wet: getNumberParam(params.shimmer, 0.16),
  }) as WetToneNode;
  const delay = new Tone.FeedbackDelay({
    delayTime: getStringParam(params.delayTime, "8n."),
    feedback: 0.18,
    wet: 0.22,
  }) as WetToneNode;
  chorus.start();
  await reverb.ready;
  return wrapToneWetChain(Tone, wet, [reverb, chorus, pitch, delay]);
}

function createToneAutoPannerStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const panner = new Tone.AutoPanner({
    depth: getNumberParam(params.depth, 0.82),
    frequency: getNumberParam(params.frequencyHz, 0.5),
    wet,
  }) as WetToneNode & { start: () => unknown };
  panner.start();
  return {
    input: panner,
    output: panner,
    nodes: [panner],
    setWetAtTime: createToneWetSetter(panner.wet),
  };
}

function createToneBitCrusherStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const crusher = new Tone.BitCrusher(getNumberParam(params.bits, 6)) as WetToneNode;
  crusher.wet.value = wet;
  return {
    input: crusher,
    output: crusher,
    nodes: [crusher],
    setWetAtTime: createToneWetSetter(crusher.wet),
  };
}

function createToneDistortionStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const distortion = new Tone.Distortion({
    distortion: getNumberParam(params.drive, 0.35),
    wet,
  }) as WetToneNode;
  return {
    input: distortion,
    output: distortion,
    nodes: [distortion],
    setWetAtTime: createToneWetSetter(distortion.wet),
  };
}

function createToneRingStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const ring = new Tone.FrequencyShifter({
    frequency: getNumberParam(params.frequencyHz, 44),
    wet,
  }) as WetToneNode;
  return {
    input: ring,
    output: ring,
    nodes: [ring],
    setWetAtTime: createToneWetSetter(ring.wet),
  };
}

function createToneDynamicFilterStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const filter = new Tone.AutoFilter({
    baseFrequency: getNumberParam(params.baseFrequencyHz, 480),
    depth: getNumberParam(params.depth, 0.75),
    frequency: getNumberParam(params.frequencyHz, 1.5),
    octaves: getNumberParam(params.octaves, 3.2),
    wet,
  }) as WetToneNode & { start: () => unknown };
  filter.start();
  return {
    input: filter,
    output: filter,
    nodes: [filter],
    setWetAtTime: createToneWetSetter(filter.wet),
  };
}

function createToneFilterBankStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const morph = getNumberParam(params.morph, 0.5);
  const resonance = getNumberParam(params.resonance, 0.65);
  const filters = createZPlaneSpecs(
    getStringParam(params.frameA, "liquid-bass"),
    getStringParam(params.frameB, "glass-phaser"),
    morph,
    resonance,
  ).map((spec) => {
    const filter = new Tone.Filter(spec.frequencyHz, spec.type) as DisposableAudioNode & {
      Q?: AutomatableWetParam;
      gain?: AutomatableWetParam;
    };
    if (filter.Q) {
      filter.Q.value = spec.q;
    }
    if (filter.gain) {
      filter.gain.value = spec.gainDb;
    }
    return filter;
  });

  return wrapToneWetChain(Tone, wet, filters);
}

function createToneSliceStage(
  Tone: ToneModule,
  params: Record<string, unknown>,
  wet: number,
): ToneFxStage {
  const tremolo = new Tone.Tremolo({
    depth: getNumberParam(params.depth, 0.82),
    frequency: getNumberParam(params.frequencyHz, 8),
    wet,
  }) as WetToneNode & { start: () => unknown };
  tremolo.start();
  return {
    input: tremolo,
    output: tremolo,
    nodes: [tremolo],
    setWetAtTime: createToneWetSetter(tremolo.wet),
  };
}

function wrapToneWetChain(
  Tone: ToneModule,
  wet: number,
  wetNodes: DisposableAudioNode[],
): ToneFxStage {
  const input = new Tone.Gain(1) as ToneGainNode;
  const output = new Tone.Gain(1) as ToneGainNode;
  const dryGain = new Tone.Gain(1 - wet) as ToneGainNode;
  const wetGain = new Tone.Gain(wet) as ToneGainNode;
  let tail: DisposableAudioNode = input;

  input.connect(dryGain);
  dryGain.connect(output);
  for (const node of wetNodes) {
    tail.connect(node);
    tail = node;
  }
  tail.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    nodes: [input, dryGain, ...wetNodes, wetGain, output],
    setWetAtTime: createToneDryWetSetter(dryGain.gain, wetGain.gain),
  };
}

function createOfflineReverseReverbStage({
  context,
  decaySec,
  density,
  gateReleaseSec,
  preDelaySec,
  swell,
  wet,
}: {
  context: OfflineAudioContext;
  decaySec: number;
  density: number;
  gateReleaseSec: number;
  preDelaySec: number;
  swell: number;
  wet: number;
}) {
  const input = context.createGain();
  const output = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const preDelay = context.createDelay(0.5);
  const convolver = context.createConvolver();

  dryGain.gain.setValueAtTime(1 - wet, 0);
  wetGain.gain.setValueAtTime(wet, 0);
  preDelay.delayTime.setValueAtTime(preDelaySec, 0);
  convolver.normalize = true;
  convolver.buffer = createReverseImpulseResponseBuffer({
    context,
    decaySec,
    density,
    gateReleaseSec,
    swell,
  });

  input.connect(dryGain);
  dryGain.connect(output);
  input.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    setWetAtTime: createOfflineWetSetter(dryGain.gain, wetGain.gain),
  };
}

function createOfflineEarlyReflectionStage({
  context,
  decaySec,
  density,
  preDelaySec,
  type,
  wet,
}: {
  context: OfflineAudioContext;
  decaySec: number;
  density: number;
  preDelaySec: number;
  type: string;
  wet: number;
}) {
  const input = context.createGain();
  const output = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const preDelay = context.createDelay(0.5);
  const convolver = context.createConvolver();

  dryGain.gain.setValueAtTime(1 - wet, 0);
  wetGain.gain.setValueAtTime(wet, 0);
  preDelay.delayTime.setValueAtTime(preDelaySec, 0);
  convolver.normalize = true;
  convolver.buffer = createEarlyReflectionBuffer({
    context,
    decaySec,
    density,
    type,
  });

  input.connect(dryGain);
  dryGain.connect(output);
  input.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    setWetAtTime: createOfflineWetSetter(dryGain.gain, wetGain.gain),
  };
}

function createOfflineDelayStage({
  bpm,
  context,
  delayTime,
  feedback,
  wet,
}: {
  bpm: number;
  context: OfflineAudioContext;
  delayTime: string;
  feedback: number;
  wet: number;
}) {
  const input = context.createGain();
  const output = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const delay = context.createDelay(2);
  const feedbackGain = context.createGain();

  dryGain.gain.setValueAtTime(1 - wet, 0);
  wetGain.gain.setValueAtTime(wet, 0);
  delay.delayTime.setValueAtTime(fxDelayTimeToSeconds(delayTime, bpm), 0);
  feedbackGain.gain.setValueAtTime(clamp(feedback, 0, 0.9), 0);

  input.connect(dryGain);
  dryGain.connect(output);
  input.connect(delay);
  delay.connect(feedbackGain);
  feedbackGain.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    setWetAtTime: createOfflineWetSetter(dryGain.gain, wetGain.gain),
  };
}

function createOfflineCrossDelayStage({
  bpm,
  context,
  delayTime,
  feedback,
  spread,
  wet,
}: {
  bpm: number;
  context: OfflineAudioContext;
  delayTime: string;
  feedback: number;
  spread: number;
  wet: number;
}) {
  const input = context.createGain();
  const output = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const leftDelay = context.createDelay(2);
  const rightDelay = context.createDelay(2);
  const feedbackGain = context.createGain();
  const baseDelay = fxDelayTimeToSeconds(delayTime, bpm);

  dryGain.gain.setValueAtTime(1 - wet, 0);
  wetGain.gain.setValueAtTime(wet, 0);
  leftDelay.delayTime.setValueAtTime(baseDelay * clamp(1 - spread * 0.18, 0.5, 1.5), 0);
  rightDelay.delayTime.setValueAtTime(baseDelay * clamp(1 + spread * 0.18, 0.5, 1.5), 0);
  feedbackGain.gain.setValueAtTime(clamp(feedback, 0, 0.9), 0);

  input.connect(dryGain);
  dryGain.connect(output);
  input.connect(leftDelay);
  input.connect(rightDelay);
  leftDelay.connect(feedbackGain);
  rightDelay.connect(feedbackGain);
  feedbackGain.connect(leftDelay);
  feedbackGain.connect(rightDelay);
  leftDelay.connect(wetGain);
  rightDelay.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    setWetAtTime: createOfflineWetSetter(dryGain.gain, wetGain.gain),
  };
}

function createOfflineChorusStage({
  context,
  delayMs,
  depth,
  feedback,
  frequencyHz,
  wet,
}: {
  context: OfflineAudioContext;
  delayMs: number;
  depth: number;
  feedback: number;
  frequencyHz: number;
  wet: number;
}) {
  const input = context.createGain();
  const output = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const delay = context.createDelay(0.05);
  const feedbackGain = context.createGain();
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();

  dryGain.gain.setValueAtTime(1 - wet, 0);
  wetGain.gain.setValueAtTime(wet, 0);
  delay.delayTime.setValueAtTime(clamp(delayMs / 1000, 0.001, 0.045), 0);
  feedbackGain.gain.setValueAtTime(clamp(feedback, 0, 0.85), 0);
  lfo.frequency.setValueAtTime(clamp(frequencyHz, 0.02, 32), 0);
  lfoGain.gain.setValueAtTime(clamp(depth, 0, 1) * 0.0065, 0);

  input.connect(dryGain);
  dryGain.connect(output);
  input.connect(delay);
  delay.connect(feedbackGain);
  feedbackGain.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(output);
  lfo.connect(lfoGain);
  lfoGain.connect(delay.delayTime);
  lfo.start(0);

  return {
    input,
    output,
    setWetAtTime: createOfflineWetSetter(dryGain.gain, wetGain.gain),
  };
}

function createOfflineConvolverStage({
  context,
  damping,
  decaySec,
  preDelaySec,
  wet,
}: {
  context: OfflineAudioContext;
  damping: number;
  decaySec: number;
  preDelaySec: number;
  wet: number;
}) {
  const input = context.createGain();
  const output = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const preDelay = context.createDelay(0.5);
  const convolver = context.createConvolver();

  dryGain.gain.setValueAtTime(1 - wet, 0);
  wetGain.gain.setValueAtTime(wet, 0);
  preDelay.delayTime.setValueAtTime(preDelaySec, 0);
  convolver.normalize = true;
  convolver.buffer = createImpulseResponseBuffer(context, decaySec, damping);

  input.connect(dryGain);
  dryGain.connect(output);
  input.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    setWetAtTime: createOfflineWetSetter(dryGain.gain, wetGain.gain),
  };
}

function createOfflineSoftFocusStage({
  context,
  params,
  wet,
}: {
  context: OfflineAudioContext;
  params: Record<string, unknown>;
  wet: number;
}) {
  const input = context.createGain();
  const output = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const verb = createOfflineConvolverStage({
    context,
    damping: 0.58,
    decaySec: getNumberParam(params.decay, 6.8),
    preDelaySec: 0.035,
    wet: 0.85,
  });
  const chorus = createOfflineChorusStage({
    context,
    delayMs: 11,
    depth: getNumberParam(params.chorusDepth, 0.68),
    feedback: 0.04,
    frequencyHz: 0.18,
    wet: 0.72,
  });
  const delay = createOfflineDelayStage({
    bpm: 120,
    context,
    delayTime: getStringParam(params.delayTime, "8n."),
    feedback: 0.18,
    wet: 0.22,
  });

  dryGain.gain.setValueAtTime(1 - wet, 0);
  wetGain.gain.setValueAtTime(wet, 0);
  input.connect(dryGain);
  dryGain.connect(output);
  input.connect(verb.input);
  verb.output.connect(chorus.input);
  chorus.output.connect(delay.input);
  delay.output.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    setWetAtTime: createOfflineWetSetter(dryGain.gain, wetGain.gain),
  };
}

function createOfflinePanModStage({
  context,
  params,
  wet,
}: {
  context: OfflineAudioContext;
  params: Record<string, unknown>;
  wet: number;
}) {
  const panner = context.createStereoPanner();
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  lfo.frequency.setValueAtTime(getNumberParam(params.frequencyHz, 0.5), 0);
  lfoGain.gain.setValueAtTime(getNumberParam(params.depth, 0.82), 0);
  lfo.connect(lfoGain);
  lfoGain.connect(panner.pan);
  lfo.start(0);
  return wrapOfflineWetChain(context, wet, [panner]);
}

function createOfflineLoFiStage({
  context,
  params,
  wet,
}: {
  context: OfflineAudioContext;
  params: Record<string, unknown>;
  wet: number;
}) {
  const shaper = context.createWaveShaper();
  const lowpass = context.createBiquadFilter();
  shaper.curve = createBitCrushCurve(getNumberParam(params.bits, 6));
  shaper.oversample = "none";
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(getNumberParam(params.toneHz, 6200), 0);
  shaper.connect(lowpass);
  return wrapOfflineWetChain(context, wet, [shaper, lowpass]);
}

function createOfflineRingModStage({
  context,
  params,
  wet,
}: {
  context: OfflineAudioContext;
  params: Record<string, unknown>;
  wet: number;
}) {
  const ringGain = context.createGain();
  const carrier = context.createOscillator();
  const tone = context.createBiquadFilter();
  ringGain.gain.setValueAtTime(0, 0);
  carrier.frequency.setValueAtTime(getNumberParam(params.frequencyHz, 44), 0);
  carrier.connect(ringGain.gain);
  carrier.start(0);
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(getNumberParam(params.toneHz, 4200), 0);
  ringGain.connect(tone);
  return wrapOfflineWetChain(context, wet, [ringGain, tone]);
}

function createOfflineDynamicFilterStage({
  context,
  params,
  wet,
}: {
  context: OfflineAudioContext;
  params: Record<string, unknown>;
  wet: number;
}) {
  const filter = context.createBiquadFilter();
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(getNumberParam(params.baseFrequencyHz, 480), 0);
  filter.Q.setValueAtTime(getNumberParam(params.q, 5.5), 0);
  lfo.frequency.setValueAtTime(getNumberParam(params.frequencyHz, 1.5), 0);
  lfoGain.gain.setValueAtTime(getNumberParam(params.depth, 0.75) * 2200, 0);
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start(0);
  return wrapOfflineWetChain(context, wet, [filter]);
}

function createOfflineFilterBankStage({
  context,
  params,
  wet,
}: {
  context: OfflineAudioContext;
  params: Record<string, unknown>;
  wet: number;
}) {
  const specs = createZPlaneSpecs(
    getStringParam(params.frameA, "liquid-bass"),
    getStringParam(params.frameB, "glass-phaser"),
    getNumberParam(params.morph, 0.5),
    getNumberParam(params.resonance, 0.65),
  );
  const filters = specs.map((spec) => {
    const filter = context.createBiquadFilter();
    filter.type = spec.type;
    filter.frequency.setValueAtTime(spec.frequencyHz, 0);
    filter.Q.setValueAtTime(spec.q, 0);
    filter.gain.setValueAtTime(spec.gainDb, 0);
    return filter;
  });
  return wrapOfflineWetChain(context, wet, filters);
}

function createOfflineSliceGateStage({
  context,
  params,
  wet,
}: {
  context: OfflineAudioContext;
  params: Record<string, unknown>;
  wet: number;
}) {
  const gate = context.createGain();
  const lfo = context.createOscillator();
  const lfoGain = context.createGain();
  gate.gain.setValueAtTime(1 - getNumberParam(params.depth, 0.82) * 0.5, 0);
  lfo.frequency.setValueAtTime(getNumberParam(params.frequencyHz, 8), 0);
  lfoGain.gain.setValueAtTime(getNumberParam(params.depth, 0.82) * 0.5, 0);
  lfo.connect(lfoGain);
  lfoGain.connect(gate.gain);
  lfo.start(0);
  return wrapOfflineWetChain(context, wet, [gate]);
}

function wrapOfflineWetChain(
  context: OfflineAudioContext,
  wet: number,
  wetNodes: AudioNode[],
) {
  const input = context.createGain();
  const output = context.createGain();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  let tail: AudioNode = input;

  dryGain.gain.setValueAtTime(1 - wet, 0);
  wetGain.gain.setValueAtTime(wet, 0);
  input.connect(dryGain);
  dryGain.connect(output);
  for (const node of wetNodes) {
    tail.connect(node);
    tail = node;
  }
  tail.connect(wetGain);
  wetGain.connect(output);

  return {
    input,
    output,
    setWetAtTime: createOfflineWetSetter(dryGain.gain, wetGain.gain),
  };
}

function createImpulseResponseBuffer(
  context: OfflineAudioContext,
  decaySec: number,
  damping = 0.42,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.ceil(sampleRate * clamp(decaySec, 0.2, 12)));
  const buffer = context.createBuffer(2, length, sampleRate);
  const damp = clamp(damping, 0, 1);
  let seed = 112358;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = (seed / 0xffffffff) * 2 - 1;
      const envelope = (1 - index / length) ** 2.35;
      const tone = 1 - damp * (index / length) ** 0.55;
      data[index] = noise * envelope * tone;
    }
  }

  return buffer;
}

function createEarlyReflectionBuffer({
  context,
  decaySec,
  density,
  type,
}: {
  context: Pick<BaseAudioContext, "createBuffer" | "sampleRate">;
  decaySec: number;
  density: number;
  type: string;
}): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.ceil(sampleRate * clamp(decaySec, 0.08, 4)));
  const buffer = context.createBuffer(2, length, sampleRate);
  const densityAmount = clamp(density, 0, 1);
  const tapCount = Math.round(16 + densityAmount * 80);
  let seed = 314159;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let tap = 0; tap < tapCount; tap += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const random = seed / 0xffffffff;
      const progress = getReflectionProgress(type, random, tap, tapCount);
      const index = Math.min(length - 1, Math.round(progress * (length - 1)));
      const polarity = (tap + channel) % 2 === 0 ? 1 : -1;
      const channelSkew = channel === 0 ? 0.96 : 1.04;
      data[index] += polarity * channelSkew * (1 - progress) ** 0.7 * 0.42;
    }
  }

  return buffer;
}

function createReverseImpulseResponseBuffer({
  context,
  decaySec,
  density,
  gateReleaseSec = 0.2,
  swell,
}: {
  context: Pick<BaseAudioContext, "createBuffer" | "sampleRate">;
  decaySec: number;
  density: number;
  gateReleaseSec?: number;
  swell: number;
}): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.ceil(sampleRate * clamp(decaySec, 0.2, 6)));
  const buffer = context.createBuffer(2, length, sampleRate);
  const densityAmount = clamp(density, 0, 1);
  const swellPower = 1.2 + clamp(swell, 0, 1) * 4.2;
  let seed = 271828;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const progress = length <= 1 ? 1 : index / (length - 1);
      const noise = (seed / 0xffffffff) * 2 - 1;
      const sparseHold = densityAmount + (1 - densityAmount) * progress;
      const sparkle = Math.sin(progress * Math.PI * (channel + 3) * 11) * 0.07;
      const envelope = progress ** swellPower;
      const releaseStart = 1 - clamp(gateReleaseSec / decaySec, 0.03, 0.8);
      const gate =
        progress < releaseStart
          ? 1
          : clamp(1 - (progress - releaseStart) / (1 - releaseStart), 0, 1);
      data[index] = (noise * sparseHold + sparkle) * envelope * gate * 0.72;
    }
  }

  return buffer;
}

type ZPlaneFilterSpec = {
  frequencyHz: number;
  gainDb: number;
  q: number;
  type: BiquadFilterType;
};

const zPlaneFrames: Record<string, ZPlaneFilterSpec[]> = {
  "glass-phaser": [
    { frequencyHz: 420, gainDb: -5, q: 8, type: "notch" },
    { frequencyHz: 1180, gainDb: 4, q: 7, type: "peaking" },
    { frequencyHz: 3100, gainDb: -7, q: 11, type: "notch" },
    { frequencyHz: 7200, gainDb: 3, q: 4, type: "peaking" },
  ],
  "liquid-bass": [
    { frequencyHz: 92, gainDb: 5, q: 2.4, type: "lowshelf" },
    { frequencyHz: 280, gainDb: 7, q: 8, type: "peaking" },
    { frequencyHz: 860, gainDb: -4, q: 5, type: "notch" },
    { frequencyHz: 2400, gainDb: 2, q: 3, type: "peaking" },
  ],
  "notch-sweep": [
    { frequencyHz: 190, gainDb: -8, q: 10, type: "notch" },
    { frequencyHz: 740, gainDb: -9, q: 12, type: "notch" },
    { frequencyHz: 1800, gainDb: 4, q: 6, type: "peaking" },
    { frequencyHz: 5200, gainDb: -5, q: 8, type: "notch" },
  ],
  "vocal-peaks": [
    { frequencyHz: 740, gainDb: 6, q: 7, type: "peaking" },
    { frequencyHz: 1220, gainDb: 8, q: 9, type: "peaking" },
    { frequencyHz: 2600, gainDb: 5, q: 6, type: "peaking" },
    { frequencyHz: 6100, gainDb: -3, q: 3, type: "peaking" },
  ],
};

function createZPlaneSpecs(
  frameA: string,
  frameB: string,
  morph: number,
  resonance: number,
): ZPlaneFilterSpec[] {
  const left = zPlaneFrames[frameA] ?? zPlaneFrames["liquid-bass"];
  const right = zPlaneFrames[frameB] ?? zPlaneFrames["glass-phaser"];
  const amount = clamp(morph, 0, 1);
  const qLift = 0.65 + clamp(resonance, 0, 1) * 1.45;

  return left.map((spec, index) => {
    const target = right[index] ?? spec;
    return {
      frequencyHz: interpolateExp(spec.frequencyHz, target.frequencyHz, amount),
      gainDb: spec.gainDb + (target.gainDb - spec.gainDb) * amount,
      q: clamp((spec.q + (target.q - spec.q) * amount) * qLift, 0.1, 24),
      type: target.type === spec.type ? spec.type : amount < 0.5 ? spec.type : target.type,
    };
  });
}

function createBitCrushCurve(bits: number): Float32Array<ArrayBuffer> {
  const length = 2048;
  const curve = new Float32Array(
    new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT),
  );
  const steps = 2 ** clamp(Math.round(bits), 1, 16);

  for (let index = 0; index < length; index += 1) {
    const input = (index / (length - 1)) * 2 - 1;
    curve[index] = Math.round(input * steps) / steps;
  }

  return curve;
}

function interpolateExp(left: number, right: number, amount: number) {
  if (left <= 0 || right <= 0) {
    return left + (right - left) * amount;
  }

  return left * (right / left) ** amount;
}

function getReflectionProgress(
  type: string,
  random: number,
  tap: number,
  tapCount: number,
) {
  if (type === "reverse") {
    return 1 - (tap + 1) / (tapCount + 1);
  }
  if (type === "plate") {
    return (tap / Math.max(1, tapCount - 1)) ** 0.72;
  }
  if (type === "hall") {
    return random ** 1.35;
  }

  return random;
}

function createOfflineSafetyLimiter(
  context: OfflineAudioContext,
  limiterDb: number,
): AudioNode {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(limiterDb, 0);
  limiter.knee.setValueAtTime(0, 0);
  limiter.ratio.setValueAtTime(20, 0);
  limiter.attack.setValueAtTime(0.003, 0);
  limiter.release.setValueAtTime(0.03, 0);
  limiter.connect(context.destination);
  return limiter;
}

function createToneWetSetter(param: AutomatableWetParam) {
  return (wet: number, timeSec: number, smoothSec: number) => {
    setToneWetAtTime(param, wet, timeSec, smoothSec);
  };
}

function createToneDryWetSetter(
  dryParam: AutomatableWetParam,
  wetParam: AutomatableWetParam,
) {
  return (wet: number, timeSec: number, smoothSec: number) => {
    const clamped = clamp01(wet);
    setToneWetAtTime(dryParam, 1 - clamped, timeSec, smoothSec);
    setToneWetAtTime(wetParam, clamped, timeSec, smoothSec);
  };
}

function setToneWetAtTime(
  param: AutomatableWetParam,
  wet: number,
  timeSec: number,
  smoothSec: number,
) {
  const clamped = clamp01(wet);
  const startTime = Math.max(0, Number.isFinite(timeSec) ? timeSec : 0);
  const endTime = startTime + Math.max(0, smoothSec);

  if (smoothSec > 0 && param.linearRampToValueAtTime) {
    param.linearRampToValueAtTime(clamped, endTime);
    return;
  }

  if (param.setValueAtTime) {
    param.setValueAtTime(clamped, startTime);
    return;
  }

  param.value = clamped;
}

function createOfflineWetSetter(dryGain: AudioParam, wetGain: AudioParam) {
  return (wet: number, timeSec: number, smoothSec: number) => {
    setOfflineWetAtTime(dryGain, wetGain, wet, timeSec, smoothSec);
  };
}

function setOfflineWetAtTime(
  dryGain: AudioParam,
  wetGain: AudioParam,
  wet: number,
  timeSec: number,
  smoothSec: number,
) {
  const clamped = clamp01(wet);
  const startTime = Math.max(0, timeSec);
  const endTime = startTime + Math.max(0, smoothSec);

  if (smoothSec > 0) {
    dryGain.linearRampToValueAtTime(1 - clamped, endTime);
    wetGain.linearRampToValueAtTime(clamped, endTime);
    return;
  }

  dryGain.setValueAtTime(1 - clamped, startTime);
  wetGain.setValueAtTime(clamped, startTime);
}

export function fxDelayTimeToSeconds(value: string, bpm: number): number {
  const quarter = 60 / clamp(bpm, 40, 260);
  if (value === "32n") {
    return quarter / 8;
  }
  if (value === "16n") {
    return quarter / 4;
  }
  if (value === "8n") {
    return quarter / 2;
  }
  if (value === "8n.") {
    return quarter * 0.75;
  }
  if (value === "4n") {
    return quarter;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0.01, 2) : quarter / 2;
}

function getNumberParam(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getStringParam(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
