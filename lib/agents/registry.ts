import {
  type AgentManifest,
} from "@/lib/agents/contract";
import { readGeneratedAgentManifests } from "@/lib/agents/generated-registry";
import { readInTreeAgentManifests } from "@/lib/agents/manifest-source";

export function getAgentManifests(): AgentManifest[] {
  const bySlug = new Map<string, AgentManifest>();
  for (const manifest of [
    ...readGeneratedAgentManifests(),
    ...readInTreeAgentManifests(),
  ]) {
    bySlug.set(manifest.slug, manifest);
  }

  return [...bySlug.values()].sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
}

export function getEnabledAgentManifests(): AgentManifest[] {
  return getAgentManifests().filter((manifest) => manifest.status === "enabled");
}

export function getAgentManifestsByLevel(level: AgentManifest["level"]) {
  return getAgentManifests().filter((manifest) => manifest.level === level);
}

export function getAgentManifest(slug: string): AgentManifest | null {
  return getAgentManifests().find((manifest) => manifest.slug === slug) ?? null;
}
