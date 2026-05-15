import { PromptMemoryEntrySchema } from "@/lib/prompt-memory/schema";
import { recordPromptMemory } from "@/lib/prompt-memory/server";

export type PromptMemoryHandlerDeps = {
  recordPrompt?: typeof recordPromptMemory;
};

export async function handlePromptMemoryRequest(
  request: Request,
  deps: PromptMemoryHandlerDeps = {},
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PromptMemoryEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid prompt-memory request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await (deps.recordPrompt ?? recordPromptMemory)(parsed.data);

  return Response.json(
    { logged: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
