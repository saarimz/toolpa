import { z } from "zod";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  AgentManifestSchema,
  InstrumentTypeSchema,
  type AgentManifest,
  type InstrumentDocument,
} from "@/lib/agents/contract";
import { extractAgentManifestFromSource } from "@/lib/agents/manifest-source";

const DOCUMENT_OUTPUT_BY_TYPE = {
  "audio-stream": "audio",
  files: "files",
  pattern: "pattern",
  "synth-scene": "synthScene",
} as const satisfies Record<InstrumentDocument, keyof AgentManifest["outputs"]>;

export const GeneratedToolAuditEntrySchema = z.object({
  document: z.enum(["pattern", "synth-scene", "audio-stream", "files"]),
  enabled: z.boolean(),
  hasDocumentOutput: z.boolean(),
  hasGlobalContext: z.boolean(),
  hasManifestFile: z.boolean(),
  hasPromptInput: z.boolean(),
  hasRenderableOutput: z.boolean(),
  hasRouteFile: z.boolean(),
  hasTests: z.boolean(),
  instrumentType: InstrumentTypeSchema,
  name: z.string().min(1),
  registryMatchesManifest: z.boolean(),
  routeMatchesSlug: z.boolean(),
  route: z.string().startsWith("/"),
  slug: z.string().min(1),
});

export const GeneratedToolAuditIssueSchema = z.object({
  detail: z.string().min(1),
  id: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  slug: z.string().min(1).optional(),
});

export const GeneratedToolAuditSchema = z.object({
  byDocument: z.record(z.string(), z.number().int().min(0)),
  byInstrument: z.record(z.string(), z.number().int().min(0)),
  entries: z.array(GeneratedToolAuditEntrySchema),
  generatedCount: z.number().int().min(0),
  issues: z.array(GeneratedToolAuditIssueSchema),
  readyCount: z.number().int().min(0),
  status: z.enum(["empty", "ready", "attention"]),
  summary: z.string().min(1),
});

export type GeneratedToolAudit = z.infer<typeof GeneratedToolAuditSchema>;
export type GeneratedToolAuditEntry = z.infer<typeof GeneratedToolAuditEntrySchema>;
export type GeneratedToolAuditIssue = z.infer<typeof GeneratedToolAuditIssueSchema>;

type GeneratedToolAuditOptions = {
  checkFiles?: boolean;
  rootDir?: string;
};

export function createGeneratedToolAudit(
  manifests: AgentManifest[],
  options: GeneratedToolAuditOptions = {},
): GeneratedToolAudit {
  const generated = manifests
    .map((manifest) => AgentManifestSchema.parse(manifest))
    .filter((manifest) => manifest.origin === "generated")
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const entries = generated.map((manifest) => createEntry(manifest, options));
  const issues = [
    ...entries.flatMap(createEntryIssues),
    ...createRegistryIssues(entries),
  ];
  const readyCount = entries.filter((entry) => isEntryReady(entry)).length;
  const status =
    entries.length === 0 ? "empty" : issues.some((issue) => issue.severity !== "info") ? "attention" : "ready";

  return GeneratedToolAuditSchema.parse({
    byDocument: countBy(entries, (entry) => entry.document),
    byInstrument: countBy(entries, (entry) => entry.instrumentType),
    entries,
    generatedCount: entries.length,
    issues,
    readyCount,
    status,
    summary:
      entries.length === 0
        ? "No L2-generated tools are registered yet."
        : `${readyCount}/${entries.length} generated tools ready for dashboard use.`,
  });
}

function createEntry(
  manifest: AgentManifest,
  options: GeneratedToolAuditOptions,
): GeneratedToolAuditEntry {
  const fileStatus = options.checkFiles
    ? getGeneratedToolFileStatus(manifest, options.rootDir ?? process.cwd())
    : {
        hasManifestFile: true,
        hasRouteFile: true,
        hasTests: true,
        registryMatchesManifest: true,
      };

  return GeneratedToolAuditEntrySchema.parse({
    document: manifest.instrument.document,
    enabled: manifest.status === "enabled",
    hasDocumentOutput: manifest.outputs[DOCUMENT_OUTPUT_BY_TYPE[manifest.instrument.document]],
    hasGlobalContext:
      manifest.musicContext.globalBpm ||
      manifest.musicContext.globalKey ||
      manifest.musicContext.scaleSearch,
    hasManifestFile: fileStatus.hasManifestFile,
    hasPromptInput: manifest.inputs.prompt,
    hasRenderableOutput:
      manifest.outputs.audio ||
      manifest.outputs.pattern ||
      manifest.outputs.synthScene ||
      manifest.outputs.recording,
    hasRouteFile: fileStatus.hasRouteFile,
    hasTests: fileStatus.hasTests,
    instrumentType: manifest.instrument.type,
    name: manifest.name,
    registryMatchesManifest: fileStatus.registryMatchesManifest,
    routeMatchesSlug: manifest.route === `/tools/${manifest.slug}`,
    route: manifest.route,
    slug: manifest.slug,
  });
}

function createEntryIssues(entry: GeneratedToolAuditEntry): GeneratedToolAuditIssue[] {
  const issues: GeneratedToolAuditIssue[] = [];

  if (!entry.enabled) {
    issues.push({
      detail: `${entry.slug} is registered but not enabled.`,
      id: `${entry.slug}:disabled`,
      severity: "warning",
      slug: entry.slug,
    });
  }

  if (!entry.hasPromptInput) {
    issues.push({
      detail: `${entry.slug} does not expose a prompt input, so it will not fit the prompt-first workflow.`,
      id: `${entry.slug}:prompt`,
      severity: "warning",
      slug: entry.slug,
    });
  }

  if (!entry.hasRenderableOutput) {
    issues.push({
      detail: `${entry.slug} has no Pattern, SynthScene, audio, or recording output declared.`,
      id: `${entry.slug}:output`,
      severity: "error",
      slug: entry.slug,
    });
  }

  if (!entry.hasDocumentOutput) {
    issues.push({
      detail: `${entry.slug} does not declare the output that matches its ${entry.document} document contract.`,
      id: `${entry.slug}:document-output`,
      severity: "error",
      slug: entry.slug,
    });
  }

  if (!entry.routeMatchesSlug) {
    issues.push({
      detail: `${entry.slug} route must be /tools/${entry.slug}.`,
      id: `${entry.slug}:route-contract`,
      severity: "error",
      slug: entry.slug,
    });
  }

  if (!entry.hasGlobalContext && entry.instrumentType !== "builder") {
    issues.push({
      detail: `${entry.slug} does not opt into shared BPM/key/scale context.`,
      id: `${entry.slug}:context`,
      severity: "warning",
      slug: entry.slug,
    });
  }

  if (!entry.hasManifestFile) {
    issues.push({
      detail: `${entry.slug} is registered but app/tools/${entry.slug}/manifest.ts is missing.`,
      id: `${entry.slug}:manifest-file`,
      severity: "error",
      slug: entry.slug,
    });
  }

  if (!entry.hasRouteFile) {
    issues.push({
      detail: `${entry.slug} is registered but app/tools/${entry.slug}/page.tsx is missing.`,
      id: `${entry.slug}:route-file`,
      severity: "error",
      slug: entry.slug,
    });
  }

  if (!entry.hasTests) {
    issues.push({
      detail: `${entry.slug} has no generated-tool test file under app/tools/${entry.slug}.`,
      id: `${entry.slug}:tests`,
      severity: "warning",
      slug: entry.slug,
    });
  }

  if (!entry.registryMatchesManifest) {
    issues.push({
      detail: `${entry.slug} registry metadata does not match the in-tree manifest.`,
      id: `${entry.slug}:registry-mismatch`,
      severity: "error",
      slug: entry.slug,
    });
  }

  return issues;
}

function createRegistryIssues(entries: GeneratedToolAuditEntry[]): GeneratedToolAuditIssue[] {
  if (entries.length > 0) {
    return [];
  }

  return [
    {
      detail: "Build and register an L1 tool to populate .audit/generated-tools.json.",
      id: "registry-empty",
      severity: "info",
    },
  ];
}

function isEntryReady(entry: GeneratedToolAuditEntry) {
  return (
    entry.enabled &&
    entry.hasPromptInput &&
    entry.hasRenderableOutput &&
    entry.hasDocumentOutput &&
    entry.routeMatchesSlug &&
    (entry.hasGlobalContext || entry.instrumentType === "builder") &&
    entry.hasManifestFile &&
    entry.hasRouteFile &&
    entry.hasTests &&
    entry.registryMatchesManifest
  );
}

function countBy(
  entries: GeneratedToolAuditEntry[],
  getKey: (entry: GeneratedToolAuditEntry) => string,
) {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    const key = getKey(entry);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function getGeneratedToolFileStatus(manifest: AgentManifest, rootDir: string) {
  const toolRoot = join(rootDir, "app", "tools", manifest.slug);
  const manifestPath = join(toolRoot, "manifest.ts");
  const routePath = join(toolRoot, "page.tsx");
  const hasManifestFile = existsSync(manifestPath);
  const hasRouteFile = existsSync(routePath);
  const hasTests = hasTestFile(toolRoot);
  let registryMatchesManifest = hasManifestFile;

  if (hasManifestFile) {
    try {
      const source = readFileSync(manifestPath, "utf8");
      const inTreeManifest = extractAgentManifestFromSource(source, manifest.slug);
      registryMatchesManifest =
        inTreeManifest.name === manifest.name &&
        inTreeManifest.slug === manifest.slug &&
        inTreeManifest.route === manifest.route &&
        inTreeManifest.instrument.type === manifest.instrument.type &&
        inTreeManifest.instrument.document === manifest.instrument.document &&
        inTreeManifest.instrument.workflow === manifest.instrument.workflow &&
        inTreeManifest.status === manifest.status;
    } catch {
      registryMatchesManifest = false;
    }
  }

  return {
    hasManifestFile,
    hasRouteFile,
    hasTests,
    registryMatchesManifest,
  };
}

function hasTestFile(directory: string): boolean {
  if (!existsSync(directory)) {
    return false;
  }

  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory() && hasTestFile(absolutePath)) {
      return true;
    }
    if (stats.isFile() && /\.test\.(ts|tsx)$/.test(entry)) {
      return true;
    }
  }

  return false;
}
