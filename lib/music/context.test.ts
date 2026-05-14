import { describe, expect, it } from "vitest";

import {
  DEFAULT_GLOBAL_MUSIC_CONTEXT,
  GlobalMusicContextSchema,
  InstrumentMusicContextSchema,
  formatGlobalMusicContext,
} from "@/lib/music/context";

describe("global music context schemas", () => {
  it("defaults to a usable shared BPM/key context", () => {
    expect(DEFAULT_GLOBAL_MUSIC_CONTEXT).toMatchObject({
      bpm: 138,
      swing: 0,
      key: {
        tonic: "C",
        scaleId: "minor",
        referenceFrequency: 440,
      },
    });
  });

  it("validates bounded BPM and key state", () => {
    expect(
      GlobalMusicContextSchema.parse({
        bpm: 172,
        swing: 0.12,
        key: { tonic: "F#", scaleId: "quarter-tone-neutral" },
      }),
    ).toMatchObject({
      bpm: 172,
      key: { tonic: "F#", scaleId: "quarter-tone-neutral" },
    });

    expect(GlobalMusicContextSchema.parse({ bpm: 1 })).toMatchObject({ bpm: 1 });
    expect(GlobalMusicContextSchema.parse({ bpm: 12 })).toMatchObject({ bpm: 12 });
    expect(() => GlobalMusicContextSchema.parse({ bpm: 0 })).toThrow();
  });

  it("defaults instrument-level context opt-ins", () => {
    expect(InstrumentMusicContextSchema.parse({})).toEqual({
      globalBpm: false,
      globalKey: false,
      scaleSearch: false,
    });
  });

  it("formats context for LLM prompts", () => {
    expect(
      formatGlobalMusicContext({
        bpm: 140,
        swing: 0,
        key: { tonic: "D", scaleId: "dorian", referenceFrequency: 440 },
      }),
    ).toBe("D dorian / 140 BPM");
  });
});
