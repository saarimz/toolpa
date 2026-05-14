import { z } from "zod";

import { GlobalBpmSchema, GlobalMusicContextSchema } from "@/lib/music/context";
import { SampleAnalysisSchema } from "@/lib/samples/analysis/schema";
import { SampleRoleSchema } from "@/lib/samples/roles";

export const GeneratePatternRequestSchema = z.object({
  toolSlug: z.string().min(1),
  mode: z.enum(["fresh", "mutate", "fill", "polyrhythm", "splice"]).default("fresh"),
  agentMode: z.enum(["structured", "tool-calling"]).default("structured"),
  prompt: z.string().max(2000).default(""),
  context: z.object({
    pattern: z.unknown(),
    sampleId: z.string().min(1),
    sampleName: z.string().min(1).optional(),
    sampleRole: z.union([SampleRoleSchema, z.literal("unknown")]).optional(),
    sampleAnalysis: SampleAnalysisSchema.optional(),
    secondarySampleId: z.string().min(1).optional(),
    secondarySampleName: z.string().min(1).optional(),
    secondarySampleRole: z.union([SampleRoleSchema, z.literal("unknown")]).optional(),
    secondarySampleAnalysis: SampleAnalysisSchema.optional(),
    bpm: GlobalBpmSchema,
    swing: z.number().min(0).max(0.5).default(0),
    musicalContext: GlobalMusicContextSchema.optional(),
    sliceCount: z.number().int().min(1).max(256).optional(),
    traversal: z.string().optional(),
  }),
});

export type GeneratePatternRequest = z.infer<typeof GeneratePatternRequestSchema>;

export const PromptSuggestionsRequestSchema = z.object({
  toolSlug: z.string().min(1),
  prompt: z.string().max(2000).default(""),
  context: z
    .object({
      sampleId: z.string().min(1).optional(),
      sampleName: z.string().min(1).optional(),
      sampleRole: z.union([SampleRoleSchema, z.literal("unknown")]).optional(),
      secondarySampleId: z.string().min(1).optional(),
      secondarySampleName: z.string().min(1).optional(),
      secondarySampleRole: z.union([SampleRoleSchema, z.literal("unknown")]).optional(),
      bpm: GlobalBpmSchema.optional(),
      swing: z.number().min(0).max(0.5).optional(),
      musicalContext: GlobalMusicContextSchema.optional(),
    })
    .default({}),
});

export type PromptSuggestionsRequest = z.infer<
  typeof PromptSuggestionsRequestSchema
>;

export type GenerateStreamChunk =
  | { type: "prompt"; system: string; prompt: string }
  | { type: "tool-call"; name: string; input: unknown; result: unknown }
  | { type: "partial"; pattern: unknown }
  | { type: "final"; pattern: unknown }
  | { type: "error"; message: string };

export function encodeStreamChunk(chunk: GenerateStreamChunk): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(chunk)}\n`);
}
