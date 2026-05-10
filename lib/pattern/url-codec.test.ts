import { describe, expect, it } from "vitest";

import { createIntelligenceSamplerPattern } from "@/lib/pattern/defaults";
import {
  decodePatternFromHash,
  encodePatternToHash,
  patternToUrl,
} from "@/lib/pattern/url-codec";

describe("url-codec", () => {
  it("encodes and decodes a pattern without losing data", () => {
    const pattern = createIntelligenceSamplerPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );

    expect(decodePatternFromHash(encodePatternToHash(pattern))).toEqual(pattern);
  });

  it("returns null for missing or invalid pattern state", () => {
    expect(decodePatternFromHash("")).toBeNull();
    expect(decodePatternFromHash("p=not-valid")).toBeNull();
  });

  it("writes pattern state into a URL hash", () => {
    const pattern = createIntelligenceSamplerPattern(
      "library:jungle/let-there-break",
      "Let There Break",
    );
    const url = patternToUrl(new URL("https://example.test/tools/intelligence-sampler"), pattern);

    expect(url.hash).toContain("p=");
    expect(decodePatternFromHash(url.hash)).toEqual(pattern);
  });
});
