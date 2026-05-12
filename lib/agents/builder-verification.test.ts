import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  runGeneratedToolStaticAudit,
  snapshotGeneratedTool,
} from "@/lib/agents/builder-verification";

describe("builder verification gates", () => {
  it("passes complete generated tools with render and browser audio gate contracts", () => {
    const rootDir = createGeneratedTool({
      files: {
        "client.tsx": `"use client";\nexport function Client() { return <button>play</button>; }\n`,
        "client.test.tsx": "import { it } from 'vitest'; it('renders', () => {});\n",
        "manifest.ts": "export const manifest = { slug: 'safe-tool' };\n",
        "page.tsx": "export default function Page() { return null; }\n",
        "render.audio.test.ts": "import { it } from 'vitest'; it('renders audio', () => {});\n",
        "render.ts": "export async function renderOffline() { return null; }\n",
      },
      slug: "safe-tool",
    });

    expect(runGeneratedToolStaticAudit({ rootDir, slug: "safe-tool" })).toMatchObject({
      passed: true,
    });
  });

  it("rejects unsafe or incomplete generated tools before registration", () => {
    const rootDir = createGeneratedTool({
      files: {
        "client.tsx": `import fs from "node:fs";\nconst context = new AudioContext();\nexport function Client() { localStorage.setItem('x', 'y'); return null; }\n`,
        "manifest.ts": "export const manifest = { slug: 'unsafe-tool' };\n",
        "page.tsx": "export default function Page() { return null; }\n",
      },
      slug: "unsafe-tool",
    });

    const result = runGeneratedToolStaticAudit({ rootDir, slug: "unsafe-tool" });

    expect(result.passed).toBe(false);
    expect(result.stdout).toContain("render.ts is required");
    expect(result.stdout).toContain("render.audio.test.ts is required");
    expect(result.stdout).toContain("client.tsx must start");
    expect(result.stdout).toContain("disallowed import");
    expect(result.stdout).toContain("no-module-level-audio");
    expect(result.stdout).toContain("no-browser-storage");
  });

  it("snapshots generated tool files for rebuild rollback evidence", () => {
    const rootDir = createGeneratedTool({
      files: {
        "client.tsx": `"use client";\nexport function Client() { return null; }\n`,
        "manifest.ts": "export const manifest = { slug: 'snapshot-tool' };\n",
        "page.tsx": "export default function Page() { return null; }\n",
        "render.audio.test.ts": "import { it } from 'vitest'; it('renders audio', () => {});\n",
        "render.ts": "export async function renderOffline() { return null; }\n",
      },
      slug: "snapshot-tool",
    });

    const snapshot = snapshotGeneratedTool({ rootDir, slug: "snapshot-tool" });

    expect(snapshot.fileCount).toBe(5);
    expect(readFileSync(join(rootDir, snapshot.path), "utf8")).toContain(
      "app/tools/snapshot-tool/render.ts",
    );
  });
});

function createGeneratedTool({
  files,
  slug,
}: {
  files: Record<string, string>;
  slug: string;
}) {
  const rootDir = mkdtempSync(join(tmpdir(), "builder-verification-"));
  const toolRoot = join(rootDir, "app", "tools", slug);
  mkdirSync(toolRoot, { recursive: true });
  for (const [fileName, source] of Object.entries(files)) {
    writeFileSync(join(toolRoot, fileName), source, "utf8");
  }
  return rootDir;
}
