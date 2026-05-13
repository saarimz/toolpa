import { parseMidiFile, type ParsedMidiTrack } from "@/lib/midi/import";

import {
  getStepsPerBarForEvolutionBars,
  SynthSceneSchema,
  type EvolutionBars,
  type SynthScene,
  type SynthStep,
  type SynthVoice,
} from "./schema";

const EVOLUTION_BAR_OPTIONS: EvolutionBars[] = [4, 8, 16, 32, 64, 128];

export function createSynthSceneFromMidiFile(
  bytes: Uint8Array,
  currentScene: SynthScene,
): SynthScene {
  const parsed = parseMidiFile(bytes);
  const tracks = parsed.tracks.slice(0, 6);
  if (tracks.length === 0) {
    throw new Error("MIDI file does not contain note tracks");
  }

  const totalBeats = Math.max(
    4,
    ...tracks.flatMap((track) =>
      track.notes.map((note) => note.startBeat + note.durationBeats),
    ),
  );
  const bars = chooseEvolutionBars(Math.ceil(totalBeats / 4));
  const stepsPerBar = getStepsPerBarForEvolutionBars(bars);
  const totalSteps = bars * stepsPerBar;
  const voices = tracks.map((track, index) =>
    createVoiceFromMidiTrack({
      baseVoice: currentScene.voices[index % currentScene.voices.length],
      index,
      stepsPerBar,
      totalSteps,
      track,
    }),
  );

  return SynthSceneSchema.parse({
    ...currentScene,
    bpm: parsed.bpm ?? currentScene.bpm,
    bars,
    id: `${currentScene.id}-midi-${Date.now().toString(36)}`,
    metadata: {
      ...currentScene.metadata,
      createdBy: "import",
      rationale: `Imported ${tracks.length} MIDI track${tracks.length === 1 ? "" : "s"} into a playable SynthScene.`,
      agentPlan: [
        "Parsed the Standard MIDI File.",
        "Mapped each note track to one synth voice.",
        "Quantized note starts and lengths into the current SynthScene grid.",
      ],
      researchBasis: [
        "Standard MIDI File import preserves pitch, velocity, timing, and track names.",
      ],
    },
    name: `${currentScene.name} MIDI import`,
    stepsPerBar,
    voices,
  });
}

function createVoiceFromMidiTrack({
  baseVoice,
  index,
  stepsPerBar,
  totalSteps,
  track,
}: {
  baseVoice?: SynthVoice;
  index: number;
  stepsPerBar: number;
  totalSteps: number;
  track: ParsedMidiTrack;
}): SynthVoice {
  const steps = createEmptySteps(totalSteps);
  for (const note of track.notes) {
    const stepIndex = clampInt(Math.round((note.startBeat / 4) * stepsPerBar), 0, totalSteps - 1);
    const lengthSteps = clampInt(Math.round((note.durationBeats / 4) * stepsPerBar), 1, totalSteps);
    steps[stepIndex] = {
      ...steps[stepIndex]!,
      active: true,
      lengthSteps,
      midi: note.midi,
      velocity: note.velocity,
    };
  }

  return {
    ...(baseVoice ?? createFallbackVoice(index)),
    id: slugifyTrackName(track.name || `midi-${index + 1}`),
    label: track.name || `MIDI ${index + 1}`,
    role: inferVoiceRole(track.name, index),
    steps,
  };
}

function createEmptySteps(totalSteps: number): SynthStep[] {
  return Array.from({ length: totalSteps }, (_, step) => ({
    active: false,
    lengthSteps: 1,
    microShift: 0,
    midi: 60,
    modulationShift: 0,
    partialMorph: 0,
    probability: 1,
    step,
    tuningCents: 0,
    velocity: 0.7,
  }));
}

function createFallbackVoice(index: number): SynthVoice {
  return {
    gainDb: -10,
    id: `midi-${index + 1}`,
    label: `MIDI ${index + 1}`,
    mute: false,
    pan: 0,
    patch: {
      attack: 0.01,
      decay: 0.3,
      detuneCents: 0,
      harmonicity: 1,
      modulationAttack: 0.01,
      modulationIndex: 2,
      modulationRelease: 0.2,
      modulationType: "sine",
      partials: [1, 0.2, 0.1, 0.05],
      release: 0.4,
      rootWaveform: "sine",
      sustain: 0.5,
    },
    role: "lead",
    steps: [],
  };
}

function chooseEvolutionBars(requestedBars: number): EvolutionBars {
  return (
    EVOLUTION_BAR_OPTIONS.find((bars) => bars >= requestedBars) ??
    EVOLUTION_BAR_OPTIONS[EVOLUTION_BAR_OPTIONS.length - 1]!
  );
}

function inferVoiceRole(name: string, index: number): SynthVoice["role"] {
  if (/\bbass|sub\b/i.test(name)) {
    return "bass";
  }
  if (/\bchord|pad\b/i.test(name)) {
    return "chord";
  }
  if (/\bstab\b/i.test(name)) {
    return "stab";
  }
  if (/\blead|melody|hook\b/i.test(name)) {
    return "lead";
  }
  if (/\btexture|fx|drone\b/i.test(name)) {
    return "texture";
  }
  return index === 0 ? "bass" : index === 1 ? "chord" : "lead";
}

function slugifyTrackName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "midi-track"
  );
}

function clampInt(value: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)));
}
