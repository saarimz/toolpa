import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolvePromptMemoryDir,
  writePromptMemory,
} from "@/lib/prompt-memory/server";

describe("prompt memory writer", () => {
  it("appends prompt records to a daily ndjson file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "toolpa-prompt-memory-"));

    const result = await writePromptMemory(
      {
        action: "generate",
        resolvedPrompt: "resolved prompt",
        source: "test",
        systemPrompt: "system prompt",
        toolSlug: "test-tool",
        userPrompt: "user prompt",
      },
      {
        dir,
        disabled: false,
        id: "prompt-id",
        now: new Date("2026-05-15T12:00:00.000Z"),
      },
    );

    expect(result?.filePath).toBe(join(dir, "2026-05-15.ndjson"));
    const text = await readFile(join(dir, "2026-05-15.ndjson"), "utf8");
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      action: "generate",
      id: "prompt-id",
      resolvedPrompt: "resolved prompt",
      source: "test",
      timestamp: "2026-05-15T12:00:00.000Z",
      toolSlug: "test-tool",
      userPrompt: "user prompt",
    });
  });

  it("resolves relative prompt memory dirs from the project root", () => {
    expect(resolvePromptMemoryDir(".memory/prompts")).toBe(
      join(process.cwd(), ".memory/prompts"),
    );
  });
});
