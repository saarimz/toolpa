import { z } from "zod";

import {
  evolveSynthScene,
  generateSynthSceneFromPrompt,
} from "@/app/tools/evolving-fm-synth/lib/agent";
import {
  SynthSceneSchema,
  type SynthScene,
} from "@/app/tools/evolving-fm-synth/lib/schema";
import {
  GlobalMusicContextSchema,
  type GlobalMusicContext,
} from "@/lib/music/context";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

const GenerateSynthSceneModeSchema = z.enum(["generate", "evolve"]);
type GenerateSynthSceneMode = z.infer<typeof GenerateSynthSceneModeSchema>;
type GenerateSynthSceneInput = {
  prompt: string;
  mode: GenerateSynthSceneMode;
  musicalContext?: GlobalMusicContext;
  scene?: SynthScene | null;
};

const GenerateSynthSceneRequestSchema = z.object({
  prompt: z.string().max(3000).default(""),
  mode: GenerateSynthSceneModeSchema.default("generate"),
  musicalContext: GlobalMusicContextSchema.optional(),
  scene: SynthSceneSchema.optional(),
});

export type GenerateSynthSceneHandlerDeps = {
  generateSynthSceneWithGateway: (
    input: GenerateSynthSceneInput,
  ) => Promise<SynthScene>;
};

export async function handleGenerateSynthSceneRequest(
  request: Request,
  deps: GenerateSynthSceneHandlerDeps,
): Promise<Response> {
  const parsed = GenerateSynthSceneRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid synth generation request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await recordPromptMemory({
    action: parsed.data.mode,
    metadata: {
      hasMusicalContext: Boolean(parsed.data.musicalContext),
      hasScene: Boolean(parsed.data.scene),
    },
    route: "/api/synth",
    source: "api.synth",
    toolSlug: "synth-scene",
    userPrompt: parsed.data.prompt,
  });

  try {
    const scene = await deps.generateSynthSceneWithGateway({
      mode: parsed.data.mode,
      musicalContext: parsed.data.musicalContext,
      prompt: parsed.data.prompt,
      scene: parsed.data.scene ?? null,
    });

    return Response.json({ scene, source: "gateway" });
  } catch (error) {
    const scene = createLocalFallbackScene({
      mode: parsed.data.mode,
      musicalContext: parsed.data.musicalContext,
      prompt: parsed.data.prompt,
      scene: parsed.data.scene ?? null,
    });

    return Response.json({
      scene,
      source: "local-agent",
      warning: getSynthGenerationWarning(error),
    });
  }
}

function createLocalFallbackScene({
  mode,
  musicalContext,
  prompt,
  scene,
}: GenerateSynthSceneInput): SynthScene {
  if (mode === "evolve" && scene) {
    return evolveSynthScene(scene, prompt, musicalContext);
  }

  return generateSynthSceneFromPrompt({
    musicalContext,
    prompt,
    previousScene: scene ?? null,
  });
}

function getSynthGenerationWarning(error: unknown) {
  const message = error instanceof Error ? error.message : "Gateway generation failed";

  if (/aborted due to timeout|timed? out|timeout/i.test(message)) {
    return "Gateway timed out; kept local patch.";
  }

  return message
    .replace(/^Invalid error response format:\s*/i, "")
    .replace(/^Gateway request failed:\s*/i, "Gateway request failed; kept local patch: ");
}
