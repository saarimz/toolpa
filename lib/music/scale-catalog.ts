import {
  ChromaticTonics,
  ScaleDefinitionSchema,
  type ScaleDefinition,
  type ScaleTuning,
  type Tonic,
  TonicSchema,
} from "@/lib/music/context";

export type ScaleKey = {
  id: string;
  tonic: Tonic;
  scale: ScaleDefinition;
  label: string;
};

export type ScalePitchOffset = {
  cents: number;
  semitone: number;
  detuneCents: number;
};

const SOURCE_TONAL = "https://tonaljs.github.io/tonal/docs/groups/scales";
const SOURCE_SCALA = "https://www.huygens-fokker.org/microtonality/scales.html";

const coreScales = [
  scale("major", "Major", [0, 2, 4, 5, 7, 9, 11], ["bright", "stable", "diatonic"], ["ionian"]),
  scale("minor", "Natural minor", [0, 2, 3, 5, 7, 8, 10], ["dark", "sad", "diatonic"], ["aeolian"]),
  scale("dorian", "Dorian", [0, 2, 3, 5, 7, 9, 10], ["minor", "dub", "modal"], []),
  scale("phrygian", "Phrygian", [0, 1, 3, 5, 7, 8, 10], ["dark", "ritual", "modal"], []),
  scale("lydian", "Lydian", [0, 2, 4, 6, 7, 9, 11], ["bright", "floating", "modal"], []),
  scale("mixolydian", "Mixolydian", [0, 2, 4, 5, 7, 9, 10], ["dominant", "modal"], []),
  scale("locrian", "Locrian", [0, 1, 3, 5, 6, 8, 10], ["unstable", "dark", "modal"], []),
  scale("harmonic-minor", "Harmonic minor", [0, 2, 3, 5, 7, 8, 11], ["minor", "tension"], []),
  scale("melodic-minor", "Melodic minor", [0, 2, 3, 5, 7, 9, 11], ["minor", "jazz"], []),
  scale("major-pentatonic", "Major pentatonic", [0, 2, 4, 7, 9], ["open", "pentatonic"], ["pentatonic"]),
  scale("minor-pentatonic", "Minor pentatonic", [0, 3, 5, 7, 10], ["minor", "pentatonic"], []),
  scale("blues", "Blues", [0, 3, 5, 6, 7, 10], ["blues", "grit"], []),
  scale("bebop-major", "Bebop major", [0, 2, 4, 5, 7, 8, 9, 11], ["jazz", "bebop"], []),
  scale("bebop-dominant", "Bebop dominant", [0, 2, 4, 5, 7, 9, 10, 11], ["jazz", "bebop", "dominant"], []),
  scale("whole-tone", "Whole tone", [0, 2, 4, 6, 8, 10], ["dream", "symmetric"], []),
  scale("diminished-whole-half", "Diminished whole-half", [0, 2, 3, 5, 6, 8, 9, 11], ["symmetric", "tension"], ["octatonic"]),
  scale("diminished-half-whole", "Diminished half-whole", [0, 1, 3, 4, 6, 7, 9, 10], ["symmetric", "dominant"], []),
  scale("augmented", "Augmented", [0, 3, 4, 7, 8, 11], ["symmetric", "strange"], []),
  scale("chromatic", "Chromatic", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ["atonal", "all-notes"], []),
  scale("double-harmonic", "Double harmonic", [0, 1, 4, 5, 7, 8, 11], ["exotic", "middle-eastern"], ["byzantine"]),
  scale("hungarian-minor", "Hungarian minor", [0, 2, 3, 6, 7, 8, 11], ["exotic", "minor"], []),
  scale("persian", "Persian", [0, 1, 4, 5, 6, 8, 11], ["exotic", "middle-eastern", "dark"], []),
  scale("enigmatic", "Enigmatic", [0, 1, 4, 6, 8, 10, 11], ["exotic", "unstable"], []),
  scale("neapolitan-minor", "Neapolitan minor", [0, 1, 3, 5, 7, 8, 11], ["exotic", "minor"], []),
  scale("neapolitan-major", "Neapolitan major", [0, 1, 3, 5, 7, 9, 11], ["exotic", "bright"], []),
  scale("hirajoshi", "Hirajoshi", [0, 2, 3, 7, 8], ["japanese", "pentatonic", "sparse"], []),
  scale("in-sen", "In-sen", [0, 1, 5, 7, 10], ["japanese", "pentatonic", "dark"], []),
  scale("iwato", "Iwato", [0, 1, 5, 6, 10], ["japanese", "sparse", "dark"], []),
  scale("kumoi", "Kumoi", [0, 2, 3, 7, 9], ["japanese", "pentatonic"], []),
  scale("yo", "Yo", [0, 2, 5, 7, 9], ["japanese", "pentatonic", "bright"], []),
  scale("balinese-pelog", "Balinese pelog", [0, 1, 3, 7, 8], ["gamelan", "exotic", "sparse"], ["pelog"]),
  scale("slendro", "Slendro approximation", [0, 2, 5, 7, 10], ["gamelan", "pentatonic"], []),
  scale("messiaen-mode-2", "Messiaen mode 2", [0, 1, 3, 4, 6, 7, 9, 10], ["symmetric", "limited-transposition"], []),
  scale("messiaen-mode-3", "Messiaen mode 3", [0, 2, 3, 4, 6, 7, 8, 10, 11], ["symmetric", "limited-transposition"], []),
  scale("romanian-minor", "Romanian minor", [0, 2, 3, 6, 7, 9, 10], ["minor", "exotic"], []),
  scale("ukrainian-dorian", "Ukrainian dorian", [0, 2, 3, 6, 7, 9, 10], ["minor", "raised-fourth"], []),
  scale("arabic", "Arabic", [0, 2, 4, 5, 6, 8, 10], ["exotic", "middle-eastern"], []),
  scale("spanish-gypsy", "Spanish gypsy", [0, 1, 4, 5, 7, 8, 10], ["flamenco", "exotic"], ["phrygian-dominant"]),
  scale("altered", "Altered", [0, 1, 3, 4, 6, 8, 10], ["jazz", "dominant", "tension"], ["super-locrian"]),
  scale("lydian-dominant", "Lydian dominant", [0, 2, 4, 6, 7, 9, 10], ["jazz", "bright", "dominant"], []),
];

const microtonalScales = [
  edo("quarter-tone-chromatic", "24-EDO quarter-tone chromatic", 24, range(24), ["microtonal", "quarter-tone", "all-notes"]),
  edo("quarter-tone-neutral", "24-EDO neutral mode", 24, [0, 3, 6, 10, 14, 17, 20], ["microtonal", "quarter-tone", "neutral"]),
  edo("19-edo-diatonic", "19-EDO diatonic approximation", 19, [0, 3, 6, 8, 11, 14, 17], ["microtonal", "edo", "diatonic"]),
  edo("31-edo-meantone", "31-EDO meantone mode", 31, [0, 5, 10, 13, 18, 23, 28], ["microtonal", "edo", "meantone"]),
  cents("slendro-cents", "Slendro cents", [0, 240, 480, 720, 960], ["microtonal", "gamelan", "pentatonic"]),
  cents("pelog-cents", "Pelog cents", [0, 133, 316, 702, 836], ["microtonal", "gamelan", "exotic"]),
  ratios("just-major", "Just intonation major", ["1/1", "9/8", "5/4", "4/3", "3/2", "5/3", "15/8"], ["just-intonation", "harmonic"]),
  ratios("just-minor", "Just intonation minor", ["1/1", "9/8", "6/5", "4/3", "3/2", "8/5", "9/5"], ["just-intonation", "minor"]),
  cents("bohlen-pierce-mode", "Bohlen-Pierce mode", [0, 146, 293, 439, 586, 732, 878, 1025, 1171, 1318, 1464, 1611, 1757, 1902], ["microtonal", "non-octave", "tritave"], 1901.955),
];

export const scaleDefinitions: ScaleDefinition[] = [
  ...coreScales,
  ...microtonalScales,
].map((definition) => ScaleDefinitionSchema.parse(definition));

const scaleById = new Map(scaleDefinitions.map((definition) => [definition.id, definition]));
const adHocScaleById = new Map<string, ScaleDefinition>();

export function getScaleDefinitions() {
  return [...scaleDefinitions, ...adHocScaleById.values()];
}

export function getScaleDefinition(scaleId: string) {
  return (
    adHocScaleById.get(scaleId) ??
    scaleById.get(scaleId) ??
    scaleById.get("minor") ??
    scaleDefinitions[0]
  );
}

export function registerAdHocScaleDefinition(
  definition: ScaleDefinition,
): ScaleDefinition {
  const parsed = ScaleDefinitionSchema.parse({
    ...definition,
    source: "tool-generated",
  });
  adHocScaleById.set(parsed.id, parsed);
  return parsed;
}

export function getAdHocScaleDefinitions() {
  return [...adHocScaleById.values()];
}

export function clearAdHocScaleDefinitions() {
  adHocScaleById.clear();
}

export function getScaleKeys(): ScaleKey[] {
  return ChromaticTonics.flatMap((tonic) =>
    getScaleDefinitions().map((scaleDefinition) => ({
      id: `${tonic}:${scaleDefinition.id}`,
      tonic,
      scale: scaleDefinition,
      label: `${tonic} ${scaleDefinition.name}`,
    })),
  );
}

export function resolveScaleKey({
  scaleId,
  tonic,
}: {
  scaleId: string;
  tonic: string;
}): ScaleKey {
  const parsedTonic = TonicSchema.catch("C").parse(tonic);
  const scaleDefinition = getScaleDefinition(scaleId);

  return {
    id: `${parsedTonic}:${scaleDefinition.id}`,
    tonic: parsedTonic,
    scale: scaleDefinition,
    label: `${parsedTonic} ${scaleDefinition.name}`,
  };
}

export function searchScaleKeys(
  query: string,
  options: { limit?: number; tonic?: string } = {},
): ScaleKey[] {
  const tokens = tokenize(query);
  const keys = options.tonic
    ? getScaleKeys().filter((key) => key.tonic === TonicSchema.catch("C").parse(options.tonic))
    : getScaleKeys();

  if (tokens.length === 0) {
    return keys.slice(0, options.limit ?? 12);
  }

  return keys
    .map((key) => ({ key, score: scoreScaleKey(key, tokens) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.key.label.localeCompare(right.key.label))
    .slice(0, options.limit ?? 12)
    .map((candidate) => candidate.key);
}

export function getScalePitchOffsets(scaleId: string): ScalePitchOffset[] {
  const scaleDefinition = getScaleDefinition(scaleId);
  const cents = centsFromTuning(scaleDefinition.tuning);

  return cents.map((centValue) => {
    const semitone = Math.round(centValue / 100);
    const detuneCents = roundCents(centValue - semitone * 100);
    return { cents: roundCents(centValue), semitone, detuneCents };
  });
}

export function getScaleSemitoneApproximation(scaleId: string): number[] {
  return uniqueSorted(getScalePitchOffsets(scaleId).map((offset) => mod(offset.semitone, 12)));
}

export function getScaleDegreeCents(scaleId: string, degree: number) {
  const scaleDefinition = getScaleDefinition(scaleId);
  const cents = centsFromTuning(scaleDefinition.tuning);
  if (cents.length === 0) {
    return 0;
  }

  const periodCents = periodCentsFromTuning(scaleDefinition.tuning);
  const octave = Math.floor(degree / cents.length);
  const degreeIndex = mod(degree, cents.length);

  return roundCents((cents[degreeIndex] ?? 0) + octave * periodCents);
}

function scale(
  id: string,
  name: string,
  intervals: number[],
  tags: string[],
  aliases: string[] = [],
): ScaleDefinition {
  return {
    id,
    name,
    family: "12-tone equal temperament",
    aliases,
    tags,
    description: `${name} as a 12-TET pitch-class collection.`,
    microtonal: false,
    tuning: { kind: "12tet", intervals, periodCents: 1200 },
    source: "tonal-compatible",
    sourceUrl: SOURCE_TONAL,
  };
}

function edo(
  id: string,
  name: string,
  divisions: number,
  steps: number[],
  tags: string[],
): ScaleDefinition {
  return {
    id,
    name,
    family: `${divisions}-EDO`,
    aliases: [],
    tags,
    description: `${name}; ${divisions} equal divisions of the octave.`,
    microtonal: true,
    tuning: { kind: "edo", divisions, steps, periodCents: 1200 },
    source: "scala-compatible",
    sourceUrl: SOURCE_SCALA,
  };
}

function cents(
  id: string,
  name: string,
  centValues: number[],
  tags: string[],
  periodCents = 1200,
): ScaleDefinition {
  return {
    id,
    name,
    family: periodCents === 1200 ? "microtonal cents" : "non-octave cents",
    aliases: [],
    tags,
    description: `${name}; explicit cents table compatible with Scala-style scale data.`,
    microtonal: true,
    tuning: { kind: "cents", cents: centValues, periodCents },
    source: "scala-compatible",
    sourceUrl: SOURCE_SCALA,
  };
}

function ratios(
  id: string,
  name: string,
  ratioValues: string[],
  tags: string[],
): ScaleDefinition {
  return {
    id,
    name,
    family: "just intonation",
    aliases: [],
    tags,
    description: `${name}; ratio-based tuning compatible with Scala-style scale data.`,
    microtonal: true,
    tuning: { kind: "ratios", ratios: ratioValues, periodRatio: "2/1" },
    source: "scala-compatible",
    sourceUrl: SOURCE_SCALA,
  };
}

function centsFromTuning(tuning: ScaleTuning): number[] {
  if (tuning.kind === "12tet") {
    return tuning.intervals.map((interval) => interval * 100);
  }

  if (tuning.kind === "edo") {
    return tuning.steps.map((step) => (step * tuning.periodCents) / tuning.divisions);
  }

  if (tuning.kind === "cents") {
    return tuning.cents;
  }

  return tuning.ratios.map(ratioToCents);
}

function periodCentsFromTuning(tuning: ScaleTuning) {
  if (tuning.kind === "ratios") {
    return ratioToCents(tuning.periodRatio);
  }

  return tuning.periodCents;
}

function ratioToCents(ratio: string) {
  const [numeratorRaw, denominatorRaw] = ratio.split("/");
  const numerator = Number(numeratorRaw);
  const denominator = denominatorRaw ? Number(denominatorRaw) : 1;
  return 1200 * Math.log2(numerator / denominator);
}

function scoreScaleKey(key: ScaleKey, tokens: string[]) {
  const scale = key.scale;
  const fields = [
    key.tonic,
    key.label,
    scale.id,
    scale.name,
    scale.family,
    scale.description,
    ...scale.aliases,
    ...scale.tags,
  ].map((value) => value.toLowerCase());
  const joined = fields.join(" ");

  return tokens.reduce((score, token) => {
    if (token === key.tonic.toLowerCase()) {
      return score + 8;
    }

    if (token === "microtonal" && scale.microtonal) {
      return score + 8;
    }

    if (scale.tags.some((tag) => tag.toLowerCase() === token)) {
      return score + 6;
    }

    if (scale.aliases.some((alias) => alias.toLowerCase() === token)) {
      return score + 5;
    }

    if (scale.id.includes(token) || scale.name.toLowerCase().includes(token)) {
      return score + 4;
    }

    if (joined.includes(token)) {
      return score + 2;
    }

    return score;
  }, 0);
}

function tokenize(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9#]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function range(length: number) {
  return Array.from({ length }, (_, index) => index);
}

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function mod(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

function roundCents(value: number) {
  return Math.round(value * 1000) / 1000;
}
