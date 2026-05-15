import { describe, expect, it } from "vitest";

import {
  buildDrumMachinePrompt,
  buildDrumMachineSystemPrompt,
} from "@/app/tools/drum-machine/lib/prompt";
import { createDefaultDrumPattern } from "@/app/tools/drum-machine/lib/polyrhythm";
import { getLibrarySample } from "@/lib/samples/library";

describe("drum machine prompt", () => {
  it("primes polyrhythm and mutation behavior", () => {
    const system = buildDrumMachineSystemPrompt();
    expect(system).toContain("polyrhythm");
    expect(system).toContain("bossa nova is E(5,16)");
    const prompt = buildDrumMachinePrompt({
      pattern: createDefaultDrumPattern("library:jungle/let-there-break"),
      sample: { ...getLibrarySample("library:jungle/let-there-break")!, analysis: null },
      sampleMode: "multi",
      trackSamples: [
        {
          sampleId: "library:test/kick",
          sampleName: "Kick",
          sampleRole: "oneshot",
          trackId: "kick",
          trackName: "kick",
        },
      ],
      vibe: "more sparse",
    });

    expect(prompt).toContain("more sparse");
    expect(prompt).toContain("Let There Break");
    expect(prompt).toContain("chokeGroup");
    expect(prompt).toContain("inter-onset interval vector");
    expect(prompt).toContain("sample mode: multi");
    expect(prompt).toContain("kick / Kick / oneshot / library:test/kick");
    expect(prompt).toContain("each lane owns its track.sampleId");
  });
});
