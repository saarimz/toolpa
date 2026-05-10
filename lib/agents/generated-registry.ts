import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

import {
  type AgentManifest,
  AgentManifestSchema,
} from "@/lib/agents/contract";

export const GENERATED_REGISTRY_PATH = join(
  process.cwd(),
  ".audit",
  "generated-tools.json",
);

export function readGeneratedAgentManifests(
  path = GENERATED_REGISTRY_PATH,
): AgentManifest[] {
  if (!existsSync(/* turbopackIgnore: true */ path)) {
    return [];
  }

  const raw = JSON.parse(
    readFileSync(/* turbopackIgnore: true */ path, "utf8"),
  ) as unknown;
  const parsed = GeneratedRegistryFileSchema.parse(raw);
  return parsed.manifests.map((manifest) =>
    AgentManifestSchema.parse({ ...manifest, origin: "generated" }),
  );
}

export function writeGeneratedAgentManifest({
  manifest,
  path = GENERATED_REGISTRY_PATH,
}: {
  manifest: z.input<typeof AgentManifestSchema>;
  path?: string;
}): AgentManifest[] {
  const nextManifest = AgentManifestSchema.parse({ ...manifest, origin: "generated" });
  const existing = readGeneratedAgentManifests(path).filter(
    (candidate) => candidate.slug !== nextManifest.slug,
  );
  const manifests = [...existing, nextManifest].sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );

  mkdirSync(/* turbopackIgnore: true */ dirname(path), { recursive: true });
  writeFileSync(
    /* turbopackIgnore: true */
    path,
    `${JSON.stringify({ manifests }, null, 2)}\n`,
    "utf8",
  );

  return manifests;
}

const GeneratedRegistryFileSchema = z.object({
  manifests: z.array(AgentManifestSchema).default([]),
});
