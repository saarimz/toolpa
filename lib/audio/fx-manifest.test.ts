import { describe, expect, it } from "vitest";

import {
  BUILT_IN_FX_MANIFESTS,
  FxManifestSchema,
  FxPatternSchema,
  collectFxAutomationEvents,
  getFxDefaultWet,
  updateFxSlotParam,
  resolveFxAutomationWet,
  serializeFxPattern,
  updateFxSlotProbability,
  updateFxSlot,
} from "@/lib/audio/fx-manifest";

describe("fx manifests", () => {
  it("defines the built-in performance FX palette as manifests", () => {
    expect(BUILT_IN_FX_MANIFESTS.map((manifest) => manifest.slug)).toEqual(
      expect.arrayContaining([
        "none",
        "repeat",
        "chorus",
        "delay",
        "reverse-reverb",
        "spx-symphonic",
        "fx500-soft-focus",
        "a3000-low-resolution",
        "a3000-noisy-mod-delay",
        "emu-z-plane-morph",
      ]),
    );
    expect(
      BUILT_IN_FX_MANIFESTS.every((manifest) =>
        FxManifestSchema.safeParse(manifest).success,
      ),
    ).toBe(true);
    expect(
      BUILT_IN_FX_MANIFESTS.filter((manifest) =>
        manifest.tags.includes("shoegaze"),
      ).length,
    ).toBeGreaterThan(6);
    expect(
      BUILT_IN_FX_MANIFESTS.filter((manifest) =>
        manifest.tags.includes("jungle"),
      ).length,
    ).toBeGreaterThan(6);
  });

  it("models a four-slot FX rack while accepting legacy two-slot input", () => {
    const pattern = FxPatternSchema.parse({
      slots: [
        { id: "A", effect: "repeat" },
        { id: "B", effect: "hall-reverb", wet: 0.5 },
      ],
    });

    expect(pattern.schemaVersion).toBe(1);
    expect(pattern.slots).toHaveLength(4);
    expect(pattern.slots[0]).toMatchObject({
      effect: "repeat",
      id: "A",
      params: { delayTime: "16n", feedback: 0.62 },
      wet: 0.35,
    });
    expect(pattern.slots[1]).toMatchObject({
      effect: "hall-reverb",
      id: "B",
      params: { decay: 7.2, preDelay: 0.035 },
      wet: 0.5,
    });
    expect(pattern.slots[2]).toMatchObject({ effect: "none", id: "C" });
    expect(pattern.slots[3]).toMatchObject({ effect: "none", id: "D" });
  });

  it("moves a slot to the selected effect default wet amount and params", () => {
    const pattern = updateFxSlot(FxPatternSchema.parse({}), "A", {
      effect: "fx500-soft-focus",
    });

    expect(pattern.slots[0]).toMatchObject({
      id: "A",
      effect: "fx500-soft-focus",
      params: { chorusDepth: 0.68, decay: 6.8, shimmer: 0.16 },
      wet: getFxDefaultWet("fx500-soft-focus"),
    });
    expect(serializeFxPattern(pattern)).toContain("fx500-soft-focus");
  });

  it("edits per-slot effect parameters without dropping defaults", () => {
    const pattern = updateFxSlotParam(
      updateFxSlot(FxPatternSchema.parse({}), "A", {
        effect: "emu-z-plane-morph",
      }),
      "A",
      "morph",
      0.8,
    );

    expect(pattern.slots[0]).toMatchObject({
      effect: "emu-z-plane-morph",
      params: {
        frameA: "liquid-bass",
        frameB: "glass-phaser",
        morph: 0.8,
        resonance: 0.72,
      },
    });
  });

  it("models probabilistic wet automation per FX slot", () => {
    const pattern = updateFxSlotProbability(
      updateFxSlot(FxPatternSchema.parse({}), "A", {
        effect: "delay",
        wet: 0.2,
      }),
      "A",
      {
        enabled: true,
        intervalSteps: 4,
        chance: 0.75,
        missWet: 0.05,
        minWet: 0.35,
        maxWet: 0.9,
        smoothMs: 25,
      },
    );

    expect(pattern.slots[0].probability).toEqual({
      enabled: true,
      intervalSteps: 4,
      chance: 0.75,
      missWet: 0.05,
      minWet: 0.35,
      maxWet: 0.9,
      smoothMs: 25,
    });
    expect(serializeFxPattern(pattern)).toContain("\"intervalSteps\":4");
  });

  it("collects interval automation events and resolves hit/miss wet values", () => {
    const pattern = FxPatternSchema.parse({
      slots: [
        {
          id: "A",
          effect: "repeat",
          probability: {
            enabled: true,
            intervalSteps: 8,
            chance: 0.5,
            missWet: 0,
            minWet: 0.25,
            maxWet: 0.75,
            smoothMs: 40,
          },
        },
        { id: "B", effect: "none" },
      ],
    });

    const events = collectFxAutomationEvents({
      fxPattern: pattern,
      stepDurationSec: 0.125,
      totalSteps: 16,
    });

    expect(events).toEqual([
      expect.objectContaining({ slotId: "A", stepIndex: 0, timeSec: 0 }),
      expect.objectContaining({ slotId: "A", stepIndex: 8, timeSec: 1 }),
    ]);
    expect(resolveFxAutomationWet(events[0], () => 0.6)).toBe(0);
    expect(
      resolveFxAutomationWet(events[0], viSequence([0.2, 0.5])),
    ).toBeCloseTo(0.5);
  });
});

function viSequence(values: number[]) {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}
