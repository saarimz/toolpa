import { z } from "zod";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  AgentManifestSchema,
  InstrumentDocumentSchema,
  InstrumentTypeSchema,
  type AgentManifest,
  type InstrumentDocument,
} from "@/lib/agents/contract";
import { extractAgentManifestFromSource } from "@/lib/agents/manifest-source";

const DOCUMENT_OUTPUT_BY_TYPE = {
  "audio-stream": "audio",
  files: "files",
  "midi-clip": "midi",
  pattern: "pattern",
  "synth-scene": "synthScene",
  "visual-scene": "visualScene",
} as const satisfies Record<InstrumentDocument, keyof AgentManifest["outputs"]>;

export const GeneratedToolAuditEntrySchema = z.object({
  document: InstrumentDocumentSchema,
  enabled: z.boolean(),
  hasDocumentOutput: z.boolean(),
  hasGlobalContext: z.boolean(),
  hasInTreeManifest: z.boolean().default(true),
  hasAudioGateTest: z.boolean(),
  hasAudioExportContract: z.boolean(),
  hasManifestFile: z.boolean(),
  hasMidiExportContract: z.boolean(),
  hasOfflineRenderer: z.boolean(),
  hasPromptInput: z.boolean(),
  hasRenderableOutput: z.boolean(),
  hasRouteFile: z.boolean(),
  hasTests: z.boolean(),
  instrumentType: InstrumentTypeSchema,
  name: z.string().min(1),
  registered: z.boolean().default(true),
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
  inTreeManifests?: AgentManifest[];
  rootDir?: string;
};

export function createGeneratedToolAudit(
  manifests: AgentManifest[],
  options: GeneratedToolAuditOptions = {},
): GeneratedToolAudit {
  const registeredGenerated = manifests
    .map((manifest) => AgentManifestSchema.parse(manifest))
    .filter((manifest) => manifest.origin === "generated")
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const inTreeGenerated = options.inTreeManifests
    ?.map((manifest) => AgentManifestSchema.parse(manifest))
    .filter((manifest) => manifest.origin === "generated")
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const entryInputs = reconcileGeneratedSources(registeredGenerated, inTreeGenerated);
  const entries = entryInputs.map(({ hasInTreeManifest, manifest, registered }) =>
    createEntry(manifest, options, { hasInTreeManifest, registered }),
  );
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
  sourceStatus: {
    hasInTreeManifest?: boolean;
    registered?: boolean;
  } = {},
): GeneratedToolAuditEntry {
  const fileStatus = options.checkFiles
    ? getGeneratedToolFileStatus(manifest, options.rootDir ?? process.cwd())
    : {
        hasAudioGateTest: true,
        hasManifestFile: true,
        hasOfflineRenderer: true,
        hasRouteFile: true,
        hasTests: true,
        registryMatchesManifest: true,
      };

  return GeneratedToolAuditEntrySchema.parse({
    document: manifest.instrument.document,
    enabled: manifest.status === "enabled",
    hasDocumentOutput: manifest.outputs[DOCUMENT_OUTPUT_BY_TYPE[manifest.instrument.document]],
    hasInTreeManifest: sourceStatus.hasInTreeManifest ?? true,
    hasGlobalContext:
      manifest.musicContext.globalBpm ||
      manifest.musicContext.globalKey ||
      manifest.musicContext.scaleSearch,
    hasAudioGateTest: fileStatus.hasAudioGateTest,
    hasAudioExportContract: !manifest.outputs.audio || Boolean(manifest.exports?.audio),
    hasManifestFile: fileStatus.hasManifestFile,
    hasMidiExportContract: !manifest.outputs.midi || Boolean(manifest.exports?.midi),
    hasOfflineRenderer: fileStatus.hasOfflineRenderer,
    hasPromptInput: manifest.inputs.prompt,
    hasRenderableOutput:
      manifest.outputs.audio ||
      manifest.outputs.midi ||
      manifest.outputs.pattern ||
      manifest.outputs.visualScene ||
      manifest.outputs.synthScene ||
      manifest.outputs.recording,
    hasRouteFile: fileStatus.hasRouteFile,
    hasTests: fileStatus.hasTests,
    instrumentType: manifest.instrument.type,
    name: manifest.name,
    registryMatchesManifest: fileStatus.registryMatchesManifest,
    registered: sourceStatus.registered ?? true,
    routeMatchesSlug: manifest.route === `/tools/${manifest.slug}`,
    route: manifest.route,
    slug: manifest.slug,
  });
}

function reconcileGeneratedSources(
  registeredGenerated: AgentManifest[],
  inTreeGenerated: AgentManifest[] | undefined,
) {
  if (!inTreeGenerated) {
    return registeredGenerated.map((manifest) => ({
      hasInTreeManifest: true,
      manifest,
      registered: true,
    }));
  }

  const registeredBySlug = new Map(
    registeredGenerated.map((manifest) => [manifest.slug, manifest]),
  );
  const inTreeBySlug = new Map(
    inTreeGenerated.map((manifest) => [manifest.slug, manifest]),
  );
  const slugs = [...new Set([...registeredBySlug.keys(), ...inTreeBySlug.keys()])].sort();

  return slugs.map((slug) => ({
    hasInTreeManifest: inTreeBySlug.has(slug),
    manifest: registeredBySlug.get(slug) ?? inTreeBySlug.get(slug)!,
    registered: registeredBySlug.has(slug),
  }));
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

  if (!entry.registered) {
    issues.push({
      detail: `${entry.slug} exists in app/tools as a generated tool but is missing from .audit/generated-tools.json.`,
      id: `${entry.slug}:registry-entry`,
      severity: "error",
      slug: entry.slug,
    });
  }

  if (!entry.hasInTreeManifest) {
    issues.push({
      detail: `${entry.slug} is registered in .audit/generated-tools.json but has no generated in-tree manifest.`,
      id: `${entry.slug}:in-tree-manifest`,
      severity: "error",
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
      detail: `${entry.slug} has no Pattern, SynthScene, visual-scene, audio, or recording output declared.`,
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

  if (!entry.hasAudioExportContract) {
    issues.push({
      detail: `${entry.slug} declares audio output but has no manifest export audio strategy.`,
      id: `${entry.slug}:audio-export-contract`,
      severity: "error",
      slug: entry.slug,
    });
  }

  if (!entry.hasMidiExportContract) {
    issues.push({
      detail: `${entry.slug} declares MIDI output but has no manifest Standard MIDI export contract.`,
      id: `${entry.slug}:midi-export-contract`,
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

  if (!entry.hasOfflineRenderer) {
    issues.push({
      detail: `${entry.slug} is missing app/tools/${entry.slug}/render.ts for offline audio verification.`,
      id: `${entry.slug}:offline-renderer`,
      severity: "error",
      slug: entry.slug,
    });
  }

  if (!entry.hasAudioGateTest) {
    issues.push({
      detail: `${entry.slug} is missing app/tools/${entry.slug}/render.audio.test.ts for the browser audio gate.`,
      id: `${entry.slug}:audio-gate-test`,
      severity: "error",
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
    entry.registered &&
    entry.hasInTreeManifest &&
    entry.hasPromptInput &&
    entry.hasRenderableOutput &&
    entry.hasDocumentOutput &&
    entry.hasAudioExportContract &&
    entry.hasMidiExportContract &&
    entry.routeMatchesSlug &&
    (entry.hasGlobalContext || entry.instrumentType === "builder") &&
    entry.hasManifestFile &&
    entry.hasOfflineRenderer &&
    entry.hasAudioGateTest &&
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
  const offlineRendererPath = join(toolRoot, "render.ts");
  const routePath = join(toolRoot, "page.tsx");
  const audioGateTestPath = join(toolRoot, "render.audio.test.ts");
  const hasAudioGateTest = existsSync(audioGateTestPath);
  const hasManifestFile = existsSync(manifestPath);
  const hasOfflineRenderer = existsSync(offlineRendererPath);
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
    hasAudioGateTest,
    hasManifestFile,
    hasOfflineRenderer,
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
