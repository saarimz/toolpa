import { hashSeed } from "@/app/tools/time-stretch/lib/random";
import {
  sanitizeTimeStretchPatch,
  type TimeStretchMode,
  type TimeStretchPatch,
  type TimeStretchPerformanceMode,
  type TimeStretchTransientMode,
} from "@/app/tools/time-stretch/lib/schema";

export type TimeStretchPromptResult = {
  patch: TimeStretchPatch;
  decisions: string[];
};

const BAR_MATCH = /\b(\d+(?:\.\d+)?)\s*(?:bar|bars)\b/;
const BPM_MATCH = /\b(\d{2,3})\s*(?:bpm|beats per minute)\b/;
const WINDOW_MATCH = /\b(\d+(?:\.\d+)?)\s*(?:ms|millisecond|milliseconds)\s*(?:window|grain|grain size)?\b/;

export function buildTimeStretchSystemPrompt() {
  return [
    "You are the time-stretch L1 agent inside ai-daw-tools.",
    "Return one valid TimeStretchPatch JSON object only.",
    "Choose a stretch mode that matches the musical request: transparent for natural length changes, rhythmic for drums, tonal for pitched material, ambient-cloud for extreme pad smearing, spectral-freeze for held moments, subharmonic-bloom for octave/sub weight, and granular-smear for intentionally grainy texture.",
    "targetBars must be musically explicit. Use bpm and targetBars to define exact output duration.",
    "Use octaveDownMix and subharmonicMix only when the prompt asks for deep, sub, bass, bloom, cinematic, or octave-down weight.",
    "Use performanceMode and movement controls when the prompt asks for disintegration, evolving ambient performance, tape decay, erosion, orbiting motion, low-end tide, or memory-like degradation.",
    "Use metadata or surrounding UI for explanations; the patch itself must remain deterministic and renderable.",
  ].join("\n");
}

export function buildTimeStretchPrompt({
  currentPatch,
  prompt,
  sourceDurationSec,
}: {
  currentPatch: TimeStretchPatch;
  prompt: string;
  sourceDurationSec: number;
}) {
  return [
    `user prompt: ${prompt || "stretch the source musically"}`,
    `source: ${currentPatch.sourceName} (${currentPatch.sourceId})`,
    `source duration: ${sourceDurationSec.toFixed(3)} sec`,
    `current patch: ${JSON.stringify(currentPatch)}`,
    "Requirements:",
    "- preserve sourceId and sourceName",
    "- targetBars is the requested musical length",
    "- use mode, windowMs, transientMode, phaseMode, spectralBlur, texture, pitchSemitones, octaveDownMix, subharmonicMix, stereoWidth, freezePosition, performanceMode, movementDepth, degradation, wowFlutter, dropoutAmount, noiseAmount, filterDrift, subMotion, and seed",
    "- keep values inside the schema bounds",
  ].join("\n");
}

export function applyTimeStretchPromptToPatch(
  currentPatch: TimeStretchPatch,
  prompt: string,
): TimeStretchPromptResult {
  const lower = prompt.toLowerCase();
  const decisions: string[] = [];
  const next: Partial<TimeStretchPatch> & Pick<TimeStretchPatch, "sourceId" | "sourceName"> = {
    ...currentPatch,
    sourceId: currentPatch.sourceId,
    sourceName: currentPatch.sourceName,
    seed: hashSeed(`${currentPatch.sourceId}:${prompt}`, currentPatch.seed),
  };

  const targetBars = getPromptBars(lower);
  if (targetBars !== null) {
    next.targetBars = targetBars;
    decisions.push(`${formatNumber(targetBars)} bars`);
  }

  const bpm = getPromptBpm(lower);
  if (bpm !== null) {
    next.bpm = bpm;
    decisions.push(`${bpm} bpm`);
  }

  const mode = getPromptMode(lower);
  if (mode) {
    next.mode = mode;
    decisions.push(mode);
  }

  const performanceMode = getPromptPerformanceMode(lower);
  if (performanceMode) {
    next.performanceMode = performanceMode;
    decisions.push(performanceMode);
  }

  const transientMode = getPromptTransientMode(lower);
  if (transientMode) {
    next.transientMode = transientMode;
    decisions.push(`${transientMode} transients`);
  }

  const windowMs = getPromptWindowMs(lower, next.mode ?? currentPatch.mode);
  if (windowMs !== null) {
    next.windowMs = windowMs;
    decisions.push(`${Math.round(windowMs)} ms window`);
  }

  if (/\b(deep|sub|bass|octave|bloom|cinematic|doom|heavy)\b/.test(lower)) {
    next.mode = next.mode === "ambient-cloud" ? "subharmonic-bloom" : next.mode;
    next.octaveDownMix = /\b(two octave|-24|24 down)\b/.test(lower) ? 0.46 : 0.3;
    next.subharmonicMix = /\b(sub|subharmonic|bass|doom)\b/.test(lower) ? 0.3 : 0.18;
    next.subMotion = Math.max(next.subMotion ?? currentPatch.subMotion, 0.45);
    if (/\b(tide|breath|breathe|swell|moving|evolving)\b/.test(lower)) {
      next.performanceMode = "low-end-tide";
      next.movementDepth = Math.max(next.movementDepth ?? currentPatch.movementDepth, 0.55);
    }
    decisions.push("subharmonic bloom");
  }

  if (/\b(no sub|no bass|remove sub|without sub)\b/.test(lower)) {
    next.octaveDownMix = 0;
    next.subharmonicMix = 0;
    decisions.push("sub layers off");
  }

  if (/\b(wide|stereo|spread|huge)\b/.test(lower)) {
    next.stereoWidth = 1.35;
    decisions.push("wide stereo");
  }
  if (/\b(mono|center|narrow)\b/.test(lower)) {
    next.stereoWidth = 0.35;
    decisions.push("narrow stereo");
  }

  if (/\b(up an octave|\+12|12 up|octave up)\b/.test(lower)) {
    next.pitchSemitones = 12;
    decisions.push("+12 semitones");
  } else if (/\b(down an octave|-12|12 down|octave down)\b/.test(lower)) {
    next.pitchSemitones = -12;
    next.octaveDownMix = Math.max(next.octaveDownMix ?? currentPatch.octaveDownMix, 0.22);
    decisions.push("-12 semitones");
  }

  if (/\b(half speed|slower pitch)\b/.test(lower)) {
    next.pitchSemitones = -12;
    decisions.push("half-speed pitch");
  }

  if (/\b(freeze|hold|infinite|sustain)\b/.test(lower)) {
    next.mode = "spectral-freeze";
    next.freezePosition = /\b(beginning|start|attack)\b/.test(lower)
      ? 0.15
      : /\b(end|tail)\b/.test(lower)
        ? 0.82
        : 0.48;
    decisions.push("spectral freeze");
  }

  if (/\b(disintegration|decay|erode|degrade|memory|tape loop|tape loops|william basinski|basinski)\b/.test(lower)) {
    next.performanceMode = "disintegration-loop";
    next.degradation = Math.max(next.degradation ?? currentPatch.degradation, 0.62);
    next.wowFlutter = Math.max(next.wowFlutter ?? currentPatch.wowFlutter, 0.46);
    next.dropoutAmount = Math.max(next.dropoutAmount ?? currentPatch.dropoutAmount, 0.24);
    next.noiseAmount = Math.max(next.noiseAmount ?? currentPatch.noiseAmount, 0.12);
    next.filterDrift = Math.max(next.filterDrift ?? currentPatch.filterDrift, 0.68);
    next.movementDepth = Math.max(next.movementDepth ?? currentPatch.movementDepth, 0.72);
    decisions.push("baked tape disintegration");
  }

  if (/\b(evolving|movement|performance|variation|variations|moving|alive|long form|long-form)\b/.test(lower)) {
    next.performanceMode =
      next.performanceMode === "none" || !next.performanceMode
        ? "cloud-orbit"
        : next.performanceMode;
    next.movementDepth = Math.max(next.movementDepth ?? currentPatch.movementDepth, 0.55);
    next.filterDrift = Math.max(next.filterDrift ?? currentPatch.filterDrift, 0.4);
    decisions.push("baked movement");
  }

  if (/\b(no movement|static|no degradation|clean render)\b/.test(lower)) {
    next.performanceMode = "none";
    next.movementDepth = 0;
    next.degradation = 0;
    next.wowFlutter = 0;
    next.dropoutAmount = 0;
    next.noiseAmount = 0;
    next.filterDrift = 0;
    next.subMotion = 0;
    decisions.push("performance layer off");
  }

  if (/\b(smooth|soft|wash|cloud|ambient|pad|drone|shimmer|ethereal)\b/.test(lower)) {
    next.spectralBlur = Math.max(next.spectralBlur ?? currentPatch.spectralBlur, 0.72);
    next.texture = Math.max(next.texture ?? currentPatch.texture, 0.58);
    next.phaseMode = "randomized";
    decisions.push("soft spectral texture");
  }

  if (/\b(clean|transparent|natural|preserve|realistic)\b/.test(lower)) {
    next.spectralBlur = 0.16;
    next.texture = 0.14;
    next.phaseMode = "locked";
    next.octaveDownMix = 0;
    next.subharmonicMix = 0;
    if (!/\b(disintegration|movement|performance|evolving|degrade|decay)\b/.test(lower)) {
      next.performanceMode = "none";
    }
    decisions.push("clean phase-locked stretch");
  }

  return {
    patch: sanitizeTimeStretchPatch(next),
    decisions: decisions.length > 0 ? decisions : ["kept current patch shape"],
  };
}

function getPromptBars(prompt: string) {
  const match = prompt.match(BAR_MATCH);
  if (!match?.[1]) {
    return null;
  }
  return clamp(Number.parseFloat(match[1]), 0.25, 256);
}

function getPromptBpm(prompt: string) {
  const match = prompt.match(BPM_MATCH);
  if (!match?.[1]) {
    return null;
  }
  return clamp(Number.parseInt(match[1], 10), 40, 260);
}

function getPromptWindowMs(prompt: string, mode: TimeStretchMode) {
  const match = prompt.match(WINDOW_MATCH);
  if (match?.[1]) {
    return clamp(Number.parseFloat(match[1]), 20, 2000);
  }

  if (/\b(huge|massive|blur|smear|cloud|ambient|drone)\b/.test(prompt)) {
    return mode === "spectral-freeze" ? 880 : 620;
  }
  if (/\b(tight|punchy|drum|rhythm|transient)\b/.test(prompt)) {
    return 95;
  }
  return null;
}

function getPromptMode(prompt: string): TimeStretchMode | null {
  if (/\b(freeze|frozen|hold|infinite sustain)\b/.test(prompt)) {
    return "spectral-freeze";
  }
  if (/\b(subharmonic|sub|bass|octave down|deep bloom)\b/.test(prompt)) {
    return "subharmonic-bloom";
  }
  if (/\b(ambient|cloud|pad|drone|wash|shimmer|ethereal|paulstretch)\b/.test(prompt)) {
    return "ambient-cloud";
  }
  if (/\b(grain|granular|shatter|dust|smear)\b/.test(prompt)) {
    return "granular-smear";
  }
  if (/\b(drum|break|percussion|rhythm|groove|transient|punch)\b/.test(prompt)) {
    return "rhythmic";
  }
  if (/\b(vocal|voice|tonal|melody|chord|pad|key|pitched)\b/.test(prompt)) {
    return "tonal";
  }
  if (/\b(clean|transparent|natural)\b/.test(prompt)) {
    return "transparent";
  }
  return null;
}

function getPromptPerformanceMode(prompt: string): TimeStretchPerformanceMode | null {
  if (/\b(disintegration|basinski|tape loop|tape loops)\b/.test(prompt)) {
    return "disintegration-loop";
  }
  if (/\b(broken tape|warped tape|wow|flutter)\b/.test(prompt)) {
    return "broken-tape";
  }
  if (/\b(low end tide|sub tide|bass tide|breathing sub|sub breath)\b/.test(prompt)) {
    return "low-end-tide";
  }
  if (/\b(spectral erosion|erode|erosion)\b/.test(prompt)) {
    return "spectral-erosion";
  }
  if (/\b(memory decay|fading memory|decay over time)\b/.test(prompt)) {
    return "memory-decay";
  }
  if (/\b(orbit|cloud orbit|stereo orbit|moving cloud)\b/.test(prompt)) {
    return "cloud-orbit";
  }
  if (/\b(static|no movement|no degradation)\b/.test(prompt)) {
    return "none";
  }
  return null;
}

function getPromptTransientMode(prompt: string): TimeStretchTransientMode | null {
  if (/\b(preserve transients|punchy|sharp|drum|break|attack)\b/.test(prompt)) {
    return "preserve";
  }
  if (/\b(ghost|afterimage|echo transients|smear attacks)\b/.test(prompt)) {
    return "ghost";
  }
  if (/\b(soft|smooth|blur|wash|ambient)\b/.test(prompt)) {
    return "soften";
  }
  if (/\b(ignore transients|no transients)\b/.test(prompt)) {
    return "ignore";
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
