import type { AgentManifest } from "@/lib/agents/contract";

export function getDeclaredExportKinds(manifest: AgentManifest) {
  return {
    audio: Boolean(manifest.exports?.audio),
    midi: Boolean(manifest.exports?.midi),
  };
}

