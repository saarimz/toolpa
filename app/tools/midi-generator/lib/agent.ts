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
  type MidiClipBeatsPerBar,
  type MidiClipGenerationMode,
  type MidiClipNote,
  type MidiClipStyleProfile,
  type MidiClipTrack,
  type MidiClipTrackRole,
} from "./schema";

export type GenerateMidiClipInput = {
  generationMode?: MidiClipGenerationMode;
  styleProfile?: MidiClipStyleProfile;
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

type ResolvedMidiClipGenerationMode = Exclude<MidiClipGenerationMode, "auto">;
type ResolvedMidiClipStyleProfile = Exclude<MidiClipStyleProfile, "auto">;
type MidiClipPhraseStyle = "arp" | "chord" | "lead" | "pad";

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
    "Honor the part-focus contract before writing notes: full arrangement, melody, harmony, bassline, arpeggio, rhythm, or pad.",
    "Honor the style-profile contract separately from part focus: neutral, lyrical-sparse, minimal-cyclic, spacious-pointillist, organic-hybrid, groove-forward, broken-beat, ambient-sustained, or percussive-grid.",
    "Generate musical MIDI that would be hard to program by hand: humanized starts, velocity arcs, passing tones, bends, chord movement, sparse rests, and call-response phrases.",
    "The clip must be exportable as Standard MIDI and previewable through a simple sine synth.",
  ].join("\n");
}

export function buildMidiGeneratorPrompt({
  clip,
  generationMode = "auto",
  musicalContext,
  prompt,
  styleProfile = "auto",
}: {
  clip: MidiClip;
  generationMode?: MidiClipGenerationMode;
  musicalContext?: GlobalMusicContext | null;
  prompt: string;
  styleProfile?: MidiClipStyleProfile;
}) {
  const scale = getScaleDefinition(clip.scaleId);
  const globalScale = musicalContext
    ? getScaleDefinition(musicalContext.key.scaleId)
    : null;

  return [
    `user prompt: ${prompt || "generate an expressive MIDI clip"}`,
    `part focus: ${resolveMidiGenerationMode(prompt, generationMode)}${generationMode === "auto" ? " (auto)" : ""}`,
    `style profile: ${resolveMidiStyleProfile(prompt, styleProfile)}${styleProfile === "auto" ? " (auto)" : ""}`,
    `current clip: ${clip.key} ${scale.name}, ${clip.bpm} bpm, ${clip.bars} bars, ${clip.beatsPerBar} beats/bar`,
    `tracks: ${clip.tracks.map((track) => `${track.name}:${track.role}`).join(", ")}`,
    musicalContext
      ? `global music context: ${musicalContext.key.tonic} ${globalScale?.name ?? musicalContext.key.scaleId}, ${musicalContext.bpm} bpm, swing ${musicalContext.swing}`
      : "",
    "Output should stay as MIDI notes with expressive timing, velocity, bends, and CC intent.",
  ].filter(Boolean).join("\n");
}

export function generateMidiClipFromPrompt({
  generationMode = "auto",
  musicalContext,
  previousClip = null,
  prompt,
  seed,
  styleProfile = "auto",
}: GenerateMidiClipInput): MidiClip {
  const normalizedPrompt = prompt.trim();
  const nextSeed =
    seed ??
    (previousClip
      ? (previousClip.seed + 104729) % 999999
      : hashString(normalizedPrompt || "midi-generator"));
  const random = createSeededRandom(nextSeed);
  const contextPatch = inferContextPatch(normalizedPrompt);
  const resolvedGenerationMode = resolveMidiGenerationMode(normalizedPrompt, generationMode);
  const resolvedStyleProfile = resolveMidiStyleProfile(normalizedPrompt, styleProfile);
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
    inferStyleSwing(resolvedStyleProfile) ??
    musicalContext?.swing ??
    previousClip?.swing ??
    inferSwing(normalizedPrompt);
  const bars = parseBars(normalizedPrompt) ?? previousClip?.bars ?? 8;
  const beatsPerBar =
    parseBeatsPerBar(normalizedPrompt) ??
    inferBeatsPerBar(resolvedStyleProfile) ??
    previousClip?.beatsPerBar ??
    4;
  const tracks = createTracks(normalizedPrompt, resolvedGenerationMode);
  const rootMidi = keyToMidi(key, inferOctave(normalizedPrompt));
  const density = inferDensity(normalizedPrompt, resolvedGenerationMode, resolvedStyleProfile);
  const phrase = inferPhraseStyle(normalizedPrompt, resolvedGenerationMode, resolvedStyleProfile);
  const notes = createExpressiveNotes({
    bars,
    beatsPerBar,
    density,
    phrase,
    prompt: normalizedPrompt,
    random,
    rootMidi,
    scaleId,
    styleProfile: resolvedStyleProfile,
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
    beatsPerBar,
    stepsPerBar: bars >= 256 ? 4 : bars >= 64 ? 8 : 16,
    seed: nextSeed,
    tracks,
    notes,
    metadata: {
      createdBy: "local-agent",
      editPrompt: "",
      generationMode: resolvedGenerationMode,
      styleProfile: resolvedStyleProfile,
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
        beatsPerBar,
        density,
        generationMode: resolvedGenerationMode,
        key,
        phrase,
        scaleId,
        styleProfile: resolvedStyleProfile,
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
      generationMode: resolveMidiGenerationMode(normalizedPrompt, "auto"),
      musicalContext,
      previousClip: clip,
      prompt: normalizedPrompt || clip.metadata.prompt,
      styleProfile: resolveMidiStyleProfile(normalizedPrompt, "auto"),
    });
  }

  const requestedGenerationMode = inferMidiGenerationMode(normalizedPrompt);
  const requestedStyleProfile = inferMidiStyleProfile(normalizedPrompt);
  if (
    (requestedGenerationMode && requestedGenerationMode !== clip.metadata.generationMode) ||
    (requestedStyleProfile && requestedStyleProfile !== clip.metadata.styleProfile)
  ) {
    return generateMidiClipFromPrompt({
      generationMode: requestedGenerationMode ?? clip.metadata.generationMode,
      musicalContext,
      previousClip: clip,
      prompt: normalizedPrompt || clip.metadata.prompt,
      styleProfile: requestedStyleProfile ?? clip.metadata.styleProfile,
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
        clip.bars * clip.beatsPerBar - 0.0625,
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

export function resolveMidiGenerationMode(
  prompt: string,
  requestedMode: MidiClipGenerationMode = "auto",
): ResolvedMidiClipGenerationMode {
  return requestedMode === "auto"
    ? inferMidiGenerationMode(prompt) ?? "full"
    : requestedMode;
}

export function inferMidiGenerationMode(
  prompt: string,
): ResolvedMidiClipGenerationMode | null {
  const hasBass = /\b(bassline|bass line|bass|sub|808)\b/i.test(prompt);
  const hasHarmony = /\b(harmony|harmonic|chord|chords|voicing|progression|stab)\b/i.test(prompt);
  const hasMelody = /\b(melody|melodic|lead|topline|hook|riff|countermelody)\b/i.test(prompt);
  const hasArp = /\b(arp|arpeggio|arpeggiated|sequence|sequenced|ostinato)\b/i.test(prompt);
  const hasRhythm = /\b(rhythm|rhythmic|drum|drums|percussion|percussive|beat)\b/i.test(prompt);
  const hasPad = /\b(pad|drone|sustain|sustained)\b/i.test(prompt);
  const requestedPartCount = [hasBass, hasHarmony, hasMelody, hasArp, hasRhythm, hasPad]
    .filter(Boolean).length;

  if (/\b(full|arrangement|all parts|multi[- ]part|whole piece)\b/i.test(prompt)) {
    return "full";
  }
  if (requestedPartCount > 1 && !hasArp) {
    return "full";
  }
  if (hasRhythm) {
    return "rhythm";
  }
  if (hasArp) {
    return "arpeggio";
  }
  if (hasBass) {
    return "bassline";
  }
  if (hasHarmony) {
    return "harmony";
  }
  if (hasMelody) {
    return "melody";
  }
  if (hasPad) {
    return "pad";
  }
  if (/\b(minimalist|minimal cyclic|repetitive structure|philip glass|glass-like)\b/i.test(prompt)) {
    return "arpeggio";
  }
  return null;
}

export function resolveMidiStyleProfile(
  prompt: string,
  requestedProfile: MidiClipStyleProfile = "auto",
): ResolvedMidiClipStyleProfile {
  return requestedProfile === "auto"
    ? inferMidiStyleProfile(prompt) ?? "neutral"
    : requestedProfile;
}

export function inferMidiStyleProfile(
  prompt: string,
): ResolvedMidiClipStyleProfile | null {
  if (/\b(satie|gymnopedie|gymnopédie|gnossienne|spare|transparent|simple melody|lyrical)\b/i.test(prompt)) {
    return "lyrical-sparse";
  }
  if (/\b(philip glass|glass-like|minimalist|minimal cyclic|repetitive structure|cyclic|phasing|ostinato)\b/i.test(prompt)) {
    return "minimal-cyclic";
  }
  if (/\b(morton feldman|feldman|pointillist|pointillism|spacious|floating|quiet fragments|late abstract)\b/i.test(prompt)) {
    return "spacious-pointillist";
  }
  if (/\b(fourth world|fourth-world|organic hybrid|global ambient|ritual|hand percussion|woodwind|modal folk)\b/i.test(prompt)) {
    return "organic-hybrid";
  }
  if (/\b(jungle|drum and bass|dnb|breakbeat|broken beat|footwork)\b/i.test(prompt)) {
    return "broken-beat";
  }
  if (/\b(garage|techno|house|groove|four on the floor|four-on-the-floor)\b/i.test(prompt)) {
    return "groove-forward";
  }
  if (/\b(ambient|drone|sustain|sustained|cinematic|wash)\b/i.test(prompt)) {
    return "ambient-sustained";
  }
  if (/\b(rhythm|rhythmic|percussion|percussive|drum grid)\b/i.test(prompt)) {
    return "percussive-grid";
  }
  return null;
}

function createExpressiveNotes({
  bars,
  beatsPerBar,
  density,
  phrase,
  prompt,
  random,
  rootMidi,
  scaleId,
  styleProfile,
  tracks,
}: {
  bars: MidiClipBars;
  beatsPerBar: MidiClipBeatsPerBar;
  density: number;
  phrase: MidiClipPhraseStyle;
  prompt: string;
  random: () => number;
  rootMidi: number;
  scaleId: string;
  styleProfile: ResolvedMidiClipStyleProfile;
  tracks: MidiClipTrack[];
}) {
  const notes: MidiClipNote[] = [];
  const totalBeats = bars * beatsPerBar;
  const bassTrack = tracks.find((track) => track.role === "bass");
  const chordTrack = tracks.find((track) => track.role === "chord");
  const leadTrack = tracks.find((track) => track.role === "lead" || track.role === "arp");
  const padTrack = tracks.find((track) => track.role === "pad");
  const drumTrack = tracks.find((track) => track.role === "drum");
  const wantsSlides = /\bslide|glide|bend|acid|303\b/i.test(prompt);
  const wantsGhostNotes = /\bghost|pickup|grace\b/i.test(prompt);

  if (bassTrack) {
    const interval =
      styleProfile === "spacious-pointillist"
        ? beatsPerBar * 2
        : density > 0.7
          ? 1
          : styleProfile === "lyrical-sparse"
            ? beatsPerBar
            : 2;
    for (let beat = 0; beat < totalBeats; beat += interval) {
      const bar = Math.floor(beat / beatsPerBar);
      const degree =
        styleProfile === "minimal-cyclic"
          ? [0, 0, 4, 5, 4, 0][bar % 6] ?? 0
          : [0, 4, 5, 3][bar % 4] ?? 0;
      notes.push(
        createNote({
          beat,
          bend: wantsSlides,
          channel: bassTrack.channel,
          durationBeats:
            styleProfile === "lyrical-sparse"
              ? Math.max(0.9, beatsPerBar * 0.42)
              : density > 0.7
                ? 0.82
                : 1.65,
          id: `bass-${beat}`,
          midi: degreeToMidi(rootMidi - 12, scaleId, degree),
          random,
          trackId: bassTrack.id,
          velocity:
            styleProfile === "spacious-pointillist"
              ? 0.26
              : styleProfile === "lyrical-sparse"
                ? 0.42
                : 0.64 + density * 0.18,
        }),
      );
      if (wantsGhostNotes && beat + 0.5 < totalBeats && random() > 0.45) {
        notes.push(
          createNote({
            beat: beat + 0.5,
            bend: wantsSlides,
            channel: bassTrack.channel,
            durationBeats: 0.22,
            id: `bass-ghost-${beat}`,
            midi: degreeToMidi(rootMidi - 12, scaleId, degree + 1),
            random,
            trackId: bassTrack.id,
            velocity: 0.24 + random() * 0.18,
          }),
        );
      }
    }
  }

  if (chordTrack) {
    const chordStride =
      styleProfile === "spacious-pointillist"
        ? beatsPerBar * 2
        : styleProfile === "lyrical-sparse"
        ? beatsPerBar
        : phrase === "chord"
          ? Math.max(1, beatsPerBar / 2)
          : beatsPerBar;
    for (let beat = 0; beat < totalBeats; beat += chordStride) {
      const bar = Math.floor(beat / beatsPerBar);
      const chordRoot =
        styleProfile === "minimal-cyclic"
          ? [0, 2, 4, 2][bar % 4] ?? 0
          : [0, 3, 4, 5][bar % 4] ?? 0;
      const degrees = [0, 2, 4].map((degree) => degree + chordRoot);
      for (const [index, degree] of degrees.entries()) {
        notes.push(
          createNote({
            beat:
              styleProfile === "lyrical-sparse"
                ? beat + Math.min(index + 1, Math.max(1, beatsPerBar - 1))
                : beat + index * 0.012,
            channel: chordTrack.channel,
            durationBeats:
              styleProfile === "spacious-pointillist"
                ? Math.max(1.2, beatsPerBar * 1.5)
                : styleProfile === "lyrical-sparse"
                ? Math.max(0.68, beatsPerBar - 1.05)
                : phrase === "pad"
                  ? 7.8
                  : 2.8,
            id: `chord-${beat}-${index}`,
            midi: degreeToMidi(rootMidi, scaleId, degree),
            random,
            trackId: chordTrack.id,
            velocity:
              styleProfile === "spacious-pointillist"
                ? 0.22 + index * 0.03
                : styleProfile === "lyrical-sparse"
                ? 0.32 + index * 0.04
                : 0.46 + index * 0.06,
          }),
        );
      }
    }
  }

  if (leadTrack) {
    const leadInterval =
      styleProfile === "minimal-cyclic"
        ? 0.5
        : styleProfile === "spacious-pointillist"
          ? beatsPerBar * 2
          : styleProfile === "organic-hybrid"
            ? 0.75
            : styleProfile === "lyrical-sparse"
          ? Math.max(1, beatsPerBar)
          : density > 0.72
            ? 0.5
            : density > 0.45
              ? 1
              : 2;
    let phraseIndex = 0;
    for (let beat = phrase === "pad" ? 2 : 0; beat < totalBeats; beat += leadInterval) {
      const rest =
        styleProfile === "minimal-cyclic" || styleProfile === "spacious-pointillist"
          ? false
          : random() > density;
      if (rest) {
        continue;
      }
      const degree = createLeadDegree(phraseIndex, phrase, styleProfile, random);
      notes.push(
        createNote({
          beat,
          bend:
            styleProfile !== "lyrical-sparse" &&
            styleProfile !== "spacious-pointillist" &&
            (phrase === "lead" || random() > 0.72),
          channel: leadTrack.channel,
          durationBeats:
            styleProfile === "spacious-pointillist"
              ? Math.max(1.6, beatsPerBar * 1.2)
              : styleProfile === "lyrical-sparse"
              ? Math.max(1, beatsPerBar * 0.82)
              : phrase === "arp"
                ? styleProfile === "minimal-cyclic"
                  ? 0.48
                  : 0.42
                : 0.78 + random() * 0.85,
          id: `lead-${beat}-${phraseIndex}`,
          midi: degreeToMidi(rootMidi + 12, scaleId, degree),
          random,
          trackId: leadTrack.id,
          velocity:
            styleProfile === "spacious-pointillist"
              ? 0.24 + random() * 0.16
              : styleProfile === "lyrical-sparse"
              ? 0.38 + random() * 0.2
              : 0.52 + random() * 0.38,
        }),
      );
      phraseIndex += 1;
    }
  }

  if (padTrack) {
    for (let beat = 0; beat < totalBeats; beat += styleProfile === "minimal-cyclic" ? 8 : 16) {
      for (const degree of [0, 4, 7]) {
        notes.push(
          createNote({
            beat,
            channel: padTrack.channel,
            durationBeats: Math.min(
              styleProfile === "minimal-cyclic" ? 7.8 : 15.8,
              totalBeats - beat,
            ),
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

  if (drumTrack) {
    const hatStep =
      styleProfile === "broken-beat" || styleProfile === "groove-forward"
        ? 0.5
        : styleProfile === "organic-hybrid"
          ? 0.75
          : 1;
    for (let beat = 0; beat < totalBeats; beat += 1) {
      const beatInBar = beat % beatsPerBar;
      notes.push(
        createNote({
          beat,
          channel: drumTrack.channel,
          durationBeats: 0.08,
          id: `kick-${beat}`,
          midi: styleProfile === "broken-beat" && beatInBar === beatsPerBar - 1 ? 38 : 36,
          random,
          trackId: drumTrack.id,
          velocity: beatInBar === 0 ? 0.9 : 0.54,
        }),
      );
      if (beatInBar === Math.floor(beatsPerBar / 2)) {
        notes.push(
          createNote({
            beat,
            channel: drumTrack.channel,
            durationBeats: 0.08,
            id: `snare-${beat}`,
            midi: 38,
            random,
            trackId: drumTrack.id,
            velocity: 0.76,
          }),
        );
      }
    }
    for (let beat = 0; beat < totalBeats; beat += hatStep) {
      notes.push(
        createNote({
          beat: beat + 0.02,
          channel: drumTrack.channel,
          durationBeats: 0.05,
          id: `hat-${beat}`,
          midi: random() > 0.84 ? 46 : 42,
          random,
          trackId: drumTrack.id,
          velocity: 0.28 + random() * 0.42,
        }),
      );
    }
  }

  return notes.sort(sortNotes).slice(0, 4096);
}

function createTracks(
  prompt: string,
  generationMode: ResolvedMidiClipGenerationMode,
): MidiClipTrack[] {
  const wantsPad = /\bpad|ambient|drone|sustain|cinematic\b/i.test(prompt);
  const wantsArp = /\barp|arpeggio|sequence|running\b/i.test(prompt);

  const tracks: Array<[MidiClipTrackRole, string]> =
    generationMode === "bassline"
      ? [["bass", "bassline"]]
      : generationMode === "harmony"
        ? [["chord", "harmony"]]
        : generationMode === "melody"
          ? [["lead", "melody"]]
          : generationMode === "arpeggio"
            ? [["arp", "arpeggio"]]
            : generationMode === "rhythm"
              ? [["drum", "rhythm"]]
              : generationMode === "pad"
                ? [["pad", "pad"]]
                : [
                    ["bass", "bass"],
                    ["chord", "chords"],
                    [wantsArp ? "arp" : "lead", wantsArp ? "arp" : "lead"],
                  ];

  if (generationMode === "full" && wantsPad) {
    tracks.push(["pad", "pad"]);
  }

  return tracks.map(([role, name], index) => ({
    channel: role === "drum" ? 9 : index,
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

function createLeadDegree(
  index: number,
  phrase: MidiClipPhraseStyle,
  styleProfile: ResolvedMidiClipStyleProfile,
  random: () => number,
) {
  const motif =
    styleProfile === "minimal-cyclic"
      ? [0, 2, 4, 7, 4, 2, 5, 7]
      : styleProfile === "lyrical-sparse"
        ? [0, 1, 2, 4, 2, 1, 0]
        : styleProfile === "spacious-pointillist"
          ? [0, 7, 2, 9, 4, 11]
          : styleProfile === "organic-hybrid"
            ? [0, 2, 3, 5, 7, 5, 2]
        : phrase === "arp"
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

function parseBeatsPerBar(prompt: string): MidiClipBeatsPerBar | null {
  const explicit = prompt.match(/\b([2-7])\s*\/\s*(?:4|8)\b/);
  if (explicit) {
    return Number(explicit[1]) as MidiClipBeatsPerBar;
  }
  if (/\bwaltz|triple meter|three beat|three-beat\b/i.test(prompt)) {
    return 3;
  }
  return null;
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

function inferStyleSwing(styleProfile: ResolvedMidiClipStyleProfile) {
  if (styleProfile === "broken-beat" || styleProfile === "groove-forward") {
    return 0.12;
  }
  if (styleProfile === "organic-hybrid") {
    return 0.08;
  }
  if (
    styleProfile === "lyrical-sparse" ||
    styleProfile === "spacious-pointillist" ||
    styleProfile === "minimal-cyclic"
  ) {
    return 0;
  }
  return null;
}

function inferBeatsPerBar(styleProfile: ResolvedMidiClipStyleProfile) {
  if (styleProfile === "lyrical-sparse") {
    return 3;
  }
  if (styleProfile === "organic-hybrid") {
    return 5;
  }
  return null;
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

function inferDensity(
  prompt: string,
  generationMode: ResolvedMidiClipGenerationMode,
  styleProfile: ResolvedMidiClipStyleProfile,
) {
  if (/\bsparse|minimal|space|simple\b/i.test(prompt)) {
    return 0.32;
  }
  if (/\bdense|busy|fast|complex|maximal\b/i.test(prompt)) {
    return 0.78;
  }
  if (styleProfile === "spacious-pointillist") {
    return 0.18;
  }
  if (styleProfile === "lyrical-sparse") {
    return 0.3;
  }
  if (styleProfile === "minimal-cyclic") {
    return 0.82;
  }
  if (styleProfile === "broken-beat") {
    return 0.76;
  }
  if (styleProfile === "groove-forward") {
    return 0.64;
  }
  if (styleProfile === "organic-hybrid") {
    return 0.52;
  }
  if (styleProfile === "ambient-sustained") {
    return 0.24;
  }
  if (generationMode === "bassline" || generationMode === "rhythm") {
    return 0.64;
  }
  return 0.56;
}

function inferPhraseStyle(
  prompt: string,
  generationMode: ResolvedMidiClipGenerationMode,
  styleProfile: ResolvedMidiClipStyleProfile,
): MidiClipPhraseStyle {
  if (generationMode === "harmony") {
    return "chord";
  }
  if (generationMode === "arpeggio") {
    return "arp";
  }
  if (generationMode === "pad") {
    return "pad";
  }
  if (generationMode === "melody") {
    return "lead";
  }
  if (/\barp|arpeggio|sequence|running\b/i.test(prompt)) {
    return "arp";
  }
  if (/\bchord|stab|voicing\b/i.test(prompt)) {
    return "chord";
  }
  if (/\bpad|ambient|drone|sustain\b/i.test(prompt)) {
    return "pad";
  }
  if (styleProfile === "minimal-cyclic") {
    return "arp";
  }
  if (styleProfile === "ambient-sustained") {
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
  beatsPerBar,
  bpm,
  density,
  generationMode,
  key,
  phrase,
  scaleId,
  styleProfile,
}: {
  bars: MidiClipBars;
  beatsPerBar: MidiClipBeatsPerBar;
  bpm: number;
  density: number;
  generationMode: ResolvedMidiClipGenerationMode;
  key: Tonic;
  phrase: string;
  scaleId: string;
  styleProfile: ResolvedMidiClipStyleProfile;
}) {
  const scale = getScaleDefinition(scaleId);
  return `${bars} bar ${beatsPerBar}/4 ${generationMode} MIDI clip in ${key} ${scale.name} at ${bpm} bpm with ${styleProfile} style, ${phrase} phrasing, density ${density.toFixed(2)}, humanized starts, velocity motion, and selective pitch/CC expression.`;
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
