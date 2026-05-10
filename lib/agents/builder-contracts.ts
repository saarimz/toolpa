import { z } from "zod";

import {
  AgentManifestSchema,
  InstrumentTypeSchema,
} from "@/lib/agents/contract";

export const BuildToolRequestSchema = z.object({
  description: z.string().min(8).max(4000),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  name: z.string().min(1).max(80).optional(),
  instrumentType: InstrumentTypeSchema.exclude(["builder"]).optional(),
  referenceAgent: z.string().min(1).optional(),
  tokenBudget: z.number().int().min(1000).max(250000).default(50000),
  register: z.boolean().default(true),
});

export type BuildToolRequest = z.infer<typeof BuildToolRequestSchema>;

export type BuilderStreamChunk =
  | { type: "decision"; message: string }
  | { type: "alternative"; message: string }
  | { type: "breach"; message: string }
  | { type: "tool-call"; name: string; input: unknown; result: unknown }
  | { type: "file"; path: string }
  | { type: "manifest"; manifest: z.infer<typeof AgentManifestSchema> }
  | {
      type: "verification";
      name: "manifest" | "typecheck" | "tests";
      passed: boolean;
      stdout?: string;
      stderr?: string;
    }
  | {
      type: "complete";
      manifest: z.infer<typeof AgentManifestSchema>;
      files: string[];
      registered: boolean;
    }
  | { type: "error"; message: string };

export function encodeBuilderStreamChunk(chunk: BuilderStreamChunk): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(chunk)}\n`);
}
