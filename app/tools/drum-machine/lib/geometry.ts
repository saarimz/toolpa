import {
  createPattern,
  createStep,
  createTrack,
  type Pattern,
  type Track,
} from "@/lib/pattern/schema";
import type { DrumTrackSampleContext } from "@/lib/ai/contracts";

export type GeometryAlgorithm =
  | "complement"
  | "direct"
  | "euclidean"
  | "known-necklace";

export type GeometryTrackPlan = {
  algorithm: GeometryAlgorithm;
  decay?: number;
  hits: number;
  id: string;
  name: string;
  onsets?: number[];
  pan?: number;
  pitchSemitones?: number;
  probability?: number;
  pulses: number;
  rotation: number;
  slot: number;
  velocity: number;
};

export type GeometryPromptPlan = {
  bpm: number;
  name: string;
  rationale: string;
  source: "formula" | "prompt" | "preset";
  steps: string[];
  swing: number;
  tags: string[];
  tracks: GeometryTrackPlan[];
};

export type GeometryTrackSummary = {
  density: number;
  evenness: number;
  formula: string;
  fullIntervalVector: number[];
  hasRhythmicOddity: boolean;
  interOnsetIntervals: number[];
  offBeatness: number;
  onsets: number[];
  pulses: number;
  rotation: number | null;
};

type RhythmPreset = {
  aliases: string[];
  bpm: number;
  hits: number;
  name: string;
  onsets?: number[];
  pulses: number;
  rotation: number;
  swing: number;
  tags: string[];
};

const rhythmPresets: RhythmPreset[] = [
  {
    aliases: ["bossa", "bossa nova", "bossanova"],
    bpm: 132,
    hits: 5,
    name: "bossa nova necklace",
    pulses: 16,
    rotation: 10,
    swing: 0.18,
    tags: ["bossa", "euclidean", "necklace"],
  },
  {
    aliases: ["tresillo", "habanera"],
    bpm: 96,
    hits: 3,
    name: "tresillo",
    pulses: 8,
    rotation: 0,
    swing: 0.1,
    tags: ["tresillo", "euclidean"],
  },
  {
    aliases: ["cinquillo"],
    bpm: 106,
    hits: 5,
    name: "cinquillo",
    pulses: 8,
    rotation: 0,
    swing: 0.12,
    tags: ["cinquillo", "euclidean"],
  },
  {
    aliases: ["samba"],
    bpm: 118,
    hits: 7,
    name: "samba necklace",
    onsets: [0, 2, 5, 7, 9, 12, 14],
    pulses: 16,
    rotation: 0,
    swing: 0.14,
    tags: ["samba", "necklace"],
  },
  {
    aliases: ["bembe", "bembé", "bem-be"],
    bpm: 112,
    hits: 7,
    name: "bembe bell",
    pulses: 12,
    rotation: 0,
    swing: 0.08,
    tags: ["bembe", "euclidean", "bell"],
  },
  {
    aliases: ["son clave", "clave son", "clave"],
    bpm: 104,
    hits: 5,
    name: "clave son",
    onsets: [0, 3, 6, 10, 12],
    pulses: 16,
    rotation: 0,
    swing: 0.08,
    tags: ["clave", "necklace", "oddity"],
  },
  {
    aliases: ["rumba clave", "rumba"],
    bpm: 104,
    hits: 5,
    name: "rumba clave",
    onsets: [0, 3, 7, 10, 12],
    pulses: 16,
    rotation: 0,
    swing: 0.08,
    tags: ["rumba", "clave", "necklace"],
  },
];

export function normalizePulse(index: number, pulses: number): number {
  if (!Number.isInteger(pulses) || pulses <= 0) {
    throw new Error("pulses must be a positive integer");
  }

  return ((index % pulses) + pulses) % pulses;
}

export function rotateBinarySequence(
  sequence: boolean[],
  rotation: number,
): boolean[] {
  if (sequence.length === 0) {
    return [];
  }

  const next = Array.from({ length: sequence.length }, () => false);
  sequence.forEach((active, index) => {
    next[normalizePulse(index + rotation, sequence.length)] = active;
  });
  return next;
}

export function sequenceToOnsets(sequence: readonly boolean[]): number[] {
  return sequence.flatMap((active, index) => (active ? [index] : []));
}

export function onsetsToSequence(onsets: readonly number[], pulses: number): boolean[] {
  const sequence = Array.from({ length: pulses }, () => false);
  for (const onset of onsets) {
    sequence[normalizePulse(onset, pulses)] = true;
  }
  return sequence;
}

export function createEuclideanSequence({
  hits,
  pulses,
  rotation = 0,
}: {
  hits: number;
  pulses: number;
  rotation?: number;
}): boolean[] {
  assertRhythmShape(hits, pulses);

  if (hits === 0) {
    return Array.from({ length: pulses }, () => false);
  }

  if (hits === pulses) {
    return Array.from({ length: pulses }, () => true);
  }

  const base = rotateToFirstOnset(createBjorklundSequence(pulses, hits));
  return rotateBinarySequence(base, rotation);
}

export function createTrackSequence(plan: GeometryTrackPlan): boolean[] {
  if (plan.algorithm === "direct" || plan.algorithm === "known-necklace") {
    return onsetsToSequence(plan.onsets ?? [], plan.pulses);
  }

  if (plan.algorithm === "complement") {
    return complementSequence(
      onsetsToSequence(plan.onsets ?? [], plan.pulses),
    );
  }

  return createEuclideanSequence({
    hits: plan.hits,
    pulses: plan.pulses,
    rotation: plan.rotation,
  });
}

export function getInterOnsetIntervals(
  onsets: readonly number[],
  pulses: number,
): number[] {
  if (onsets.length === 0) {
    return [];
  }

  const sorted = uniqueSortedOnsets(onsets, pulses);
  return sorted.map((onset, index) => {
    const next = sorted[(index + 1) % sorted.length] ?? onset;
    return normalizePulse(next - onset, pulses) || pulses;
  });
}

export function getFullIntervalVector(
  onsets: readonly number[],
  pulses: number,
): number[] {
  const sorted = uniqueSortedOnsets(onsets, pulses);
  const maxDistance = Math.floor(pulses / 2);
  const vector = Array.from({ length: maxDistance }, () => 0);

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const clockwise = normalizePulse(sorted[right] - sorted[left], pulses);
      const distance = Math.min(clockwise, pulses - clockwise);
      if (distance > 0 && distance <= maxDistance) {
        vector[distance - 1] += 1;
      }
    }
  }

  return vector;
}

export function getChordEvenness(onsets: readonly number[], pulses: number): number {
  const sorted = uniqueSortedOnsets(onsets, pulses);
  let total = 0;

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const clockwise = normalizePulse(sorted[right] - sorted[left], pulses);
      const distance = Math.min(clockwise, pulses - clockwise);
      total += 2 * Math.sin((Math.PI * distance) / pulses);
    }
  }

  return roundMetric(total);
}

export function getOffBeatness(onsets: readonly number[], pulses: number): number {
  return uniqueSortedOnsets(onsets, pulses).filter(
    (onset) => onset !== 0 && gcd(onset, pulses) === 1,
  ).length;
}

export function hasRhythmicOddity(
  onsets: readonly number[],
  pulses: number,
): boolean {
  if (pulses % 2 !== 0) {
    return true;
  }

  const onsetSet = new Set(uniqueSortedOnsets(onsets, pulses));
  const halfCycle = pulses / 2;
  for (const onset of onsetSet) {
    if (onsetSet.has(normalizePulse(onset + halfCycle, pulses))) {
      return false;
    }
  }
  return true;
}

export function complementSequence(sequence: readonly boolean[]): boolean[] {
  return sequence.map((active) => !active);
}

export function summarizeTrackGeometry(track: Pick<Track, "steps">): GeometryTrackSummary {
  const pulses = track.steps.length;
  const sequence = track.steps.map((step) => step.active);
  const onsets = sequenceToOnsets(sequence);
  const hits = onsets.length;
  const rotation = estimateEuclideanRotation(sequence);
  const formula = rotation === null
    ? `[${onsets.join(",")}]`
    : `E(${hits},${pulses}) r${rotation}`;

  return {
    density: roundMetric(hits / pulses),
    evenness: getChordEvenness(onsets, pulses),
    formula,
    fullIntervalVector: getFullIntervalVector(onsets, pulses),
    hasRhythmicOddity: hasRhythmicOddity(onsets, pulses),
    interOnsetIntervals: getInterOnsetIntervals(onsets, pulses),
    offBeatness: getOffBeatness(onsets, pulses),
    onsets,
    pulses,
    rotation,
  };
}

export function estimateEuclideanRotation(sequence: readonly boolean[]): number | null {
  const hits = sequence.filter(Boolean).length;
  const pulses = sequence.length;
  if (hits === 0 || pulses === 0) {
    return null;
  }

  for (let rotation = 0; rotation < pulses; rotation += 1) {
    const candidate = createEuclideanSequence({ hits, pulses, rotation });
    if (candidate.every((active, index) => active === sequence[index])) {
      return rotation;
    }
  }

  return null;
}

export function resolveGeometryPrompt(prompt: string): GeometryPromptPlan {
  const normalized = prompt.toLowerCase();
  const formula = parseEuclideanFormula(prompt);
  const rotation = parseRotation(prompt);
  const preset = formula ? null : rhythmPresets.find((candidate) =>
    candidate.aliases.some((alias) => normalized.includes(alias)),
  );

  if (formula) {
    return buildFormulaPlan({
      hits: formula.hits,
      prompt,
      pulses: formula.pulses,
      rotation: rotation ?? 0,
    });
  }

  return buildPresetPlan({
    preset: preset ?? rhythmPresets[0],
    prompt,
    rotation,
  });
}

export function createPatternFromGeometryPlan({
  plan,
  sampleId,
  sampleName,
  sampleRole = "unknown",
  trackSamples,
}: {
  plan: GeometryPromptPlan;
  sampleId: string;
  sampleName: string;
  sampleRole?: Track["role"];
  trackSamples?: DrumTrackSampleContext[];
}): Pattern {
  const fallbackSample = {
    sampleId,
    sampleName,
    sampleRole,
  };
  const tracks = plan.tracks.map((trackPlan) => {
    const source = resolveGeometryTrackSample({
      fallbackSample,
      trackPlan,
      trackSamples,
    });
    return createGeometryTrack(trackPlan, source.sampleId, source.sampleRole);
  });
  const sourceSamples = dedupeSourceSamples(
    tracks.map((track) => {
      const source = resolveGeometryTrackSample({
        fallbackSample,
        trackPlan: { id: track.id } satisfies Pick<GeometryTrackPlan, "id">,
        trackSamples,
      });
      return {
        sampleId: track.sampleId,
        sampleName: source.sampleName ?? track.sampleId,
      };
    }),
  );

  return createPattern({
    id: `geometry-${slugify(plan.name)}`,
    name: plan.name,
    bpm: plan.bpm,
    swing: plan.swing,
    bars: 4,
    stepsPerBar: 16,
    tracks,
    metadata: {
      createdBy: "ai",
      rationale: formatGeometryPlan(plan),
      sourceSampleId: sourceSamples[0]?.sampleId ?? sampleId,
      sourceSampleName: sourceSamples[0]?.sampleName ?? sampleName,
      sourceSampleIds: sourceSamples.map((sample) => sample.sampleId),
      sourceSampleNames: sourceSamples.map((sample) => sample.sampleName),
      tags: ["drums", "geometry", ...plan.tags],
      toolSlug: "drum-machine",
    },
  });
}

export function createGeometryTrack(
  plan: GeometryTrackPlan,
  sampleId: string,
  sampleRole: Track["role"] = "unknown",
): Track {
  const sequence = createTrackSequence(plan);
  return createTrack({
    id: plan.id,
    name: plan.name,
    sampleId,
    role: sampleRole,
    slot: plan.slot,
    chokeGroup: plan.id === "hat" ? "hats" : plan.id,
    steps: sequence.map((active, index) =>
      createStep({
        active,
        decay: plan.decay,
        microShift: plan.name.includes("hat") && index % 2 === 1 ? 0.08 : 0,
        pitchSemitones: plan.pitchSemitones ?? 0,
        probability: plan.probability ?? 1,
        slot: plan.slot,
        velocity: active ? plan.velocity : 1,
      }),
    ),
  });
}

export function createGeometryTrackSteps({
  hits,
  pulses,
  rotation,
  slot,
  template,
}: {
  hits: number;
  pulses: number;
  rotation: number;
  slot: number;
  template?: Track["steps"][number];
}): Track["steps"] {
  return createEuclideanSequence({ hits, pulses, rotation }).map((active) =>
    createStep({
      ...(template ?? {}),
      active,
      slot,
    }),
  );
}

export function formatGeometryPlan(plan: GeometryPromptPlan): string {
  return [
    plan.rationale,
    ...plan.steps,
    ...plan.tracks.map((track) => `${track.name}: ${formatTrackPlan(track)}`),
  ].join(" | ");
}

export function formatTrackPlan(track: GeometryTrackPlan): string {
  if (track.algorithm === "euclidean") {
    return `E(${track.hits},${track.pulses}) rotation ${track.rotation}`;
  }

  return `${track.algorithm} onsets [${(track.onsets ?? []).join(",")}] / ${track.pulses}`;
}

function buildFormulaPlan({
  hits,
  prompt,
  pulses,
  rotation,
}: {
  hits: number;
  prompt: string;
  pulses: number;
  rotation: number;
}): GeometryPromptPlan {
  assertRhythmShape(hits, pulses);
  const swing = prompt.toLowerCase().includes("swing") ? 0.16 : 0.08;
  const timeline = makeTrackPlan({
    algorithm: "euclidean",
    hits,
    id: "timeline",
    name: `E(${hits},${pulses}) timeline`,
    pulses,
    rotation,
    slot: 3,
    velocity: 0.9,
  });

  return {
    bpm: 124,
    name: `geometry E(${hits},${pulses})`,
    rationale: `Resolved prompt to explicit Euclidean rhythm E(${hits},${pulses}).`,
    source: "formula",
    steps: [
      `Parse formula E(${hits},${pulses}).`,
      `Rotate by ${rotation} pulse${rotation === 1 ? "" : "s"}.`,
      "Layer kick, snare, and hat rings around the timeline.",
    ],
    swing,
    tags: ["euclidean", "formula"],
    tracks: createSupportTracks(timeline, { prompt, swing }),
  };
}

function resolveGeometryTrackSample({
  fallbackSample,
  trackPlan,
  trackSamples = [],
}: {
  fallbackSample: {
    sampleId: string;
    sampleName: string;
    sampleRole: Track["role"];
  };
  trackPlan: Pick<GeometryTrackPlan, "id">;
  trackSamples?: DrumTrackSampleContext[];
}): {
  sampleId: string;
  sampleName?: string;
  sampleRole: Track["role"];
} {
  const exact = trackSamples.find((sample) => sample.trackId === trackPlan.id);
  if (exact) {
    return {
      sampleId: exact.sampleId,
      sampleName: exact.sampleName,
      sampleRole: exact.sampleRole ?? "unknown",
    };
  }

  if (trackPlan.id === "timeline" || trackPlan.id === "motion") {
    const percussion = trackSamples.find((sample) =>
      ["perc", "percussion", "timeline", "motion"].includes(sample.trackId),
    );
    if (percussion) {
      return {
        sampleId: percussion.sampleId,
        sampleName: percussion.sampleName,
        sampleRole: percussion.sampleRole ?? "unknown",
      };
    }
  }

  return fallbackSample;
}

function dedupeSourceSamples(
  samples: Array<{ sampleId: string; sampleName: string }>,
) {
  const seen = new Set<string>();
  return samples.filter((sample) => {
    if (seen.has(sample.sampleId)) {
      return false;
    }
    seen.add(sample.sampleId);
    return true;
  });
}

function buildPresetPlan({
  preset,
  prompt,
  rotation,
}: {
  preset: RhythmPreset;
  prompt: string;
  rotation: number | null;
}): GeometryPromptPlan {
  const trackRotation = rotation ?? preset.rotation;
  const timeline = makeTrackPlan({
    algorithm: preset.onsets ? "known-necklace" : "euclidean",
    hits: preset.hits,
    id: "timeline",
    name: preset.name,
    onsets: preset.onsets
      ? rotateOnsets(preset.onsets, trackRotation, preset.pulses)
      : undefined,
    pulses: preset.pulses,
    rotation: trackRotation,
    slot: 3,
    velocity: 0.9,
  });
  const swing = prompt.toLowerCase().includes("straight") ? 0 : preset.swing;

  return {
    bpm: preset.bpm,
    name: `${preset.name} geometry`,
    rationale: `Resolved prompt to ${preset.name} as cyclic geometry.`,
    source: "preset",
    steps: [
      `Choose ${preset.name}.`,
      preset.onsets
        ? `Use known necklace onsets [${timeline.onsets?.join(",") ?? ""}] over ${preset.pulses} pulses.`
        : `Generate E(${preset.hits},${preset.pulses}).`,
      `Rotate by ${trackRotation} pulse${trackRotation === 1 ? "" : "s"}.`,
      "Layer support rings with the same circular clock so the pattern remains inspectable.",
    ],
    swing,
    tags: preset.tags,
    tracks: createSupportTracks(timeline, { prompt, swing }),
  };
}

function createSupportTracks(
  timeline: GeometryTrackPlan,
  {
    prompt,
    swing,
  }: {
    prompt: string;
    swing: number;
  },
): GeometryTrackPlan[] {
  const pulses = timeline.pulses;
  const normalized = prompt.toLowerCase();
  const dense = normalized.includes("dense") || normalized.includes("complex");
  const sparse = normalized.includes("sparse") || normalized.includes("minimal");
  const kickHits = pulses >= 16 ? 2 : 1;
  const snareHits = pulses >= 12 ? 2 : 1;
  const hatHits = Math.max(2, Math.min(pulses, Math.round(pulses / (sparse ? 3 : 2))));
  const motionHits = Math.max(2, Math.min(pulses - 1, timeline.hits + (dense ? 2 : 1)));

  return [
    timeline,
    makeTrackPlan({
      algorithm: "euclidean",
      decay: 0.9,
      hits: kickHits,
      id: "kick",
      name: "kick ground",
      pulses,
      rotation: 0,
      slot: 0,
      velocity: 1,
    }),
    makeTrackPlan({
      algorithm: "euclidean",
      decay: 0.55,
      hits: snareHits,
      id: "snare",
      name: "snare axis",
      pulses,
      rotation: Math.floor(pulses / 4),
      slot: 1,
      velocity: 0.82,
    }),
    makeTrackPlan({
      algorithm: "euclidean",
      decay: 0.28,
      hits: hatHits,
      id: "hat",
      name: swing > 0 ? "hat swing lattice" : "hat lattice",
      pulses,
      rotation: swing > 0 ? 1 : 0,
      slot: 2,
      velocity: 0.52,
    }),
    makeTrackPlan({
      algorithm: "euclidean",
      decay: 0.45,
      hits: motionHits,
      id: "motion",
      name: "motion ring",
      pulses: dense && pulses === 16 ? 12 : pulses,
      rotation: Math.max(1, Math.floor(pulses / 3)),
      slot: 4,
      velocity: 0.62,
    }),
  ];
}

function makeTrackPlan(input: GeometryTrackPlan): GeometryTrackPlan {
  assertRhythmShape(input.hits, input.pulses);
  return input;
}

function createBjorklundSequence(steps: number, pulses: number): boolean[] {
  const pattern: number[] = [];
  const counts: number[] = [];
  const remainders = [pulses];
  let divisor = steps - pulses;
  let level = 0;

  while (true) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level += 1;
    if (remainders[level] <= 1) {
      break;
    }
  }

  counts.push(divisor);

  function build(currentLevel: number): void {
    if (currentLevel === -1) {
      pattern.push(0);
      return;
    }

    if (currentLevel === -2) {
      pattern.push(1);
      return;
    }

    for (let count = 0; count < counts[currentLevel]; count += 1) {
      build(currentLevel - 1);
    }
    if (remainders[currentLevel] !== 0) {
      build(currentLevel - 2);
    }
  }

  build(level);
  return pattern.map((value) => value === 1);
}

function rotateToFirstOnset(sequence: boolean[]): boolean[] {
  const firstOnset = sequence.findIndex(Boolean);
  return firstOnset <= 0 ? sequence : rotateBinarySequence(sequence, -firstOnset);
}

function rotateOnsets(
  onsets: readonly number[],
  rotation: number,
  pulses: number,
): number[] {
  return uniqueSortedOnsets(
    onsets.map((onset) => onset + rotation),
    pulses,
  );
}

function uniqueSortedOnsets(onsets: readonly number[], pulses: number): number[] {
  return [...new Set(onsets.map((onset) => normalizePulse(onset, pulses)))]
    .sort((left, right) => left - right);
}

function parseEuclideanFormula(prompt: string): { hits: number; pulses: number } | null {
  const match = prompt.match(/\bE\s*\(?\s*(\d{1,3})\s*[,/]\s*(\d{1,3})\s*\)?/i);
  if (!match) {
    return null;
  }

  return {
    hits: Number(match[1]),
    pulses: Number(match[2]),
  };
}

function parseRotation(prompt: string): number | null {
  const match = prompt.match(/\b(?:r|rot|rotate|rotation)\s*(-?\d{1,3})\b/i);
  return match ? Number(match[1]) : null;
}

function assertRhythmShape(hits: number, pulses: number): void {
  if (!Number.isInteger(hits) || !Number.isInteger(pulses)) {
    throw new Error("hits and pulses must be integers");
  }
  if (pulses < 1 || pulses > 64) {
    throw new Error("pulses must be between 1 and 64");
  }
  if (hits < 0 || hits > pulses) {
    throw new Error("hits must be between 0 and pulses");
  }
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
