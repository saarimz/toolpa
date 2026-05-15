import {
  getScaleDefinition,
  getScaleDefinitions,
  getScalePitchOffsets,
  searchScaleKeys,
} from "@/lib/music/scale-catalog";
import { MAX_BPM, MIN_BPM, type GlobalMusicContext } from "@/lib/music/context";
import {
  SynthSceneSchema,
  type EvolutionBars,
  type SynthEffects,
  type SynthMacros,
  type SynthRootWaveform,
  type SynthScale,
  type SynthScene,
  type SynthStep,
  type SynthVoice,
  type VoicePatch,
  clamp,
  clampInt,
  getScaleDisplayName,
  getStepsPerBarForEvolutionBars,
  keyToMidiRoot,
  midiToNoteName,
  normalizeKey,
  noteNameToMidi,
} from "./schema";

export type GenerateSynthSceneInput = {
  prompt: string;
  musicalContext?: GlobalMusicContext | null;
  previousScene?: SynthScene | null;
  seed?: number;
};

type SynthPitch = {
  midi: number;
  tuningCents: number;
};

type TimbreProfile = {
  grit: number;
  metal: number;
  warmth: number;
};

export function buildEvolvingFmSynthSystemPrompt() {
  return [
    "You are the evolving-fm-synth L1 agent inside toolpa.",
    "Generate an interpretable browser synth state, not opaque audio.",
    "Control key, scale, BPM, MIDI notes, FM carrier root waveform, modulator waveform, wavetable partials, effects, and variation macros.",
    "Treat bars as the long-form evolution cycle: 4, 8, 16, 32, 64, or 128 bars.",
    "Prefer gradual bar-by-bar modulation over replacing the whole scene while playback is running.",
    "Dub techno should favor minor or dorian roots, low-pass motion, chord stabs, feedback delay, and long reverb.",
    "Use the metadata.agentPlan field to explain the agentic control passes.",
  ].join("\n");
}

export function buildEvolvingFmSynthPrompt({
  musicalContext,
  prompt,
  scene,
}: {
  musicalContext?: GlobalMusicContext | null;
  prompt: string;
  scene: SynthScene;
}) {
  const globalScale = musicalContext
    ? getScaleDefinition(musicalContext.key.scaleId)
    : null;

  return [
    `user prompt: ${prompt || "generate an evolving dub techno FM wavetable patch"}`,
    `current key: ${scene.key} ${scene.scale}`,
    `current tempo: ${scene.bpm} BPM`,
    musicalContext
      ? `global music context: ${musicalContext.key.tonic} ${globalScale?.name ?? musicalContext.key.scaleId}, ${musicalContext.bpm} BPM, swing ${musicalContext.swing}`
      : "",
    `current evolution cycle: ${scene.bars} bars`,
    `current macros: ${JSON.stringify(scene.macros)}`,
    `current voices: ${scene.voices.map((voice) => `${voice.id}:${voice.role}:root=${voice.patch.rootWaveform}`).join(", ")}`,
    "Return a SynthScene JSON object with playable MIDI steps and compact rationale.",
  ].filter(Boolean).join("\n");
}

export function createDefaultSynthScene(prompt = "dub techno evolving chord machine") {
  return generateSynthSceneFromPrompt({ prompt, seed: 72417 });
}

export function generateSynthSceneFromPrompt({
  musicalContext,
  prompt,
  previousScene = null,
  seed,
}: GenerateSynthSceneInput): SynthScene {
  const normalizedPrompt = prompt.trim();
  const plan = createAgentPlan(normalizedPrompt);
  const nextSeed =
    seed ??
    (previousScene
      ? (previousScene.seed + 7919) % 999999
      : hashString(normalizedPrompt || "evolving-fm-synth"));
  const random = createSeededRandom(nextSeed);
  const key = parseKey(normalizedPrompt) ?? musicalContext?.key.tonic ?? previousScene?.key ?? "C";
  const scale =
    parseScale(normalizedPrompt) ??
    musicalContext?.key.scaleId ??
    previousScene?.scale ??
    inferScale(normalizedPrompt);
  const bpm = parseBpm(normalizedPrompt) ?? musicalContext?.bpm ?? previousScene?.bpm ?? inferBpm(normalizedPrompt);
  const macros = inferMacros(normalizedPrompt, previousScene?.macros);
  const effects = inferEffects(normalizedPrompt, macros, previousScene?.effects);
  const explicitNotes = parsePromptNotes(normalizedPrompt);
  const rootWaveform = parseRootWaveform(normalizedPrompt);
  const timbreProfile = inferTimbreProfile(normalizedPrompt);
  const rationaleRootWaveform =
    rootWaveform ??
    previousScene?.voices[0]?.patch.rootWaveform ??
    chooseDefaultRootWaveform("bass", timbreProfile, random);
  const rootMidi = keyToMidiRoot(key, normalizedPrompt.toLowerCase().includes("sub") ? 1 : 2);
  const bars = parseEvolutionBars(normalizedPrompt) ??
    previousScene?.bars ??
    inferEvolutionBars(normalizedPrompt);
  const stepsPerBar = getStepsPerBarForEvolutionBars(bars);
  const totalSteps = bars * stepsPerBar;
  const sustained = inferSustained(normalizedPrompt);
  const voices = buildVoices({
    explicitNotes,
    macros,
    previousVoices: previousScene?.voices,
    random,
    rootMidi,
    rootWaveform,
    scale,
    stepsPerBar,
    sustained,
    timbreProfile,
    totalSteps,
  });

  return SynthSceneSchema.parse({
    id: `evolving-fm-${nextSeed}`,
    name: nameFromPrompt(normalizedPrompt, key, scale),
    bpm,
    swing: musicalContext?.swing ?? inferSwing(normalizedPrompt, previousScene?.swing),
    key: normalizeKey(key),
    scale,
    bars,
    stepsPerBar,
    seed: nextSeed,
    macros,
    effects,
    voices,
    metadata: {
      createdBy: "local-agent",
      prompt: normalizedPrompt,
      rationale: createRationale({
        prompt: normalizedPrompt,
        key,
        scale,
        bpm,
        bars,
        macros,
        rootWaveform: rationaleRootWaveform,
        timbreProfile,
      }),
      influences: inferInfluences(normalizedPrompt),
      agentPlan: plan,
      researchBasis: [
        "DDSP-style neural control mapped to interpretable oscillator, filter, delay, and reverb parameters.",
        "Latent-synth ideas mapped to macro controls for brightness, density, drift, and dub space.",
        "Recent controllable-audio systems inspire explicit pitch, timbre, and loudness trajectories.",
      ],
    },
  });
}

export function evolveSynthScene(
  scene: SynthScene,
  prompt: string,
  musicalContext?: GlobalMusicContext | null,
): SynthScene {
  const evolved = generateSynthSceneFromPrompt({
    musicalContext,
    prompt: prompt.trim() || scene.metadata.prompt || "evolve this synth slowly",
    previousScene: scene,
  });

  return SynthSceneSchema.parse({
    ...evolved,
    id: `evolving-fm-${evolved.seed}`,
    name: `${scene.name} / variation ${evolved.seed % 97}`,
    metadata: {
      ...evolved.metadata,
      rationale: `${evolved.metadata.rationale} Variation keeps the previous scene as a reference and mutates notes, partials, and effects.`,
    },
  });
}

export function updateSceneMacro(
  scene: SynthScene,
  macro: keyof SynthMacros,
  value: number,
): SynthScene {
  const macros = { ...scene.macros, [macro]: clamp(value, 0, 1) };

  return SynthSceneSchema.parse({
    ...scene,
    macros,
    effects: inferEffects(scene.metadata.prompt, macros, scene.effects),
  });
}

export function updateSceneBpm(scene: SynthScene, bpm: number): SynthScene {
  return SynthSceneSchema.parse({ ...scene, bpm: clampInt(bpm, MIN_BPM, MAX_BPM) });
}

export function updateSceneEvolutionBars(
  scene: SynthScene,
  bars: EvolutionBars,
): SynthScene {
  const stepsPerBar = getStepsPerBarForEvolutionBars(bars);
  const totalSteps = bars * stepsPerBar;

  return SynthSceneSchema.parse({
    ...scene,
    bars,
    stepsPerBar,
    voices: scene.voices.map((voice) => ({
      ...voice,
      steps: resizeSynthSteps(voice.steps, totalSteps),
    })),
    metadata: {
      ...scene.metadata,
      rationale: `${scene.metadata.rationale} Evolution cycle set to ${bars} bars with bar-level modulation.`,
    },
  });
}

export function updateSceneKey(
  scene: SynthScene,
  key: string,
  scale = scene.scale,
): SynthScene {
  const previousRoot = keyToMidiRoot(scene.key);
  const nextRoot = keyToMidiRoot(key);
  const delta = nextRoot - previousRoot;

  return SynthSceneSchema.parse({
    ...scene,
    key: normalizeKey(key),
    scale,
    voices: scene.voices.map((voice) => ({
      ...voice,
      steps: voice.steps.map((step) => ({
        ...step,
        midi: clampInt(step.midi + delta, 12, 108),
      })),
    })),
  });
}

function buildVoices({
  explicitNotes,
  macros,
  previousVoices,
  random,
  rootMidi,
  rootWaveform,
  scale,
  stepsPerBar,
  sustained,
  timbreProfile,
  totalSteps,
}: {
  explicitNotes: number[];
  macros: SynthMacros;
  previousVoices?: SynthVoice[];
  random: () => number;
  rootMidi: number;
  rootWaveform: SynthRootWaveform | null;
  scale: SynthScale;
  stepsPerBar: number;
  sustained: boolean;
  timbreProfile: TimbreProfile;
  totalSteps: number;
}): SynthVoice[] {
  const previousVoicesById = new Map(
    previousVoices?.map((voice) => [voice.id, voice]) ?? [],
  );
  const patchFor = (id: string, role: SynthVoice["role"]) =>
    createPatch({
      role,
      macros,
      random,
      rootWaveform: rootWaveform ?? previousVoicesById.get(id)?.patch.rootWaveform,
      timbreProfile,
    });
  const notePool =
    explicitNotes.length > 0
      ? explicitNotes.map((midi) => toSynthPitch(midi))
      : createScalePitchPool(rootMidi, scale);
  const bassNotes =
    explicitNotes.length > 0
      ? explicitNotes.map((note) => toSynthPitch(clampInt(note, 24, 60)))
      : notePool.map((note) => ({
          ...note,
          midi: clampInt(note.midi - 12, 24, 60),
        }));
  const chordNotes = createChordNotes(rootMidi, scale);

  return [
    createVoice({
      id: "sub-fm",
      label: "sub fm",
      role: "bass",
      gainDb: -8,
      pan: -0.05,
      patch: patchFor("sub-fm", "bass"),
      steps: createBassSteps({ notes: bassNotes, macros, random, sustained, stepsPerBar, totalSteps }),
    }),
    createVoice({
      id: "carrier-stab",
      label: "carrier stab",
      role: "stab",
      gainDb: -12,
      pan: 0.12,
      patch: patchFor("carrier-stab", "stab"),
      steps: createStabSteps({
        notes: chordNotes,
        macros,
        random,
        stepsPerBar,
        sustained,
        totalSteps,
        offset: 4,
      }),
    }),
    createVoice({
      id: "sideband-chord",
      label: "sideband chord",
      role: "chord",
      gainDb: -15,
      pan: -0.18,
      patch: patchFor("sideband-chord", "chord"),
      steps: createStabSteps({
        notes: chordNotes.map((note) => ({
          ...note,
          midi: clampInt(note.midi + 7, 12, 108),
        })),
        macros,
        random,
        stepsPerBar,
        sustained,
        totalSteps,
        offset: 12,
      }),
    }),
    createVoice({
      id: "latent-line",
      label: "latent line",
      role: "lead",
      gainDb: -17,
      pan: 0.28,
      patch: patchFor("latent-line", "lead"),
      steps: createMelodicSteps({ notes: notePool, macros, random, sustained, stepsPerBar, totalSteps }),
    }),
    createVoice({
      id: "dust-texture",
      label: "dust texture",
      role: "texture",
      gainDb: -22,
      pan: 0.38,
      patch: patchFor("dust-texture", "texture"),
      steps: createTextureSteps({
        notes: notePool.map((note) => ({
          ...note,
          midi: clampInt(note.midi + 24, 48, 96),
        })),
        macros,
        random,
        stepsPerBar,
        sustained,
        totalSteps,
      }),
    }),
  ];
}

function createVoice(input: Omit<SynthVoice, "mute"> & { mute?: boolean }): SynthVoice {
  return { ...input, mute: input.mute ?? false };
}

function createPatch({
  role,
  macros,
  random,
  rootWaveform,
  timbreProfile,
}: {
  role: SynthVoice["role"];
  macros: SynthMacros;
  random: () => number;
  rootWaveform?: SynthRootWaveform;
  timbreProfile: TimbreProfile;
}): VoicePatch {
  const brightness = role === "bass" ? macros.brightness * 0.45 : macros.brightness;
  const bite =
    (role === "texture" ? 0.82 : role === "lead" ? 0.68 : 0.48) +
    timbreProfile.metal * 0.42 -
    timbreProfile.warmth * 0.18;
  const modulationBase = getRoleModulationBase(role, timbreProfile);

  return {
    partials: createPartials({ brightness, bite, random, timbreProfile }),
    rootWaveform: rootWaveform ?? chooseDefaultRootWaveform(role, timbreProfile, random),
    modulationIndex: clamp(
      modulationBase + macros.mutationDepth * (8 + timbreProfile.metal * 14) + random() * 2.4,
      0,
      48,
    ),
    harmonicity: clamp(
      role === "bass"
        ? 0.45 + random() * 0.22 + timbreProfile.metal * 0.14
        : role === "texture"
          ? 1.1 + random() * (1.6 + timbreProfile.metal * 2.8)
          : 0.72 + random() * (0.88 + timbreProfile.metal * 1.3),
      0.125,
      8,
    ),
    modulationType:
      timbreProfile.metal > 0.55
        ? role === "bass"
          ? "triangle"
          : "sawtooth"
        : role === "lead" || role === "texture"
          ? "triangle"
          : "sine",
    detuneCents: (random() - 0.5) * macros.analogDrift * 48,
    attack: role === "stab" || role === "chord" ? 0.01 + random() * 0.025 : 0.02,
    decay: role === "bass" ? 0.18 + random() * 0.22 : 0.35 + macros.dubSpace * 0.7,
    sustain: role === "texture" ? 0.24 : role === "lead" ? 0.36 : 0.12,
    release: role === "texture" ? 1.4 + macros.dubSpace * 3 : 0.25 + macros.dubSpace * 1.2,
    modulationAttack: 0.008 + random() * 0.08,
    modulationRelease: 0.15 + macros.evolution * 1.8,
  };
}

function createPartials({
  brightness,
  bite,
  random,
  timbreProfile,
}: {
  brightness: number;
  bite: number;
  random: () => number;
  timbreProfile: TimbreProfile;
}) {
  return Array.from({ length: 12 }, (_, index) => {
    if (index === 0) {
      return 1;
    }

    const harmonic = index + 1;
    const falloffExponent = 1.62 - brightness * 0.46 + timbreProfile.metal * 0.26;
    const falloff = 1 / harmonic ** falloffExponent;
    const movement = 0.75 + random() * 0.5;
    const warmDamping = 1 - timbreProfile.warmth * clamp((harmonic - 2) / 10, 0, 0.55);
    const metalLift = 1 + timbreProfile.metal * (index % 2 === 0 ? 0.34 : 0.18);
    return clamp(falloff * bite * movement * warmDamping * metalLift, 0, 1);
  });
}

function getRoleModulationBase(role: SynthVoice["role"], timbreProfile: TimbreProfile) {
  const warmOffset = timbreProfile.warmth * -1.4;
  const metalOffset = timbreProfile.metal * 7;

  if (role === "bass") {
    return 1.2 + timbreProfile.grit * 1.4 + metalOffset * 0.18;
  }

  if (role === "texture") {
    return 5.8 + timbreProfile.grit * 4 + metalOffset;
  }

  if (role === "lead") {
    return 3.8 + timbreProfile.grit * 2.2 + metalOffset * 0.65;
  }

  return 2.9 + warmOffset + timbreProfile.grit * 2 + metalOffset * 0.5;
}

function chooseDefaultRootWaveform(
  role: SynthVoice["role"],
  timbreProfile: TimbreProfile,
  random: () => number,
): SynthRootWaveform {
  if (timbreProfile.metal > 0.55) {
    if (role === "bass") {
      return "sine";
    }

    return random() < 0.5 ? "wavetable" : role === "texture" ? "sawtooth" : "square";
  }

  if (timbreProfile.warmth > 0.45) {
    if (role === "texture" && random() < 0.35) {
      return "wavetable";
    }

    return "sine";
  }

  if (role === "bass") {
    return "sine";
  }

  if (role === "texture") {
    return random() < 0.5 ? "wavetable" : "sawtooth";
  }

  return "wavetable";
}

function createBassSteps({
  notes,
  macros,
  random,
  stepsPerBar,
  sustained,
  totalSteps,
}: {
  notes: SynthPitch[];
  macros: SynthMacros;
  random: () => number;
  stepsPerBar: number;
  sustained: boolean;
  totalSteps: number;
}): SynthStep[] {
  const anchorSteps = sustained
    ? [0, 0.25, 0.5, 0.75].map((phase) =>
        clampInt(phase * (totalSteps - 1), 0, totalSteps - 1),
      )
    : [0, 6, 10, 14, 21, 26].filter((step) => step < totalSteps);
  return Array.from({ length: totalSteps }, (_, step) => {
    const active =
      anchorSteps.includes(step) ||
      (!sustained && step % 8 === 0 && random() < macros.density);
    return createStep({
      step,
      active,
      midi: (notes[step % notes.length] ?? { midi: 36 }).midi,
      tuningCents: (notes[step % notes.length] ?? { tuningCents: 0 }).tuningCents,
      velocity: active ? 0.72 + random() * 0.2 : 0.5,
      lengthSteps: sustained
        ? clampInt(stepsPerBar * 6, 1, totalSteps)
        : step % 8 === 0
          ? 2
          : 1,
      probability: active ? 0.82 + macros.density * 0.16 : 1,
      microShift: (random() - 0.5) * macros.analogDrift * 0.18,
      modulationShift: random() * macros.mutationDepth * 0.35,
      partialMorph: clamp(random() * macros.evolution, 0, 1),
    });
  });
}

function createStabSteps({
  notes,
  macros,
  offset,
  random,
  stepsPerBar,
  sustained,
  totalSteps,
}: {
  notes: SynthPitch[];
  macros: SynthMacros;
  offset: number;
  random: () => number;
  stepsPerBar: number;
  sustained: boolean;
  totalSteps: number;
}): SynthStep[] {
  const sustainedAnchors = [0.05, 0.31, 0.62, 0.86].map((phase) =>
    clampInt(phase * (totalSteps - 1) + offset, 0, totalSteps - 1),
  );
  return Array.from({ length: totalSteps }, (_, step) => {
    const active = sustained
      ? sustainedAnchors.includes(step)
      : step % 16 === offset % 16 ||
        (step % 16 === (offset + 7) % 16 && random() < macros.density);
    return createStep({
      step,
      active,
      midi: (notes[(step + offset) % notes.length] ?? { midi: 48 }).midi,
      tuningCents: (notes[(step + offset) % notes.length] ?? { tuningCents: 0 }).tuningCents,
      velocity: active ? 0.58 + random() * 0.32 : 0.45,
      probability: active ? 0.64 + macros.evolution * 0.28 : 1,
      lengthSteps: sustained
        ? clampInt(stepsPerBar * (4 + macros.dubSpace * 8), 1, totalSteps)
        : 2 + Math.round(macros.dubSpace * 2),
      microShift: (random() - 0.45) * macros.analogDrift * 0.24,
      modulationShift: (random() - 0.5) * macros.mutationDepth,
      partialMorph: clamp(0.2 + random() * macros.evolution, 0, 1),
    });
  });
}

function createMelodicSteps({
  notes,
  macros,
  random,
  stepsPerBar,
  sustained,
  totalSteps,
}: {
  notes: SynthPitch[];
  macros: SynthMacros;
  random: () => number;
  stepsPerBar: number;
  sustained: boolean;
  totalSteps: number;
}): SynthStep[] {
  return Array.from({ length: totalSteps }, (_, step) => {
    const active = sustained
      ? step % (stepsPerBar * 8) === Math.round(stepsPerBar * 1.5)
      : step % 12 === 3 || (step % 7 === 0 && random() < macros.density * 0.7);
    const note = notes[(step * 2 + Math.floor(random() * notes.length)) % notes.length] ?? toSynthPitch(60);
    return createStep({
      step,
      active,
      midi: clampInt(note.midi + 12, 36, 96),
      tuningCents: note.tuningCents,
      velocity: active ? 0.46 + random() * 0.3 : 0.4,
      probability: active ? 0.42 + macros.evolution * 0.45 : 1,
      lengthSteps: sustained ? clampInt(stepsPerBar * 3, 1, totalSteps) : 1 + Math.round(random() * 2),
      microShift: (random() - 0.5) * macros.analogDrift * 0.32,
      modulationShift: (random() - 0.5) * macros.mutationDepth,
      partialMorph: clamp(random(), 0, 1),
    });
  });
}

function createTextureSteps({
  notes,
  macros,
  random,
  stepsPerBar,
  sustained,
  totalSteps,
}: {
  notes: SynthPitch[];
  macros: SynthMacros;
  random: () => number;
  stepsPerBar: number;
  sustained: boolean;
  totalSteps: number;
}): SynthStep[] {
  return Array.from({ length: totalSteps }, (_, step) => {
    const active = sustained
      ? step % (stepsPerBar * 4) === Math.round(stepsPerBar * 2.5)
      : random() < macros.evolution * 0.34 || step % 24 === 11;
    const note = notes[Math.floor(random() * notes.length)] ?? toSynthPitch(72);
    return createStep({
      step,
      active,
      midi: note.midi,
      tuningCents: note.tuningCents,
      velocity: active ? 0.24 + random() * 0.22 : 0.2,
      probability: active ? 0.28 + macros.evolution * 0.48 : 1,
      lengthSteps: sustained
        ? clampInt(stepsPerBar * (6 + macros.dubSpace * 10), 1, totalSteps)
        : 3 + Math.round(macros.dubSpace * 8),
      microShift: (random() - 0.5) * macros.analogDrift * 0.5,
      modulationShift: random() * macros.mutationDepth,
      partialMorph: clamp(0.45 + random() * 0.55, 0, 1),
    });
  });
}

function createStep(input: SynthStep): SynthStep {
  return input;
}

function resizeSynthSteps(steps: SynthStep[], totalSteps: number): SynthStep[] {
  if (steps.length === totalSteps) {
    return steps;
  }

  const scale = totalSteps / steps.length;
  const byNextStep = new Map<number, SynthStep>();
  for (const step of steps) {
    const nextStep = clampInt(step.step * scale, 0, totalSteps - 1);
    byNextStep.set(nextStep, {
      ...step,
      step: nextStep,
      lengthSteps: clampInt(step.lengthSteps * scale, 1, totalSteps),
    });
  }

  const fallbackMidi = steps.find((step) => step.active)?.midi ?? steps[0]?.midi ?? 48;
  return Array.from({ length: totalSteps }, (_, step) => {
    const existing = byNextStep.get(step);
    if (existing) {
      return existing;
    }

    const nearest = steps[Math.floor((step / totalSteps) * steps.length)];
    return createStep({
      step,
      active: false,
      midi: nearest?.midi ?? fallbackMidi,
      tuningCents: nearest?.tuningCents ?? 0,
      velocity: nearest?.velocity ?? 0.5,
      probability: 1,
      lengthSteps: 1,
      microShift: nearest?.microShift ?? 0,
      modulationShift: nearest?.modulationShift ?? 0,
      partialMorph: nearest?.partialMorph ?? 0,
    });
  });
}

function createScalePitchPool(rootMidi: number, scale: SynthScale): SynthPitch[] {
  const offsets = getScalePitchOffsets(scale);
  const usableOffsets = offsets.length > 0 ? offsets : getScalePitchOffsets("minor");

  return Array.from({ length: Math.min(16, usableOffsets.length * 2) }, (_, index) => {
    const octave = Math.floor(index / usableOffsets.length);
    const offset = usableOffsets[index % usableOffsets.length] ?? {
      semitone: 0,
      detuneCents: 0,
    };
    return {
      midi: rootMidi + octave * 12 + offset.semitone,
      tuningCents: offset.detuneCents,
    };
  });
}

function createChordNotes(rootMidi: number, scale: SynthScale): SynthPitch[] {
  const offsets = getScalePitchOffsets(scale);
  const usableOffsets = offsets.length > 0 ? offsets : getScalePitchOffsets("minor");
  const chordDegrees = [0, 2, 4, 6];
  return chordDegrees.map((degree) => {
    const octave = Math.floor(degree / usableOffsets.length);
    const offset = usableOffsets[degree % usableOffsets.length] ?? {
      semitone: 0,
      detuneCents: 0,
    };
    return {
      midi: rootMidi + 12 + octave * 12 + offset.semitone,
      tuningCents: offset.detuneCents,
    };
  });
}

function toSynthPitch(midi: number): SynthPitch {
  return { midi, tuningCents: 0 };
}

function inferEffects(
  prompt: string,
  macros: SynthMacros,
  previousEffects?: SynthEffects,
): SynthEffects {
  const lower = prompt.toLowerCase();
  const timbreProfile = inferTimbreProfile(prompt);
  const dubBias = lower.includes("dub") || lower.includes("echo") ? 0.18 : 0;
  const acidBias = lower.includes("acid") ? 0.2 : 0;
  const base = previousEffects;

  return {
    filter: {
      cutoffHz: clamp(
        (base?.filter.cutoffHz ?? 720) +
          macros.brightness * 3000 +
          acidBias * 2600 +
          timbreProfile.metal * 1400 -
          timbreProfile.warmth * 420,
        80,
        12000,
      ),
      resonance: clamp(
        (base?.filter.resonance ?? 3.8) + acidBias * 8 + timbreProfile.metal * 2.4,
        0.1,
        18,
      ),
      motion: clamp(macros.evolution * 0.8 + macros.analogDrift * 0.2, 0, 1),
    },
    delay: {
      time: lower.includes("slow") || lower.includes("space") ? "4n" : "8n.",
      feedback: clamp(0.34 + macros.dubSpace * 0.42 + dubBias, 0, 0.92),
      wet: clamp(0.18 + macros.dubSpace * 0.44 + dubBias, 0, 0.9),
    },
    reverb: {
      decay: clamp(1.6 + macros.dubSpace * 6.4, 0.2, 12),
      preDelay: clamp(0.01 + macros.dubSpace * 0.08, 0, 0.35),
      wet: clamp(0.16 + macros.dubSpace * 0.48, 0, 0.9),
    },
    chorus: {
      rateHz: clamp(0.12 + macros.evolution * 0.9, 0.02, 8),
      depth: clamp(0.12 + macros.analogDrift * 0.55, 0, 1),
      wet: clamp(0.06 + macros.dubSpace * 0.22, 0, 0.8),
    },
    drive: {
      amount: clamp(
        0.04 + macros.brightness * 0.16 + acidBias + timbreProfile.grit * 0.16,
        0,
        0.9,
      ),
      wet: clamp(0.05 + macros.mutationDepth * 0.16 + timbreProfile.grit * 0.08, 0, 0.7),
    },
    masterDb: -8,
  };
}

function inferMacros(prompt: string, previous?: SynthMacros): SynthMacros {
  const lower = prompt.toLowerCase();
  const base = previous ?? {
    evolution: 0.68,
    mutationDepth: 0.42,
    brightness: 0.46,
    dubSpace: 0.74,
    density: 0.42,
    analogDrift: 0.35,
  };

  return {
    evolution: inferMacro(lower, base.evolution, [
      ["evolving", 0.16],
      ["constant", 0.12],
      ["generative", 0.12],
      ["static", -0.28],
    ]),
    mutationDepth: inferMacro(lower, base.mutationDepth, [
      ["wild", 0.24],
      ["chaotic", 0.22],
      ["subtle", -0.18],
      ["minimal", -0.12],
    ]),
    brightness: inferMacro(lower, base.brightness, [
      ["bright", 0.18],
      ["acid", 0.2],
      ["dark", -0.24],
      ["warm", -0.1],
    ]),
    dubSpace: inferMacro(lower, base.dubSpace, [
      ["dub", 0.2],
      ["space", 0.16],
      ["echo", 0.14],
      ["dry", -0.34],
    ]),
    density: inferMacro(lower, base.density, [
      ["dense", 0.22],
      ["busy", 0.18],
      ["sparse", -0.2],
      ["minimal", -0.16],
    ]),
    analogDrift: inferMacro(lower, base.analogDrift, [
      ["drift", 0.16],
      ["tape", 0.18],
      ["ancient", 0.2],
      ["tight", -0.2],
    ]),
  };
}

function inferMacro(
  prompt: string,
  base: number,
  signals: Array<[needle: string, delta: number]>,
) {
  return clamp(
    signals.reduce(
      (value, [needle, delta]) => (prompt.includes(needle) ? value + delta : value),
      base,
    ),
    0,
    1,
  );
}

function parseKey(prompt: string): string | null {
  const explicit = prompt.match(/\bkey(?:\s+of|\s*[:=])?\s*([A-Ga-g][#bB]?)/);
  if (explicit?.[1]) {
    return normalizeKey(explicit[1]);
  }

  const scalePair = prompt.match(/\b([A-Ga-g][#bB]?)\s+(minor|dorian|phrygian)\b/);
  return scalePair?.[1] ? normalizeKey(scalePair[1]) : null;
}

function parseScale(prompt: string): SynthScale | null {
  const lower = prompt.toLowerCase();
  if (lower.includes("minor pentatonic")) {
    return "minor-pentatonic";
  }

  for (const scale of ["dorian", "phrygian", "chromatic", "minor"]) {
    if (lower.includes(scale)) {
      return scale;
    }
  }

  const explicitScale = lower.match(/\b(?:scale|mode|tuning)\s*(?:of|:|=)?\s*([a-z0-9 -]{3,48})/);
  if (explicitScale?.[1]) {
    return searchScaleKeys(explicitScale[1], { tonic: "C", limit: 1 })[0]?.scale.id ?? null;
  }

  const directMatch = getScaleDefinitions().find((definition) => {
    const names = [definition.id, definition.name, ...definition.aliases].map((value) =>
      value.toLowerCase(),
    );
    return names.some((name) => lower.includes(name));
  });

  return directMatch?.id ?? null;
}

function inferScale(prompt: string): SynthScale {
  const lower = prompt.toLowerCase();
  if (lower.includes("dub") || lower.includes("detroit")) {
    return "dorian";
  }

  if (lower.includes("ancient") || lower.includes("ritual")) {
    return "phrygian";
  }

  return "minor";
}

function parseBpm(prompt: string): number | null {
  const match = prompt.match(/\b(\d{1,3})\s*bpm\b/i);
  if (!match?.[1]) {
    return null;
  }

  return clampInt(Number(match[1]), MIN_BPM, MAX_BPM);
}

function parseEvolutionBars(prompt: string): EvolutionBars | null {
  const match = prompt.match(/\b(4|8|16|32|64|128)\s*bars?\b/i);
  if (!match?.[1]) {
    return null;
  }

  const bars = Number(match[1]);
  return isEvolutionBars(bars) ? bars : null;
}

function inferEvolutionBars(prompt: string): EvolutionBars {
  if (inferSustained(prompt)) {
    return 32;
  }

  if (prompt.toLowerCase().includes("short")) {
    return 8;
  }

  return 16;
}

function inferSustained(prompt: string) {
  const lower = prompt.toLowerCase();
  return ["pad", "pads", "tone", "tones", "drone", "ambient", "long", "sustained"].some(
    (needle) => lower.includes(needle),
  );
}

function isEvolutionBars(value: number): value is EvolutionBars {
  return (
    value === 4 ||
    value === 8 ||
    value === 16 ||
    value === 32 ||
    value === 64 ||
    value === 128
  );
}

function inferBpm(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes("ambient")) {
    return 92;
  }

  if (lower.includes("dub") || lower.includes("techno")) {
    return 124;
  }

  if (lower.includes("acid")) {
    return 132;
  }

  return 118;
}

function inferSwing(prompt: string, previous = 0.08) {
  const lower = prompt.toLowerCase();
  if (lower.includes("straight")) {
    return 0;
  }

  if (lower.includes("swing") || lower.includes("shuffle")) {
    return 0.16;
  }

  return previous;
}

function parsePromptNotes(prompt: string): number[] {
  const notes = [...prompt.matchAll(/\b([A-Ga-g][#bB]?-?\d)\b/g)]
    .map((match) => noteNameToMidi(match[1] ?? ""))
    .filter((midi): midi is number => midi !== null);

  return [...new Set(notes)].slice(0, 12);
}

function parseRootWaveform(prompt: string): SynthRootWaveform | null {
  const lower = prompt.toLowerCase();
  if (/\b(sine|sin|sign wave|sign)\b/.test(lower)) {
    return "sine";
  }

  if (/\b(wavetable|wave table|custom partials?|partials?)\b/.test(lower)) {
    return "wavetable";
  }

  if (/\bsquare\b/.test(lower)) {
    return "square";
  }

  if (/\b(saw|sawtooth|saw tooth)\b/.test(lower)) {
    return "sawtooth";
  }

  return null;
}

function inferTimbreProfile(prompt: string): TimbreProfile {
  const lower = prompt.toLowerCase();
  const warmth = inferTimbreAmount(lower, 0.34, [
    ["warm", 0.28],
    ["soft", 0.22],
    ["round", 0.2],
    ["mellow", 0.2],
    ["tape", 0.18],
    ["pad", 0.16],
    ["ambient", 0.14],
    ["dub", 0.12],
    ["deep", 0.1],
    ["metal", -0.3],
    ["metallic", -0.34],
    ["acid", -0.18],
    ["harsh", -0.24],
  ]);
  const metal = inferTimbreAmount(lower, 0.12, [
    ["metallic", 0.48],
    ["metal", 0.42],
    ["glass", 0.34],
    ["glassy", 0.34],
    ["bell", 0.34],
    ["clang", 0.36],
    ["acid", 0.28],
    ["harsh", 0.24],
    ["bright", 0.18],
    ["warm", -0.16],
    ["soft", -0.14],
    ["mellow", -0.14],
    ["tape", -0.1],
  ]);
  const grit = inferTimbreAmount(lower, 0.18, [
    ["dirty", 0.28],
    ["drive", 0.24],
    ["driven", 0.24],
    ["distorted", 0.28],
    ["acid", 0.24],
    ["harsh", 0.2],
    ["tape", 0.1],
    ["clean", -0.24],
    ["soft", -0.12],
  ]);

  return { grit, metal, warmth };
}

function inferTimbreAmount(
  prompt: string,
  base: number,
  signals: Array<[needle: string, delta: number]>,
) {
  return clamp(
    signals.reduce(
      (value, [needle, delta]) => (prompt.includes(needle) ? value + delta : value),
      base,
    ),
    0,
    1,
  );
}

function createAgentPlan(prompt: string) {
  const specific = parsePromptNotes(prompt).length > 0 || parseKey(prompt) || parseBpm(prompt);
  return [
    specific
      ? "Extract explicit key, tempo, and MIDI note constraints from the prompt."
      : "Infer key, tempo, scale, and density from genre and mood words.",
    "Choose a 4, 8, 16, 32, 64, or 128 bar evolution cycle before writing notes.",
    "Generate symbolic MIDI lanes for bass, stabs, sidebands, lead, and texture.",
    "Map latent-style timbre controls into carrier waveform, bar-level FM index, harmonicity, wavetable partials, and drift.",
    "Tune dub effects as controllable delay, reverb, chorus, drive, and filter motion.",
  ];
}

function createRationale({
  prompt,
  key,
  scale,
  bpm,
  bars,
  macros,
  rootWaveform,
  timbreProfile,
}: {
  prompt: string;
  key: string;
  scale: SynthScale;
  bpm: number;
  bars: EvolutionBars;
  macros: SynthMacros;
  rootWaveform: SynthRootWaveform;
  timbreProfile: TimbreProfile;
}) {
  const notes = parsePromptNotes(prompt).map(midiToNoteName);
  return [
    `Built a ${normalizeKey(key)} ${getScaleDisplayName(scale)} scene at ${bpm} BPM over ${bars} bars.`,
    notes.length > 0 ? `Prompt notes anchored the pitch set: ${notes.join(", ")}.` : null,
    `Carrier root starts from ${formatRootWaveform(rootWaveform)}.`,
    `Timbre leans ${formatTimbreProfile(timbreProfile)}.`,
    `Evolution ${Math.round(macros.evolution * 100)}%, dub space ${Math.round(
      macros.dubSpace * 100,
    )}%, mutation ${Math.round(macros.mutationDepth * 100)}%.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatRootWaveform(rootWaveform: SynthRootWaveform) {
  return rootWaveform === "sawtooth" ? "saw" : rootWaveform;
}

function formatTimbreProfile(profile: TimbreProfile) {
  if (profile.metal > 0.5) {
    return "metallic";
  }

  if (profile.warmth > 0.5) {
    return "warm";
  }

  if (profile.grit > 0.45) {
    return "driven";
  }

  return "balanced";
}

function inferInfluences(prompt: string) {
  const lower = prompt.toLowerCase();
  const influences = [];
  if (lower.includes("dub") || lower.includes("techno")) {
    influences.push("dub techno");
  }
  if (lower.includes("detroit")) {
    influences.push("detroit chord memory");
  }
  if (lower.includes("ambient")) {
    influences.push("ambient smear");
  }
  if (lower.includes("ancient") || lower.includes("ritual")) {
    influences.push("ancient modal drift");
  }

  return influences.length > 0 ? influences : ["prompt-conditioned synthesis"];
}

function nameFromPrompt(prompt: string, key: string, scale: SynthScale) {
  const lower = prompt.toLowerCase();
  if (lower.includes("dub")) {
    return `${normalizeKey(key)} ${getScaleDisplayName(scale)} dub sidebands`;
  }

  if (lower.includes("ancient")) {
    return `${normalizeKey(key)} ${getScaleDisplayName(scale)} ancient wavetable`;
  }

  return `${normalizeKey(key)} ${getScaleDisplayName(scale)} evolving fm`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % 999999;
}

function createSeededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(48271, state) % 0x7fffffff;
    return (state & 0x7fffffff) / 0x7fffffff;
  };
}
