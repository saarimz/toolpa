import { z } from "zod";

export const SampleUseIdeaSchema = z.object({
  title: z.string().min(1).max(80),
  approach: z.string().min(1).max(220),
  complement: z.string().min(1).max(180),
  productionMove: z.string().min(1).max(180),
});

export const SampleUseIdeasOutputSchema = z.object({
  ideas: z.array(SampleUseIdeaSchema).length(5),
});

export type SampleUseIdea = z.infer<typeof SampleUseIdeaSchema>;
export type SampleUseIdeasOutput = z.infer<typeof SampleUseIdeasOutputSchema>;
