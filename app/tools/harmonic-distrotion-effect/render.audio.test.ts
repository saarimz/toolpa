import { describe, expect, it, vi } from "vitest";

import { analyzeAudioBuffer } from "@/lib/audio/offline-analysis";
import { defaultDocument, renderOffline } from "./render";

describe("harmonic-distrotion-effect offline renderer", () => {
  it("produces audible, finite, unclipped audio for the L2 audio gate", async () => {

    const buffer = await renderOffline(defaultDocument, 1);
    const analysis = analyzeAudioBuffer(buffer, {
      expectedDurationSec: 1,
      maxPeak: 1.01,
    });

    expect(analysis.ok, analysis.reasons.join("\n")).toBe(true);
    expect(analysis.rms).toBeGreaterThan(1e-4);
  });
});
