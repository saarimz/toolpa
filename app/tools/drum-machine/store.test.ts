import { describe, expect, it } from "vitest";

import { createDefaultDrumPattern } from "@/app/tools/drum-machine/lib/polyrhythm";
import {
  getDrumTrackSamples,
  useDrumMachineStore,
} from "@/app/tools/drum-machine/store";

const baseSample = {
  id: "library:jungle/let-there-break",
  name: "Let There Break",
  role: "break" as const,
};

function resetStore() {
  useDrumMachineStore.setState({
    geometryPlan: null,
    ghostPatterns: [],
    isPlaying: false,
    laneSampleNames: {
      hat: baseSample.name,
      kick: baseSample.name,
      perc: baseSample.name,
      snare: baseSample.name,
    },
    pattern: createDefaultDrumPattern(baseSample.id, baseSample.name),
    sampleId: baseSample.id,
    sampleMode: "slice",
    sampleName: baseSample.name,
    sampleRole: baseSample.role,
    selectedStep: null,
  });
}

describe("drum-machine store sample modes", () => {
  it("updates one lane in multi-sample mode without collapsing the kit", () => {
    resetStore();

    useDrumMachineStore
      .getState()
      .setLaneSample("snare", "library:zero-g/glasychord", "Glasychord", "pad");

    const state = useDrumMachineStore.getState();
    const kick = state.pattern.tracks.find((track) => track.id === "kick");
    const snare = state.pattern.tracks.find((track) => track.id === "snare");

    expect(state.sampleMode).toBe("multi");
    expect(kick?.sampleId).toBe(baseSample.id);
    expect(snare?.sampleId).toBe("library:zero-g/glasychord");
    expect(snare?.slot).toBe(0);
    expect(snare?.steps.every((step) => step.slot === 0)).toBe(true);
    expect(state.pattern.metadata.sourceSampleIds).toEqual([
      baseSample.id,
      "library:zero-g/glasychord",
    ]);
  });

  it("collapses lane samples back to one source in slice mode", () => {
    resetStore();
    useDrumMachineStore
      .getState()
      .setLaneSample("snare", "library:zero-g/glasychord", "Glasychord", "pad");

    useDrumMachineStore.getState().setSampleMode("slice");

    const state = useDrumMachineStore.getState();
    expect(state.sampleMode).toBe("slice");
    expect(new Set(state.pattern.tracks.map((track) => track.sampleId))).toEqual(
      new Set([baseSample.id]),
    );
    expect(state.pattern.metadata.sourceSampleIds).toEqual([baseSample.id]);
  });

  it("preserves matching lane samples when applying geometry in multi mode", () => {
    resetStore();
    const store = useDrumMachineStore.getState();
    store.setLaneSample("kick", "library:test/kick", "Kick", "oneshot");
    useDrumMachineStore
      .getState()
      .setLaneSample("snare", "library:test/snare", "Snare", "oneshot");
    useDrumMachineStore
      .getState()
      .setLaneSample("hat", "library:test/hat", "Hat", "oneshot");
    useDrumMachineStore
      .getState()
      .setLaneSample("perc", "library:test/perc", "Perc", "oneshot");

    useDrumMachineStore.getState().applyGeometryPrompt("bossa nova swing rhythm");

    const state = useDrumMachineStore.getState();
    const byId = new Map(state.pattern.tracks.map((track) => [track.id, track]));
    expect(byId.get("kick")?.sampleId).toBe("library:test/kick");
    expect(byId.get("snare")?.sampleId).toBe("library:test/snare");
    expect(byId.get("hat")?.sampleId).toBe("library:test/hat");
    expect(byId.get("timeline")?.sampleId).toBe("library:test/perc");
    expect(byId.get("motion")?.sampleId).toBe("library:test/perc");
    expect(getDrumTrackSamples(state.pattern, state.laneSampleNames)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sampleId: "library:test/kick",
          sampleName: "Kick",
          trackId: "kick",
        }),
      ]),
    );
  });
});
