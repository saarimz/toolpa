import { z } from "zod";

import {
  AgentManifestSchema,
  type AgentManifest,
  type InstrumentDocument,
  type InstrumentType,
} from "@/lib/agents/contract";
import {
  createBuilderProfilePlan,
  getBuilderProfileDomains,
} from "@/lib/agents/builder-profiles";

const DOCUMENT_OUTPUT_BY_TYPE = {
  "audio-stream": "audio",
  files: "files",
  pattern: "pattern",
  "synth-scene": "synthScene",
} as const satisfies Record<InstrumentDocument, keyof AgentManifest["outputs"]>;

const REQUIRED_SPECIALIZED_TARGETS = {
  effect: { document: "audio-stream", instrumentType: "effect" },
  hybrid: { document: "synth-scene", instrumentType: "hybrid" },
  microtonal: { document: "pattern", instrumentType: "sample" },
  sample: { document: "pattern", instrumentType: "sample" },
  synth: { document: "synth-scene", instrumentType: "synth" },
} as const;

const ReferenceConventionSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  requirement: z.string().min(1),
});

export const WEB_AUDIO_REFERENCE_CONVENTIONS = [
  {
    id: "serializable-audio-documents",
    source: "Ameobea/web-synth, GridSound, Strudel",
    requirement:
      "Every L1 exposes a Pattern, SynthScene, or audio-stream document instead of hiding output only inside transient Web Audio nodes.",
  },
  {
    id: "explicit-audio-ui-boundary",
    source: "Web Audio Modules SDK",
    requirement:
      "Manifest, audio behavior, and UI route stay explicit so generated tools can be loaded, inspected, and rebuilt.",
  },
  {
    id: "bounded-playable-synthesis",
    source: "AMY, aike WebAudioDemo, browser synths",
    requirement:
      "Playable L1s expose bounded prompt/audio controls, recording, and user-triggered audio output.",
  },
  {
    id: "builder-generated-tool-gates",
    source: "Tone.js, Web Synth, WAM-style plugin hosts",
    requirement:
      "L2 builders must validate manifests, static safety, tests, audio-gate output, registry metadata, and sandbox scope before a generated L1 becomes part of the suite.",
  },
] as const;

export const PlatformHardeningIssueSchema = z.object({
  detail: z.string().min(1),
  id: z.string().min(1),
  severity: z.enum(["warning", "error"]),
  slug: z.string().min(1).optional(),
});

export const PlatformHardeningAuditSchema = z.object({
  conventions: z.array(ReferenceConventionSchema),
  issues: z.array(PlatformHardeningIssueSchema),
  l1Count: z.number().int().min(0),
  l2Count: z.number().int().min(0),
  specializedBuilderCount: z.number().int().min(0),
  status: z.enum(["ready", "attention"]),
  summary: z.string().min(1),
});

export type PlatformHardeningAudit = z.infer<typeof PlatformHardeningAuditSchema>;
export type PlatformHardeningIssue = z.infer<typeof PlatformHardeningIssueSchema>;

export function createPlatformHardeningAudit(
  manifests: AgentManifest[],
): PlatformHardeningAudit {
  const parsed = manifests
    .map((manifest) => AgentManifestSchema.parse(manifest))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const l1Manifests = parsed.filter((manifest) => manifest.level === 1);
  const l2Manifests = parsed.filter((manifest) => manifest.level === 2);
  const issues = [
    ...l1Manifests.flatMap(createL1Issues),
    ...l2Manifests.flatMap(createL2Issues),
    ...createSpecializedBuilderIssues(l2Manifests),
  ];
  const status = issues.some((issue) => issue.severity === "error")
    ? "attention"
    : issues.length > 0
      ? "attention"
      : "ready";

  return PlatformHardeningAuditSchema.parse({
    conventions: WEB_AUDIO_REFERENCE_CONVENTIONS,
    issues,
    l1Count: l1Manifests.length,
    l2Count: l2Manifests.length,
    specializedBuilderCount: getBuilderProfileDomains().length,
    status,
    summary:
      issues.length === 0
        ? `${l1Manifests.length} L1 tools and ${l2Manifests.length} L2 builders pass platform hardening gates.`
        : `${issues.length} L1/L2 platform hardening issue${issues.length === 1 ? "" : "s"} found.`,
  });
}

function createL1Issues(manifest: AgentManifest): PlatformHardeningIssue[] {
  const issues: PlatformHardeningIssue[] = [];
  const expectedOutput = DOCUMENT_OUTPUT_BY_TYPE[manifest.instrument.document];

  if (manifest.instrument.type === "builder" || manifest.instrument.document === "files") {
    issues.push(issue(manifest, "l1-kind", "error", "L1 tools must be playable instruments, not builder/file manifests."));
  }

  if (manifest.route !== `/tools/${manifest.slug}`) {
    issues.push(issue(manifest, "l1-route", "error", `L1 route must be /tools/${manifest.slug}.`));
  }

  if (!manifest.inputs.prompt) {
    issues.push(issue(manifest, "l1-prompt", "error", "L1 tools must expose prompt input for AI-native generation."));
  }

  if (!manifest.outputs[expectedOutput]) {
    issues.push(
      issue(
        manifest,
        "l1-document-output",
        "error",
        `L1 document ${manifest.instrument.document} must declare outputs.${expectedOutput}.`,
      ),
    );
  }

  if (!manifest.outputs.audio) {
    issues.push(issue(manifest, "l1-audio-output", "error", "L1 tools must declare an audible Web Audio output."));
  }

  if (
    requiresMidiExport(manifest) &&
    (!manifest.outputs.midi || !manifest.capabilities.includes("exportMidi"))
  ) {
    issues.push(
      issue(
        manifest,
        "l1-midi-export",
        "error",
        "SynthScene L1 tools must declare MIDI output and exportMidi unless they are continuous live synths.",
      ),
    );
  }

  if (!manifest.outputs.recording || !manifest.capabilities.includes("recordOutput")) {
    issues.push(
      issue(
        manifest,
        "l1-recording",
        "error",
        "L1 tools must expose recordOutput capability and recording output.",
      ),
    );
  }

  if (!hasRequiredMusicContext(manifest.instrument.type, manifest.musicContext)) {
    issues.push(
      issue(
        manifest,
        "l1-music-context",
        "error",
        `${manifest.instrument.type} L1 tools must opt into the required shared BPM/key/scale context.`,
      ),
    );
  }

  if (/^\s*build\b/i.test(manifest.description) || /\bbuilder\b/i.test(manifest.description)) {
    issues.push(
      issue(
        manifest,
        "l1-description",
        "warning",
        "L1 descriptions must describe the instrument itself, not a builder task.",
      ),
    );
  }

  return issues;
}

function createL2Issues(manifest: AgentManifest): PlatformHardeningIssue[] {
  const issues: PlatformHardeningIssue[] = [];

  if (manifest.instrument.type !== "builder" || manifest.instrument.document !== "files") {
    issues.push(issue(manifest, "l2-kind", "error", "L2 tools must be builder/file manifests."));
  }

  if (!/^\/build(?:\/[a-z0-9-]+)?$/.test(manifest.route)) {
    issues.push(issue(manifest, "l2-route", "error", "L2 builders must mount under /build."));
  }

  if (manifest.slug !== "_builder" && !/^_[a-z0-9-]+-builder$/.test(manifest.slug)) {
    issues.push(issue(manifest, "l2-slug", "error", "Specialized L2 builder slugs must use _<domain>-builder."));
  }

  if (!manifest.inputs.description || !manifest.inputs.referenceAgent || manifest.inputs.prompt) {
    issues.push(
      issue(
        manifest,
        "l2-inputs",
        "error",
        "L2 builders must accept description/referenceAgent inputs and avoid prompt-as-instrument input.",
      ),
    );
  }

  if (!manifest.outputs.files || !manifest.outputs.manifest) {
    issues.push(issue(manifest, "l2-outputs", "error", "L2 builders must output files and manifests."));
  }

  for (const capability of ["verifyTool", "registerTool"]) {
    if (!manifest.capabilities.includes(capability)) {
      issues.push(issue(manifest, `l2-${capability}`, "error", `L2 builders must include ${capability}.`));
    }
  }

  return issues;
}

function requiresMidiExport(manifest: AgentManifest) {
  return (
    manifest.instrument.document === "synth-scene" &&
    !manifest.capabilities.includes("continuousSynth") &&
    !manifest.capabilities.includes("cameraTracking")
  );
}

function createSpecializedBuilderIssues(
  l2Manifests: AgentManifest[],
): PlatformHardeningIssue[] {
  const issues: PlatformHardeningIssue[] = [];
  const l2BySlug = new Map(l2Manifests.map((manifest) => [manifest.slug, manifest]));

  for (const domain of getBuilderProfileDomains()) {
    const plan = createBuilderProfilePlan({ domain });
    const expectedTarget = REQUIRED_SPECIALIZED_TARGETS[domain];
    const registered = l2BySlug.get(plan.builderManifest.slug);
    const planText = [
      ...plan.implementationSteps,
      ...plan.verificationGates,
      ...plan.constraints,
      plan.handoffPrompt,
    ].join(" ");

    if (!registered) {
      issues.push({
        detail: `${domain} builder profile is not registered as ${plan.builderManifest.slug}.`,
        id: `${domain}:builder-profile-registered`,
        severity: "error",
        slug: plan.builderManifest.slug,
      });
      continue;
    }

    if (registered.route !== plan.builderManifest.route) {
      issues.push(issue(registered, "builder-profile-route", "error", `${domain} builder route must be ${plan.builderManifest.route}.`));
    }

    if (
      plan.target.instrumentType !== expectedTarget.instrumentType ||
      plan.target.document !== expectedTarget.document
    ) {
      issues.push(
        issue(
          registered,
          "builder-profile-target",
          "error",
          `${domain} profile target must be ${expectedTarget.instrumentType}/${expectedTarget.document}.`,
        ),
      );
    }

    for (const token of ["generated", "manifest", "test", "registry", "sandbox", "audio"]) {
      if (!planText.toLowerCase().includes(token)) {
        issues.push(
          issue(
            registered,
            `builder-profile-${token}`,
            "error",
            `${domain} profile must explicitly cover ${token} hardening.`,
          ),
        );
      }
    }

    if (
      plan.target.document === "synth-scene" &&
      !/\bmidi\b/i.test(planText)
    ) {
      issues.push(
        issue(
          registered,
          "builder-profile-midi",
          "error",
          `${domain} profile must explicitly cover MIDI export hardening for SynthScene tools.`,
        ),
      );
    }
  }

  return issues;
}

function hasRequiredMusicContext(
  instrumentType: InstrumentType,
  context: AgentManifest["musicContext"],
) {
  if (instrumentType === "effect") {
    return context.globalBpm;
  }
  return context.globalBpm && context.globalKey && context.scaleSearch;
}

function issue(
  manifest: AgentManifest,
  id: string,
  severity: PlatformHardeningIssue["severity"],
  detail: string,
): PlatformHardeningIssue {
  return {
    detail,
    id: `${manifest.slug}:${id}`,
    severity,
    slug: manifest.slug,
  };
}
