import { ToolBuilderClient } from "@/app/tools/_builder/client";
import { createGeneratedToolAudit } from "@/lib/agents/generated-audit";
import { readGeneratedAgentManifests } from "@/lib/agents/generated-registry";
import { readInTreeAgentManifests } from "@/lib/agents/manifest-source";

export default async function BuildPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const description = firstParam(params?.description);
  const editSlug = firstParam(params?.edit);
  const instrumentType = firstParam(params?.instrumentType);
  const name = firstParam(params?.name);
  const slug = firstParam(params?.slug);
  const generatedManifests = readGeneratedAgentManifests();
  const editManifest = editSlug
    ? generatedManifests.find((manifest) => manifest.slug === editSlug)
    : undefined;
  const generatedAudit = createGeneratedToolAudit(generatedManifests, {
    checkFiles: true,
    inTreeManifests: readInTreeAgentManifests(),
  });

  return (
    <ToolBuilderClient
      editSlug={editManifest?.slug}
      generatedAudit={generatedAudit}
      initialDescription={description ?? editManifest?.description}
      initialInstrumentType={instrumentType ?? editManifest?.instrument.type}
      initialName={name ?? editManifest?.name}
      initialSlug={slug ?? editManifest?.slug}
      mode={editManifest ? "rebuild" : "create"}
    />
  );
}

export const metadata = {
  title: "tool-builder | ai-daw-tools",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
