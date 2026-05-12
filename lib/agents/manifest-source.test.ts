import { describe, expect, it } from "vitest";

import { extractAgentManifestFromSource } from "@/lib/agents/manifest-source";

describe("extractAgentManifestFromSource", () => {
  it("aborts an infinite-loop manifest within the 1s vm timeout", () => {
    const malicious = `
      export const manifest = (() => {
        while (true) {}
        return {};
      })();
    `;

    const started = Date.now();
    expect(() => extractAgentManifestFromSource(malicious, "evil-slug")).toThrow();
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(2500);
  });

  it("blocks require() inside generated manifests", () => {
    const requiresExternal = `
      const fs = require("node:fs");
      export const manifest = fs;
    `;

    expect(() => extractAgentManifestFromSource(requiresExternal, "needs-fs")).toThrow(
      /manifest runtime import is not allowed/i,
    );
  });
});
