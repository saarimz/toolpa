import {
  getScaleDefinition,
  getScaleDegreeCents,
} from "@/lib/music/scale-catalog";
import type { GlobalMusicContext, Tonic } from "@/lib/music/context";

import {
  MIDI_CLIP_BAR_OPTIONS,
  MidiClipSchema,
  type MidiClip,
  type MidiClipBars,
  type MidiClipNote,
  type MidiClipTrack,
  type MidiClipTrackRole,
} from "./schema";

export type GenerateMidiClipInput = {
  prompt: string;
  musicalContext?: GlobalMusicContext | null;
  previousClip?: MidiClip | null;
  seed?: number;
};

export type MidiClipContextPatch = {
  bpm?: number;
  key?: {
    scaleId?: string;
    tonic?: Tonic;
  };
  swing?: number;
};

const noteIndexes: Record<string, number> = {
  A: 9,
  "A#": 10,
  AB: 8,
  B: 11,
  BB: 10,
  C: 0,
  "C#": 1,
  CB: 11,
  D: 2,
  "D#": 3,
  DB: 1,
  E: 4,
  EB: 3,
  F: 5,
  "F#": 6,
  FB: 4,
  G: 7,
  "G#": 8,
  GB: 6,
};

const tonicOptions: Tonic[] = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

const scaleAliases: Array<[RegExp, string]> = [
  [/\bharmonic minor\b/i, "harmonic-minor"],
  [/\bmelodic minor\b/i, "melodic-minor"],
  [/\bminor pentatonic\b/i, "minor-pentatonic"],
  [/\bmajor pentatonic\b/i, "major-pentatonic"],
  [/\bmajor\b|\bionian\b/i, "major"],
  [/\bminor\b|\baeolian\b/i, "minor"],
  [/\bdorian\b/i, "dorian"],
  [/\bphrygian\b/i, "phrygian"],
  [/\blydian\b/i, "lydian"],
  [/\bmixolydian\b/i, "mixolydian"],
  [/\blocrian\b/i, "locrian"],
  [/\bblues\b/i, "blues"],
  [/\bchromatic\b/i, "chromatic"],
  [/\bwhole tone\b/i, "whole-tone"],
  [/\bquarter tone\b|\b24 edo\b/i, "quarter-tone-neutral"],
];

export function createDefaultMidiClip() {
  return generateMidiClipFromPrompt({
    prompt: "expressive 8 bar C minor bass, chords, and lead with human timing",
    seed: 18017,
  });
}

export function buildMidiGeneratorSystemPrompt() {
  return [
    "You are the midi-generator L1 instrument inside ai-daw-tools.",
    "Return an expressive MIDI clip document, not audio and not a synth patch.",
    "Use the global music context unless the prompt explicitly asks for BPM, key, or scale changes.",
    "Generate musical MIDI that would be hard to program by hand: humanized starts, velocity arcs, passing tones, bends, chord movement, sparse rests, and call-response phrases.",
    "The clip must be exportable as Standard MIDI and previewable through a simple sine synth.",
  ].join("\n");
}

export function buildMidiGeneratorPrompt({
  clip,
  musicalContext,
  prompt,
}: {
  clip: MidiClip;
  musicalContext?: GlobalMusicContext | null;
  prompt: string;
}) {
  const scale = getScaleDefinition(clip.scaleId);
  const globalScale = musicalContext
    ? getScaleDefinition(musicalContext.key.scaleId)
    : null;

  return [
    `user prompt: ${prompt || "generate an expressive MIDI clip"}`,
    `current clip: ${clip.key} ${scale.name}, ${clip.bpm} bpm, ${clip.bars} bars`,
    `tracks: ${clip.tracks.map((track) => `${track.name}:${track.role}`).join(", ")}`,
    musicalContext
      ? `global music context: ${musicalContext.key.tonic} ${globalScale?.name ?? musicalContext.key.scaleId}, ${musicalContext.bpm} bpm, swing ${musicalContext.swing}`
      : "",
    "Output should stay as MIDI notes with expressive timing, velocity, bends, and CC intent.",
  ].filter(Boolean).join("\n");
}

export function generateMidiClipFromPrompt({
  musicalContext,
  previousClip = null,
  prompt,
  seed,
}: GenerateMidiClipInput): MidiClip {
  const normalizedPrompt = prompt.trim();
  const nextSeed =
    seed ??
    (previousClip
      ? (previousClip.seed + 104729) % 999999
      : hashString(normalizedPrompt || "midi-generator"));
  const random = createSeededRandom(nextSeed);
  const contextPatch = inferContextPatch(normalizedPrompt);
  const key = contextPatch.key?.tonic ?? musicalContext?.key.tonic ?? previousClip?.key ?? "C";
  const scaleId =
    contextPatch.key?.scaleId ??
    musicalContext?.key.scaleId ??
    previousClip?.scaleId ??
    inferScale(normalizedPrompt);
  const bpm =
    contextPatch.bpm ??
    musicalContext?.bpm ??
    previousClip?.bpm ??
    inferBpm(normalizedPrompt);
  const swing =
    contextPatch.swing ??
    musicalContext?.swing ??
    previousClip?.swing ??
    inferSwing(normalizedPrompt);
  const bars = parseBars(normalizedPrompt) ?? previousClip?.bars ?? 8;
  const tracks = createTracks(normalizedPrompt);
  const rootMidi = keyToMidi(key, inferOctave(normalizedPrompt));
  const density = inferDensity(normalizedPrompt);
  const phrase = inferPhraseStyle(normalizedPrompt);
  const notes = createExpressiveNotes({
    bars,
    density,
    phrase,
    random,
    rootMidi,
    scaleId,
    tracks,
  });

  return MidiClipSchema.parse({
    schemaVersion: 1,
    id: `midi-clip-${nextSeed}`,
    name: nameFromPrompt(normalizedPrompt, key, scaleId),
    bpm,
    swing,
    key,
    scaleId,
    bars,
    stepsPerBar: bars >= 256 ? 4 : bars >= 64 ? 8 : 16,
    seed: nextSeed,
    tracks,
    notes,
    metadata: {
      createdBy: "local-agent",
      editPrompt: "",
      history: previousClip
        ? [
            ...previousClip.metadata.history.slice(-7),
            `generated variation from ${previousClip.id}`,
          ]
        : [],
      prompt: normalizedPrompt,
      rationale: createRationale({
        bars,
        bpm,
        density,
        key,
        phrase,
        scaleId,
      }),
    },
  });
}

export function editMidiClipWithPrompt(
  clip: MidiClip,
  prompt: string,
  musicalContext?: GlobalMusicContext | null,
): MidiClip {
  const normalizedPrompt = prompt.trim();
  if (/\b(regenerate|rewrite|new pattern|start over)\b/i.test(normalizedPrompt)) {
    return generateMidiClipFromPrompt({
      musicalContext,
      previousClip: clip,
      prompt: normalizedPrompt || clip.metadata.prompt,
    });
  }

  const contextPatch = inferContextPatch(normalizedPrompt);
  const nextKey = contextPatch.key?.tonic ?? clip.key;
  const nextScale = contextPatch.key?.scaleId ?? clip.scaleId;
  const semitoneDelta = keyToMidi(nextKey, 3) - keyToMidi(clip.key, 3);
  const transposeDelta = parseTranspose(normalizedPrompt) + semitoneDelta;
  const velocityDelta = /\b(louder|harder|accent)\b/i.test(normalizedPrompt)
    ? 0.08
    : /\b(softer|gentler|quiet)\b/i.test(normalizedPrompt)
      ? -0.08
      : 0;
  const timingAmount = /\b(human|loose|drunk|behind|ahead|swing)\b/i.test(normalizedPrompt)
    ? 0.035
    : 0.012;
  const sparse = /\b(sparse|simpler|less busy|minimal)\b/i.test(normalizedPrompt);
  const dense = /\b(dense|busier|more notes|fill)\b/i.test(normalizedPrompt);
  const random = createSeededRandom((clip.seed + hashString(normalizedPrompt)) % 999999);
  const notes = clip.notes
    .filter((note, index) => !sparse || index % 5 !== 0)
    .map((note) => ({
      ...note,
      id: `${note.id}-e${clip.metadata.history.length + 1}`,
      durationBeats: clampNumber(
        note.durationBeats * (/\blegato|longer|sustain\b/i.test(normalizedPrompt) ? 1.25 : 1),
        0.0625,
        16,
      ),
      midi: clampInt(note.midi + transposeDelta, 0, 127),
      pitchBendCents:
        Math.abs(note.pitchBendCents) > 0.01 || /\bbend|slide|expressive\b/i.test(normalizedPrompt)
          ? clampNumber(note.pitchBendCents + (random() - 0.5) * 34, -200, 200)
          : note.pitchBendCents,
      startBeat: clampNumber(
        note.startBeat + (random() - 0.5) * timingAmount,
        0,
        clip.bars * 4 - 0.0625,
      ),
      velocity: clampNumber(note.velocity + velocityDelta + (random() - 0.5) * 0.05, 0.08, 1),
    }));
  const filledNotes = dense
    ? [...notes, ...createFillNotes({ clip, random, scaleId: nextScale }).slice(0, 128)]
    : notes;

  return MidiClipSchema.parse({
    ...clip,
    bpm: contextPatch.bpm ?? clip.bpm,
    key: nextKey,
    scaleId: nextScale,
    seed: (clip.seed + 7919) % 999999,
    notes: filledNotes.sort(sortNotes),
    metadata: {
      ...clip.metadata,
      editPrompt: normalizedPrompt,
      history: [
        ...clip.metadata.history,
        normalizedPrompt || "expressive timing and velocity edit",
      ].slice(-8),
      rationale: `${clip.metadata.rationale} Edited with: ${normalizedPrompt || "small expressive variation"}.`,
    },
  });
}

export function inferContextPatch(prompt: string): MidiClipContextPatch {
  return {
    bpm: parseBpm(prompt) ?? undefined,
    key: {
      scaleId: parseScale(prompt) ?? undefined,
      tonic: parseKey(prompt) ?? undefined,
    },
    swing: parseSwing(prompt) ?? undefined,
  };
}

function createExpressiveNotes({
  bars,
  density,
  phrase,
  random,
  rootMidi,
  scaleId,
  tracks,
}: {
  bars: MidiClipBars;
  density: number;
  phrase: "arp" | "chord" | "lead" | "pad";
  random: () => number;
  rootMidi: number;
  scaleId: string;
  tracks: MidiClipTrack[];
}) {
  const notes: MidiClipNote[] = [];
  const totalBeats = bars * 4;
  const bassTrack = tracks.find((track) => track.role === "bass") ?? tracks[0];
  const chordTrack = tracks.find((track) => track.role === "chord");
  const leadTrack = tracks.find((track) => track.role === "lead" || track.role === "arp");
  const padTrack = tracks.find((track) => track.role === "pad");

  if (bassTrack) {
    const interval = density > 0.7 ? 1 : 2;
    for (let beat = 0; beat < totalBeats; beat += interval) {
      const bar = Math.floor(beat / 4);
      const degree = [0, 4, 5, 3][bar % 4] ?? 0;
      notes.push(
        createNote({
          beat,
          channel: bassTrack.channel,
          durationBeats: density > 0.7 ? 0.82 : 1.65,
          id: `bass-${beat}`,
          midi: degreeToMidi(rootMidi - 12, scaleId, degree),
          random,
          trackId: bassTrack.id,
          velocity: 0.64 + density * 0.18,
        }),
      );
    }
  }

  if (chordTrack) {
    for (let beat = 0; beat < totalBeats; beat += phrase === "chord" ? 2 : 4) {
      const bar = Math.floor(beat / 4);
      const degrees = [0, 2, 4].map((degree) => degree + ([0, 3, 4, 5][bar % 4] ?? 0));
      for (const [index, degree] of degrees.entries()) {
        notes.push(
          createNote({
            beat: beat + index * 0.012,
            channel: chordTrack.channel,
            durationBeats: phrase === "pad" ? 7.8 : 2.8,
            id: `chord-${beat}-${index}`,
            midi: degreeToMidi(rootMidi, scaleId, degree),
            random,
            trackId: chordTrack.id,
            velocity: 0.46 + index * 0.06,
          }),
        );
      }
    }
  }

  if (leadTrack) {
    const leadInterval = density > 0.72 ? 0.5 : density > 0.45 ? 1 : 2;
    let phraseIndex = 0;
    for (let beat = phrase === "pad" ? 2 : 0; beat < totalBeats; beat += leadInterval) {
      const rest = random() > density;
      if (rest) {
        continue;
      }
      const degree = createLeadDegree(phraseIndex, phrase, random);
      notes.push(
        createNote({
          beat,
          bend: phrase === "lead" || random() > 0.72,
          channel: leadTrack.channel,
          durationBeats: phrase === "arp" ? 0.42 : 0.78 + random() * 0.85,
          id: `lead-${beat}-${phraseIndex}`,
          midi: degreeToMidi(rootMidi + 12, scaleId, degree),
          random,
          trackId: leadTrack.id,
          velocity: 0.52 + random() * 0.38,
        }),
      );
      phraseIndex += 1;
    }
  }

  if (padTrack) {
    for (let beat = 0; beat < totalBeats; beat += 16) {
      for (const degree of [0, 4, 7]) {
        notes.push(
          createNote({
            beat,
            channel: padTrack.channel,
            durationBeats: Math.min(15.8, totalBeats - beat),
            id: `pad-${beat}-${degree}`,
            midi: degreeToMidi(rootMidi, scaleId, degree),
            random,
            trackId: padTrack.id,
            velocity: 0.28 + random() * 0.18,
          }),
        );
      }
    }
  }

  return notes.sort(sortNotes).slice(0, 4096);
}

function createTracks(prompt: string): MidiClipTrack[] {
  const wantsPad = /\bpad|ambient|drone|sustain|cinematic\b/i.test(prompt);
  const wantsArp = /\barp|arpeggio|sequence|running\b/i.test(prompt);
  const tracks: Array<[MidiClipTrackRole, string]> = [
    ["bass", "bass"],
    ["chord", "chords"],
    [wantsArp ? "arp" : "lead", wantsArp ? "arp" : "lead"],
  ];

  if (wantsPad) {
    tracks.push(["pad", "pad"]);
  }

  return tracks.map(([role, name], index) => ({
    channel: index,
    id: role,
    mute: false,
    name,
    role,
  }));
}

function createNote({
  beat,
  bend = false,
  channel,
  durationBeats,
  id,
  midi,
  random,
  trackId,
  velocity,
}: {
  beat: number;
  bend?: boolean;
  channel: number;
  durationBeats: number;
  id: string;
  midi: number;
  random: () => number;
  trackId: string;
  velocity: number;
}): MidiClipNote {
  const humanBeat = Math.max(0, beat + (random() - 0.5) * 0.045);
  return {
    cc: bend
      ? [
          {
            beatOffset: 0,
            controller: 74,
            value: clampInt(52 + random() * 48, 0, 127),
          },
        ]
      : [],
    channel,
    durationBeats: clampNumber(durationBeats * (0.92 + random() * 0.2), 0.0625, 16),
    id,
    midi: clampInt(midi, 0, 127),
    pitchBendCents: bend ? clampNumber((random() - 0.5) * 90, -200, 200) : 0,
    startBeat: humanBeat,
    trackId,
    velocity: clampNumber(velocity + (random() - 0.5) * 0.14, 0.08, 1),
  };
}

function createFillNotes({
  clip,
  random,
  scaleId,
}: {
  clip: MidiClip;
  random: () => number;
  scaleId: string;
}) {
  const leadTrack = clip.tracks.find((track) => track.role === "lead" || track.role === "arp");
  if (!leadTrack) {
    return [];
  }

  return Array.from({ length: Math.min(clip.bars * 2, 128) }, (_, index) =>
    createNote({
      beat: index * 2 + 1.5,
      bend: index % 4 === 0,
      channel: leadTrack.channel,
      durationBeats: 0.33,
      id: `fill-${clip.seed}-${index}`,
      midi: degreeToMidi(keyToMidi(clip.key, 4), scaleId, index % 9),
      random,
      trackId: leadTrack.id,
      velocity: 0.56 + random() * 0.28,
    }),
  );
}

function createLeadDegree(index: number, phrase: "arp" | "chord" | "lead" | "pad", random: () => number) {
  const motif =
    phrase === "arp"
      ? [0, 2, 4, 7, 9, 7, 4, 2]
      : [0, 1, 2, 4, 5, 4, 7, 6, 4, 2, 1, 0];
  const base = motif[index % motif.length] ?? 0;
  return base + (random() > 0.82 ? 7 : 0);
}

function degreeToMidi(rootMidi: number, scaleId: string, degree: number) {
  const cents = getScaleDegreeCents(scaleId, degree);
  return clampInt(rootMidi + Math.round(cents / 100), 0, 127);
}

function keyToMidi(key: string, octave: number) {
  const normalized = key.trim().toUpperCase();
  const semitone = noteIndexes[normalized] ?? 0;
  return clampInt((octave + 1) * 12 + semitone, 0, 127);
}

function parseBpm(prompt: string) {
  const match = prompt.match(/\b([4-9]\d|1\d\d|2[0-5]\d|260)\s*(?:bpm|beats per minute)\b/i);
  return match ? clampInt(Number(match[1]), 40, 260) : null;
}

function parseBars(prompt: string): MidiClipBars | null {
  const match = prompt.match(/\b(2|4|8|16|32|64|128|256|512|1024)\s*(?:bar|bars)\b/i);
  const value = match ? Number(match[1]) : NaN;
  return MIDI_CLIP_BAR_OPTIONS.includes(value as MidiClipBars)
    ? (value as MidiClipBars)
    : null;
}

function parseKey(prompt: string): Tonic | null {
  const match = prompt.match(/\b(?:key of|in)\s+([A-Ga-g])([#bB]?)/);
  if (!match) {
    return null;
  }
  const normalized = `${match[1].toUpperCase()}${match[2] === "#" ? "#" : match[2]?.toLowerCase() === "b" ? "b" : ""}`;
  return tonicOptions.includes(normalized as Tonic) ? (normalized as Tonic) : null;
}

function parseScale(prompt: string) {
  return scaleAliases.find(([pattern]) => pattern.test(prompt))?.[1] ?? null;
}

function parseSwing(prompt: string) {
  if (/\bstraight\b/i.test(prompt)) {
    return 0;
  }
  if (/\bswing|swung|shuffle|garage\b/i.test(prompt)) {
    return 0.12;
  }
  return null;
}

function parseTranspose(prompt: string) {
  const up = prompt.match(/\b(?:transpose|move)\s+up\s+(-?\d+)\s*(?:semi|semitone|semitones)?/i);
  if (up) {
    return clampInt(Number(up[1]), -24, 24);
  }
  const down = prompt.match(/\b(?:transpose|move)\s+down\s+(-?\d+)\s*(?:semi|semitone|semitones)?/i);
  if (down) {
    return -clampInt(Number(down[1]), -24, 24);
  }
  return 0;
}

function inferScale(prompt: string) {
  return parseScale(prompt) ?? "minor";
}

function inferBpm(prompt: string) {
  if (/\bdrum and bass|jungle|footwork\b/i.test(prompt)) {
    return 172;
  }
  if (/\bgarage|dubstep|grime\b/i.test(prompt)) {
    return 140;
  }
  if (/\btechno|house\b/i.test(prompt)) {
    return 128;
  }
  if (/\bambient|drone\b/i.test(prompt)) {
    return 88;
  }
  return 120;
}

function inferSwing(prompt: string, previous?: number) {
  return parseSwing(prompt) ?? previous ?? 0;
}

function inferOctave(prompt: string) {
  if (/\bsub|bass|low\b/i.test(prompt)) {
    return 2;
  }
  if (/\bhigh|lead|topline\b/i.test(prompt)) {
    return 4;
  }
  return 3;
}

function inferDensity(prompt: string) {
  if (/\bsparse|minimal|space|simple\b/i.test(prompt)) {
    return 0.32;
  }
  if (/\bdense|busy|fast|complex|maximal\b/i.test(prompt)) {
    return 0.78;
  }
  return 0.56;
}

function inferPhraseStyle(prompt: string): "arp" | "chord" | "lead" | "pad" {
  if (/\barp|arpeggio|sequence|running\b/i.test(prompt)) {
    return "arp";
  }
  if (/\bchord|stab|voicing\b/i.test(prompt)) {
    return "chord";
  }
  if (/\bpad|ambient|drone|sustain\b/i.test(prompt)) {
    return "pad";
  }
  return "lead";
}

function nameFromPrompt(prompt: string, key: Tonic, scaleId: string) {
  const scale = getScaleDefinition(scaleId);
  const cleaned = prompt
    .replace(/\b\d+\s*(bpm|bar|bars)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const phrase = cleaned.split(/[,.]/)[0]?.trim();
  return phrase ? `${key} ${scale.name} - ${phrase.slice(0, 36)}` : `${key} ${scale.name} MIDI clip`;
}

function createRationale({
  bars,
  bpm,
  density,
  key,
  phrase,
  scaleId,
}: {
  bars: MidiClipBars;
  bpm: number;
  density: number;
  key: Tonic;
  phrase: string;
  scaleId: string;
}) {
  const scale = getScaleDefinition(scaleId);
  return `${bars} bar ${key} ${scale.name} MIDI clip at ${bpm} bpm with ${phrase} phrasing, density ${density.toFixed(2)}, humanized starts, velocity motion, and selective pitch/CC expression.`;
}

function sortNotes(left: MidiClipNote, right: MidiClipNote) {
  return left.startBeat - right.startBeat || left.channel - right.channel || left.midi - right.midi;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 999999);
}

function createSeededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampInt(value: number, min: number, max: number) {
  return Math.round(clampNumber(value, min, max));
}
