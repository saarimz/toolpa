import { z } from "zod";

export const PromptMemoryEntrySchema = z.object({
  source: z.string().trim().min(1).max(120),
  route: z.string().trim().min(1).max(160).optional(),
  toolSlug: z.string().trim().min(1).max(120).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  userPrompt: z.string().max(20_000).optional(),
  systemPrompt: z.string().max(80_000).optional(),
  resolvedPrompt: z.string().max(240_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PromptMemoryEntryInput = z.infer<typeof PromptMemoryEntrySchema>;

export type PromptMemoryRecord = PromptMemoryEntryInput & {
  id: string;
  timestamp: string;
};
