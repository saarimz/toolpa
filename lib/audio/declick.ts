export type DeclickPreset = "tight" | "balanced" | "soft";

export type DeclickOptions = {
  attackSec?: number;
  durationSec: number;
  preset?: DeclickPreset;
  releaseSec?: number;
};

export type DeclickEnvelope = {
  attackSec: number;
  holdSec: number;
  releaseSec: number;
};

const PRESETS: Record<DeclickPreset, { attackSec: number; releaseSec: number }> = {
  tight: { attackSec: 0.002, releaseSec: 0.006 },
  balanced: { attackSec: 0.003, releaseSec: 0.01 },
  soft: { attackSec: 0.008, releaseSec: 0.02 },
};

export function getDeclickEnvelope({
  attackSec,
  durationSec,
  preset = "balanced",
  releaseSec,
}: DeclickOptions): DeclickEnvelope {
  const base = PRESETS[preset];
  const safeDuration = Math.max(0, durationSec);
  const maxFade = safeDuration * 0.25;
  const attack = clampFade(attackSec ?? base.attackSec, maxFade);
  const release = clampFade(releaseSec ?? base.releaseSec, maxFade);

  return {
    attackSec: roundSec(attack),
    holdSec: roundSec(Math.max(0, safeDuration - attack - release)),
    releaseSec: roundSec(release),
  };
}

export function getAudibleDurationSec(durationSec: number, playbackRate: number) {
  return durationSec / Math.max(0.03125, Math.abs(playbackRate));
}

function clampFade(value: number, maxFade: number) {
  if (!Number.isFinite(value) || value <= 0 || maxFade <= 0) {
    return 0;
  }

  return Math.min(value, maxFade);
}

function roundSec(value: number) {
  return Math.round(value * 100000) / 100000;
}
