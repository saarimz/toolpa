import type { SampleRole } from "@/lib/samples/roles";
import type { SampleAnalysis } from "@/lib/samples/analysis/schema";

export type RoleEvidence = {
  duration_s: number;
  onset_rate_hz: number;
  bpm_confidence: number;
  key_strength: number;
  flatness_mean: number;
  attack_ms: number | null;
};

export function inferRole(
  evidence: RoleEvidence,
): { role: SampleRole | null; confidence: number } {
  const scores: Record<SampleRole, number> = {
    oneshot: scoreOneshot(evidence),
    fx: scoreFx(evidence),
    break: scoreBreak(evidence),
    loop: scoreLoop(evidence),
    melodic: scoreMelodic(evidence),
    pad: scorePad(evidence),
  };

  const ranked = (Object.entries(scores) as Array<[SampleRole, number]>).sort(
    (left, right) => right[1] - left[1],
  );
  const [bestRole, bestScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;

  if (bestScore < 0.25) {
    return { role: null, confidence: 0 };
  }

  const confidence = Math.min(1, Math.max(0, bestScore - secondScore));
  return { role: bestRole, confidence };
}

export function evidenceFromAnalysis(
  analysis: Pick<SampleAnalysis, "source" | "rhythm" | "tonal" | "spectral" | "envelope">,
): RoleEvidence {
  return {
    duration_s: analysis.source.duration_s,
    onset_rate_hz: analysis.rhythm.onset_rate_hz,
    bpm_confidence: analysis.rhythm.bpm_confidence,
    key_strength: analysis.tonal.key_strength,
    flatness_mean: analysis.spectral.flatness.mean,
    attack_ms: analysis.envelope?.attack_ms ?? null,
  };
}

function scoreOneshot(evidence: RoleEvidence): number {
  if (evidence.duration_s >= 1.5 || evidence.onset_rate_hz >= 4) {
    return 0;
  }
  const durationFit = clamp01(1 - evidence.duration_s / 1.5);
  const sparsity = clamp01(1 - evidence.onset_rate_hz / 4);
  const tonalPenalty = evidence.flatness_mean > 0.5 ? 0.5 : 1;
  return clamp01(durationFit * 0.5 + sparsity * 0.5) * tonalPenalty;
}

function scoreFx(evidence: RoleEvidence): number {
  if (evidence.flatness_mean < 0.4) {
    return 0;
  }
  const flatnessFit = clamp01((evidence.flatness_mean - 0.4) / 0.6);
  const tonalPenalty = evidence.key_strength > 0.6 ? 0.3 : 1;
  return clamp01(flatnessFit) * tonalPenalty;
}

function scoreBreak(evidence: RoleEvidence): number {
  if (evidence.bpm_confidence < 0.45 || evidence.onset_rate_hz < 4) {
    return 0;
  }
  const tempoFit = clamp01(evidence.bpm_confidence);
  const onsetFit = clamp01((evidence.onset_rate_hz - 4) / 8);
  const percussivenessBonus = evidence.flatness_mean > 0.4 ? 1.2 : 0.8;
  return clamp01((tempoFit * 0.55 + onsetFit * 0.45) * percussivenessBonus);
}

function scoreLoop(evidence: RoleEvidence): number {
  if (evidence.bpm_confidence < 0.4 || evidence.duration_s < 1) {
    return 0;
  }
  const tempoFit = clamp01(evidence.bpm_confidence * 0.9);
  const lengthFit = clamp01(Math.min(evidence.duration_s, 8) / 8);
  return clamp01(tempoFit * 0.7 + lengthFit * 0.3);
}

function scoreMelodic(evidence: RoleEvidence): number {
  if (evidence.key_strength < 0.4) {
    return 0;
  }
  const keyFit = clamp01(evidence.key_strength);
  const sparsity = clamp01(1 - Math.min(evidence.onset_rate_hz, 8) / 8);
  return clamp01(keyFit * 0.7 + sparsity * 0.3);
}

function scorePad(evidence: RoleEvidence): number {
  if (evidence.duration_s < 2 || evidence.onset_rate_hz > 1.5) {
    return 0;
  }
  const slowAttack = clamp01(((evidence.attack_ms ?? 0) - 50) / 250);
  const lengthFit = clamp01(Math.min(evidence.duration_s, 12) / 12);
  const lowDensity = clamp01(1 - evidence.onset_rate_hz / 1.5);
  return clamp01(slowAttack * 0.4 + lengthFit * 0.3 + lowDensity * 0.3);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
