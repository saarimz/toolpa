import { z } from "zod";

import { AgentFxSchema } from "@/lib/audio/fx-manifest";
import { InstrumentMusicContextSchema } from "@/lib/music/context";
import { AnalysisPathSchema } from "@/lib/samples/analysis/schema";
import { SampleRoleSchema } from "@/lib/samples/roles";
import { ToolExportDeclarationSchema } from "@/lib/tool-exports/contract";

export const InstrumentTypeSchema = z.enum([
  "sample",
  "synth",
  "hybrid",
  "effect",
  "midi",
  "builder",
]);

export const InstrumentDocumentSchema = z.enum([
  "pattern",
  "synth-scene",
  "midi-clip",
  "audio-stream",
  "files",
]);

export const InstrumentWorkflowSchema = z
  .object({
    type: InstrumentTypeSchema.default("sample"),
    workflow: z.string().min(1).default("sample-pattern"),
    document: InstrumentDocumentSchema.default("pattern"),
    usesSamples: z.boolean().default(true),
    usesSynthesis: z.boolean().default(false),
  })
  .default({
    type: "sample",
    workflow: "sample-pattern",
    document: "pattern",
    usesSamples: true,
    usesSynthesis: false,
  });

export const AgentManifestSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^_?[a-z0-9][a-z0-9-]*$/),
  level: z.union([z.literal(1), z.literal(2)]),
  origin: z.enum(["installed", "generated"]).default("installed"),
  description: z.string().min(1),
  route: z.string().startsWith("/"),
  instrument: InstrumentWorkflowSchema,
  capabilities: z.array(z.string().min(1)).default([]),
  inputs: z
    .object({
      samples: z.array(SampleRoleSchema).default([]),
      bpm: z.boolean().default(true),
      globalBpm: z.boolean().default(false),
      globalKey: z.boolean().default(false),
      scaleSearch: z.boolean().default(false),
      prompt: z.boolean().default(true),
      description: z.boolean().default(false),
      referenceAgent: z.boolean().default(false),
      requiredAnalysis: z.array(AnalysisPathSchema).default([]),
    })
    .default({
      samples: [],
      bpm: true,
      globalBpm: false,
      globalKey: false,
      scaleSearch: false,
      prompt: true,
      description: false,
      referenceAgent: false,
      requiredAnalysis: [],
    }),
  musicContext: InstrumentMusicContextSchema,
  outputs: z
    .object({
      pattern: z.boolean().default(false),
      synthScene: z.boolean().default(false),
      midi: z.boolean().default(false),
      audio: z.boolean().default(false),
      recording: z.boolean().default(false),
      files: z.boolean().default(false),
      manifest: z.boolean().default(false),
    })
    .default({
      pattern: false,
      synthScene: false,
      midi: false,
      audio: false,
      recording: false,
      files: false,
      manifest: false,
    }),
  exports: ToolExportDeclarationSchema.optional(),
  fx: AgentFxSchema.optional(),
  autonomy: z.enum(["manual", "assist", "driven"]).default("manual"),
  status: z.enum(["enabled", "disabled", "coming-soon"]).default("enabled"),
});

export type AgentManifest = z.infer<typeof AgentManifestSchema>;
export type InstrumentType = z.infer<typeof InstrumentTypeSchema>;
export type InstrumentDocument = z.infer<typeof InstrumentDocumentSchema>;
