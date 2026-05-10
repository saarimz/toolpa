import { describe, expect, it } from "vitest";

import { inferRole, type RoleEvidence } from "@/lib/samples/analysis/pipeline/role";

function evidence(overrides: Partial<RoleEvidence> = {}): RoleEvidence {
  return {
    duration_s: 5,
    onset_rate_hz: 2,
    bpm_confidence: 0,
    key_strength: 0,
    flatness_mean: 0.2,
    attack_ms: null,
    ...overrides,
  };
}

describe("inferRole", () => {
  it("classifies short transient signals as oneshot", () => {
    const result = inferRole(
      evidence({
        duration_s: 0.4,
        onset_rate_hz: 0.5,
        flatness_mean: 0.1,
      }),
    );
    expect(result.role).toBe("oneshot");
  });

  it("classifies dense rhythmic signals with confident BPM as break", () => {
    const result = inferRole(
      evidence({
        duration_s: 4,
        onset_rate_hz: 9,
        bpm_confidence: 0.85,
        flatness_mean: 0.5,
      }),
    );
    expect(result.role).toBe("break");
  });

  it("classifies tonal sustained signals as melodic", () => {
    const result = inferRole(
      evidence({
        duration_s: 3,
        onset_rate_hz: 1,
        key_strength: 0.8,
      }),
    );
    expect(result.role).toBe("melodic");
  });

  it("classifies slow-attack low-density signals as pad", () => {
    const result = inferRole(
      evidence({
        duration_s: 6,
        onset_rate_hz: 0.2,
        attack_ms: 400,
        key_strength: 0.6,
      }),
    );
    expect(result.role).toBe("pad");
  });

  it("classifies high-flatness textures as fx", () => {
    const result = inferRole(
      evidence({
        duration_s: 1,
        onset_rate_hz: 0.5,
        flatness_mean: 0.7,
      }),
    );
    expect(result.role).toBe("fx");
  });

  it("returns null role when nothing scores high enough", () => {
    const result = inferRole(
      evidence({
        duration_s: 10,
        onset_rate_hz: 2,
        bpm_confidence: 0.1,
        key_strength: 0.1,
        flatness_mean: 0.1,
      }),
    );
    expect(result.role).toBeNull();
  });
});
