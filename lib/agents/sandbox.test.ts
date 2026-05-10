import { describe, expect, it } from "vitest";

import { assertWithinTool, resolveToolFilePath } from "@/lib/agents/sandbox";

describe("agent sandbox", () => {
  it("allows files inside the generated tool directory", () => {
    expect(assertWithinTool("vocal-stutter", "app/tools/vocal-stutter/page.tsx")).toBe(
      "app/tools/vocal-stutter/page.tsx",
    );
    expect(
      resolveToolFilePath({
        rootDir: "/repo",
        slug: "vocal-stutter",
        projectPath: "./app/tools/vocal-stutter/lib/prompt.ts",
      }).absolutePath,
    ).toBe("/repo/app/tools/vocal-stutter/lib/prompt.ts");
  });

  it.each([
    ["package.json"],
    ["lib/audio/granular.ts"],
    ["app/tools/other-tool/page.tsx"],
    ["app/tools/vocal-stutter/../other/page.tsx"],
    ["/tmp/page.tsx"],
  ])("rejects writes outside the sandbox: %s", (projectPath) => {
    expect(() => assertWithinTool("vocal-stutter", projectPath)).toThrow();
  });
});
