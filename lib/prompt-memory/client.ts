"use client";

import type { PromptMemoryEntryInput } from "@/lib/prompt-memory/schema";

type PromptMemoryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function logClientPromptMemory(
  input: PromptMemoryEntryInput,
  fetcher: PromptMemoryFetch = fetch,
) {
  if (
    typeof window === "undefined" ||
    (typeof process !== "undefined" &&
      process.env.TOOLPA_PROMPT_MEMORY_DISABLED === "1")
  ) {
    return;
  }

  try {
    void fetcher("/api/prompt-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Prompt memory should never interrupt the instrument surface.
  }
}
