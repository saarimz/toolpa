import { notFound } from "next/navigation";

import { ToolBuilderClient } from "@/app/tools/_builder/client";
import {
  BuilderProfileDomainSchema,
  createBuilderProfilePlan,
  getBuilderProfileDomains,
  type BuilderProfileDomain,
} from "@/lib/agents/builder-profiles";
import { createGeneratedToolAudit } from "@/lib/agents/generated-audit";
import { readGeneratedAgentManifests } from "@/lib/agents/generated-registry";
import { readInTreeAgentManifests } from "@/lib/agents/manifest-source";

export default async function SpecializedBuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await params;
  const domain = parseDomain(resolvedParams.domain);
  if (!domain) {
    notFound();
  }

  const plan = createBuilderProfilePlan({ domain });
  const resolvedSearchParams = await searchParams;
  const description =
    firstParam(resolvedSearchParams?.description) ?? getDefaultToolBrief(domain);
  const name = firstParam(resolvedSearchParams?.name) ?? getDefaultToolName(domain);
  const slug = firstParam(resolvedSearchParams?.slug) ?? getDefaultToolSlug(domain);
  const generatedAudit = createGeneratedToolAudit(readGeneratedAgentManifests(), {
    checkFiles: true,
    inTreeManifests: readInTreeAgentManifests(),
  });

  return (
    <ToolBuilderClient
      builderDetail={`${plan.label} L2`}
      builderPlan={plan}
      builderRoute={plan.builderManifest.route}
      builderSlug={plan.builderManifest.name}
      generatedAudit={generatedAudit}
      initialDescription={description}
      initialInstrumentType={plan.target.instrumentType}
      initialName={name}
      initialReferenceAgent={plan.referenceAgent}
      initialSlug={slug}
      lockInstrumentType
    />
  );
}

export function generateStaticParams() {
  return getBuilderProfileDomains().map((domain) => ({ domain }));
}

export const metadata = {
  title: "specialized builder | Toolpa.JS",
};

function parseDomain(value: string): BuilderProfileDomain | null {
  const parsed = BuilderProfileDomainSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getDefaultToolName(domain: BuilderProfileDomain) {
  if (domain === "sample") {
    return "Sample Pattern Tool";
  }

  if (domain === "effect") {
    return "Live Effect Tool";
  }

  if (domain === "hybrid") {
    return "Sample Informed Synth";
  }

  if (domain === "microtonal") {
    return "Microtonal Sampler";
  }

  return "Evolving Synth Tool";
}

function getDefaultToolSlug(domain: BuilderProfileDomain) {
  if (domain === "sample") {
    return "sample-pattern-tool";
  }

  if (domain === "effect") {
    return "live-effect-tool";
  }

  if (domain === "hybrid") {
    return "sample-informed-synth";
  }

  if (domain === "microtonal") {
    return "microtonal-pattern-tool";
  }

  return "evolving-synth-tool";
}

function getDefaultToolBrief(domain: BuilderProfileDomain) {
  if (domain === "sample") {
    return "Build a sample-pattern L1 tool with declicked playback, global BPM/key sync, scale search, WAV export, recording, and live step trace.";
  }

  if (domain === "effect") {
    return "Build an audio-stream effect L1 tool with bounded filter, drive, delay, modulation, prompt-generated patch JSON, generation overlay, and record output.";
  }

  if (domain === "hybrid") {
    return "Build a sample-informed SynthScene L1 tool that uses source-sample context for prompt shaping while keeping the generated synth scene explicit and exportable.";
  }

  if (domain === "microtonal") {
    return "Build a microtonal sample-pattern L1 tool that exposes scale-search prompts, manual root/scale controls, pitchCents, tuningRef, declicked playback, and WAV export.";
  }

  return "Build an evolving SynthScene L1 tool with global BPM/key/scale sync, local-agent gateway fallback, macro controls, WAV export, recording, and JSON copy.";
}
