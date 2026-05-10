import { describe, expect, it } from "vitest";

import {
  buildDrumMachinePrompt,
  buildDrumMachineSystemPrompt,
} from "@/app/tools/drum-machine/lib/prompt";
import { createDefaultDrumPattern } from "@/app/tools/drum-machine/lib/polyrhythm";
import { getLibrarySample } from "@/lib/samples/library";

describe("drum machine prompt", () => {
  it("primes polyrhythm and mutation behavior", () => {
    expect(buildDrumMachineSystemPrompt()).toContain("polyrhythm");
    const prompt = buildDrumMachinePrompt({
      pattern: createDefaultDrumPattern("library:jungle/let-there-break"),
      sample: { ...getLibrarySample("library:jungle/let-there-break")!, analysis: null },
      vibe: "more sparse",
    });

    expect(prompt).toContain("more sparse");
    expect(prompt).toContain("Let There Break");
    expect(prompt).toContain("chokeGroup");
  });
});
