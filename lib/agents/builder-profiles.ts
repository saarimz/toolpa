import { z } from "zod";

import {
  AgentManifestSchema,
  type AgentManifest,
  type InstrumentType,
} from "@/lib/agents/contract";

export const BuilderProfileDomainSchema = z.enum([
  "sample",
  "synth",
  "effect",
  "hybrid",
  "microtonal",
]);

export type BuilderProfileDomain = z.infer<typeof BuilderProfileDomainSchema>;

type TargetDocument = "pattern" | "synth-scene" | "audio-stream";
type BuilderTargetInstrumentType = Exclude<InstrumentType, "builder" | "midi">;

type MusicContextFlags = {
  globalBpm: boolean;
  globalKey: boolean;
  scaleSearch: boolean;
};

type BuilderProfileBlueprint = {
  domain: BuilderProfileDomain;
  label: string;
  builderSlug: `_${string}-builder`;
  builderName: string;
  route: string;
  targetInstrumentType: BuilderTargetInstrumentType;
  targetDocument: TargetDocument;
  targetWorkflow: string;
  referenceAgent: string;
  secondaryReferenceAgents: string[];
  templateKit: string;
  sandboxRoot: string;
  capabilities: string[];
  musicContext: MusicContextFlags;
  implementationSteps: string[];
  verificationGates: string[];
  constraints: string[];
};

export type BuilderProfilePlan = {
  domain: BuilderProfileDomain;
  label: string;
  requestedDescription: string;
  summary: string;
  builderManifest: AgentManifest;
  target: {
    instrumentType: BuilderTargetInstrumentType;
    document: TargetDocument;
    workflow: string;
    musicContext: MusicContextFlags;
  };
  referenceAgent: string;
  secondaryReferenceAgents: string[];
  templateKit: string;
  sandboxRoot: string;
  implementationSteps: string[];
  verificationGates: string[];
  constraints: string[];
  handoffPrompt: string;
};

const DEFAULT_DESCRIPTION =
  "Build a specialized L2 builder that produces transparent, addressable L1 music tools for this domain.";

const COMMON_IMPLEMENTATION_STEPS = [
  "Keep manifest, route, audio behavior, and UI state separated so generated L1s are inspectable and rebuildable.",
  "Keep the generated musical document serializable as Pattern JSON, SynthScene JSON, or an audio-stream patch.",
];

const COMMON_VERIFICATION_GATES = [
  "Generated tool tests cover prompt input, document export, audio playback, and recording controls.",
  "Generated L1s include render.ts plus render.audio.test.ts so the browser OfflineAudioContext audio gate can prove audible, finite output.",
  "Generated registry metadata matches the in-tree manifest before registration completes.",
  "Sandbox verification proves generated writes stay inside app/tools/<generated-slug>/ and .audit/generated-tools.json.",
  "Audio starts only from an explicit user gesture and keeps a recordable output path.",
  "SynthScene-generated tools expose a MIDI export path when their output has discrete notes.",
];

const COMMON_CONSTRAINTS = [
  "No direct file writes outside app/tools/<generated-slug>/ or .audit/generated-tools.json.",
  "Generated L1 descriptions must describe an instrument, not another builder.",
  "Generated L1 tools must keep prompt, document output, playback, and recording visible in the UI.",
];

const BUILDER_PROFILE_BLUEPRINTS: Record<BuilderProfileDomain, BuilderProfileBlueprint> = {
  sample: {
    domain: "sample",
    label: "Sample Pattern Builder",
    builderSlug: "_sample-builder",
    builderName: "sample-builder",
    route: "/build/sample",
    targetInstrumentType: "sample",
    targetDocument: "pattern",
    targetWorkflow: "sample-pattern",
    referenceAgent: "intelligence-sampler",
    secondaryReferenceAgents: ["splice-lab", "drum-machine", "grid-sampler"],
    templateKit: "sample-pattern-tool-skeleton",
    sandboxRoot: "app/tools/_sample-builder/",
    capabilities: [
      "generateSamplePatternTool",
      "wireDeclickedSamplerEngine",
      "verifyTool",
      "registerTool",
    ],
    musicContext: {
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
    },
    implementationSteps: [
      "Narrow the L2 builder orchestration to Pattern-producing sample tools.",
      "Make generated tools use the shared sample engine for fades, zero-crossing smoothing, release ramps, and WAV export.",
      "Expose global BPM, swing, root, scale, and prompt generation in every generated sample tool.",
      "Register only after manifest, typecheck, and test gates pass.",
    ],
    verificationGates: [
      "Generated sample tool manifest validates as level 1 with instrument.document = pattern.",
      "Generated playback path imports the shared sample engine instead of hand-rolling Tone.Player starts.",
      "Generated tool tests cover prompt generation, WAV export, JSON copy, live trace, and sample declick defaults.",
      "Registry discovery sees the generated tool without manual dispatch registration.",
    ],
    constraints: [
      "No direct file writes outside app/tools/<generated-slug>/ or .audit/generated-tools.json.",
      "Generated sample tools must not bypass the shared declick/smoothing path.",
      "Pattern schema remains the output contract; raw audio streams belong to effect builders.",
    ],
  },
  synth: {
    domain: "synth",
    label: "Synth Scene Builder",
    builderSlug: "_synth-builder",
    builderName: "synth-builder",
    route: "/build/synth",
    targetInstrumentType: "synth",
    targetDocument: "synth-scene",
    targetWorkflow: "synth-scene",
    referenceAgent: "evolving-fm-synth",
    secondaryReferenceAgents: [],
    templateKit: "synth-scene-tool-skeleton",
    sandboxRoot: "app/tools/_synth-builder/",
    capabilities: [
      "generateSynthSceneTool",
      "wireGatewayFallback",
      "renderSynthWav",
      "exportSynthMidi",
      "verifyTool",
      "registerTool",
    ],
    musicContext: {
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
    },
    implementationSteps: [
      "Use evolving-fm-synth as the reference tool shape.",
      "Generate SynthScene templates with local fallback, macro controls, recording, WAV render, MIDI export, and JSON export.",
      "Require prompt state to stay visible and gateway timeouts to preserve the last playable local scene.",
      "Register only after manifest, typecheck, SynthScene schema tests, and render smoke coverage pass.",
    ],
    verificationGates: [
      "Generated synth tool manifest validates as level 1 with instrument.document = synth-scene.",
      "Generated synth scene parses with SynthSceneSchema and can render at least one bar offline.",
      "Generated synth tools export valid Standard MIDI Files from the SynthScene note timeline.",
      "Gateway timeout path preserves a local patch and surfaces the timeout state in the UI.",
      "Global BPM/key/scale sync updates the generated synth scene deterministically.",
    ],
    constraints: [
      "Generated synth tools must not claim outputs.pattern.",
      "Gateway failures must never erase the last playable local scene.",
      "Synth template files must stay separate from sample Pattern templates.",
    ],
  },
  effect: {
    domain: "effect",
    label: "Audio Stream Effect Builder",
    builderSlug: "_effect-builder",
    builderName: "effect-builder",
    route: "/build/effect",
    targetInstrumentType: "effect",
    targetDocument: "audio-stream",
    targetWorkflow: "audio-stream-effect",
    referenceAgent: "evolving-fm-synth",
    secondaryReferenceAgents: ["splice-lab"],
    templateKit: "audio-stream-effect-tool-skeleton",
    sandboxRoot: "app/tools/_effect-builder/",
    capabilities: [
      "generateEffectTool",
      "wireLiveInputPatch",
      "recordEffectOutput",
      "verifyTool",
      "registerTool",
    ],
    musicContext: {
      globalBpm: true,
      globalKey: false,
      scaleSearch: false,
    },
    implementationSteps: [
      "Generate tools whose primary document is an inspectable effect patch over a live or rendered audio stream.",
      "Template bounded controls for filters, delay, drive, modulation, wet/dry mix, recording, and patch JSON export.",
      "Expose prompt overlays while patch parameters are being generated.",
      "Gate registration on manifest validation, typecheck, patch schema tests, and a no-input rendering smoke test.",
    ],
    verificationGates: [
      "Generated effect tool manifest validates as level 1 with instrument.document = audio-stream.",
      "Generated patch parameters are bounded and serializable.",
      "Generated UI can record output and copy patch JSON without requiring a sample library item.",
      "No generated effect tool schedules sample or synth playback unless it explicitly declares a hybrid workflow.",
    ],
    constraints: [
      "Effects process input streams; they should not masquerade as Pattern or SynthScene generators.",
      "All generated DSP controls need min/max bounds and non-explosive defaults.",
      "Effect builders should follow global BPM for synced delay/modulation, but not force a global key.",
    ],
  },
  hybrid: {
    domain: "hybrid",
    label: "Sample-Informed Synth Builder",
    builderSlug: "_hybrid-builder",
    builderName: "hybrid-builder",
    route: "/build/hybrid",
    targetInstrumentType: "hybrid",
    targetDocument: "synth-scene",
    targetWorkflow: "sample-informed-synth",
    referenceAgent: "evolving-fm-synth",
    secondaryReferenceAgents: ["intelligence-sampler"],
    templateKit: "sample-informed-synth-tool-skeleton",
    sandboxRoot: "app/tools/_hybrid-builder/",
    capabilities: [
      "generateHybridSynthTool",
      "wireSampleAnalysisContext",
      "renderSynthWav",
      "exportSynthMidi",
      "verifyTool",
      "registerTool",
    ],
    musicContext: {
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
    },
    implementationSteps: [
      "Compose synth-scene templates with a source-sample picker and sample-analysis context.",
      "Keep the boundary explicit: the source sample informs prompts and modulation targets; it is not silently resynthesized.",
      "Generate SynthScene documents with global BPM/key/scale sync, recording, WAV render, MIDI export, and patch JSON export.",
      "Verify that generated tools degrade gracefully when sample analysis is missing or still loading.",
    ],
    verificationGates: [
      "Generated hybrid manifest validates as level 1 with instrument.type = hybrid and instrument.document = synth-scene.",
      "Generated prompts include sample metadata and analysis summaries without embedding raw audio.",
      "Generated synth scene plays without the source sample after the scene is created.",
      "Generated hybrid tools export valid MIDI from the generated SynthScene without requiring the source sample.",
      "UI states clearly separate sample context, synth generation, recording, and JSON export.",
    ],
    constraints: [
      "Do not imply audio cloning or hidden resynthesis from the source sample.",
      "Hybrid tools must keep the SynthScene schema as their saved artifact.",
      "Sample analysis must be optional and recoverable, not a hard page-load dependency.",
    ],
  },
  microtonal: {
    domain: "microtonal",
    label: "Microtonal Sample Builder",
    builderSlug: "_microtonal-builder",
    builderName: "microtonal-builder",
    route: "/build/microtonal",
    targetInstrumentType: "sample",
    targetDocument: "pattern",
    targetWorkflow: "microtonal-sample-pattern",
    referenceAgent: "intelligence-sampler",
    secondaryReferenceAgents: ["evolving-fm-synth"],
    templateKit: "microtonal-pattern-tool-skeleton",
    sandboxRoot: "app/tools/_microtonal-builder/",
    capabilities: [
      "generateMicrotonalPatternTool",
      "wireScaleSearch",
      "resolveTuningRef",
      "verifyTool",
      "registerTool",
    ],
    musicContext: {
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
    },
    implementationSteps: [
      "Generate sample-pattern tools that expose scale-search prompts and manual root/scale controls.",
      "Template Pattern steps that can use pitchCents and tuningRef for non-12TET sample playback.",
      "Wire generated tools through the shared sample engine so tuningRef resolves before playback and WAV export.",
      "Add microtonal-focused tests for cents, EDO, and ratio scale references.",
    ],
    verificationGates: [
      "Generated microtonal tool manifest opts into globalBpm, globalKey, and scaleSearch.",
      "Generated prompt builders mention the active root, scale id, scale description, and tuning system.",
      "Generated playback tests assert pitchCents/tuningRef produce non-12TET playback rates.",
      "Generated UI supports both LLM scale search and manual root/scale/BPM/swing selection.",
    ],
    constraints: [
      "Microtonal generated tools must not collapse every scale into integer pitchSemitones.",
      "The active scale must be visible as data below the prompt result.",
      "Manual controls need to remain available even when the LLM scale prompt fails.",
    ],
  },
};

export function getBuilderProfileDomains(): BuilderProfileDomain[] {
  return BuilderProfileDomainSchema.options;
}

export function getBuilderProfileBlueprint(
  domain: BuilderProfileDomain,
): BuilderProfileBlueprint {
  return BUILDER_PROFILE_BLUEPRINTS[domain];
}

export function coerceBuilderProfileDomain(
  value: string | undefined,
): BuilderProfileDomain {
  const parsed = BuilderProfileDomainSchema.safeParse(value);
  return parsed.success ? parsed.data : "synth";
}

export function createBuilderProfilePlan(input: {
  description?: string;
  domain?: string;
}): BuilderProfilePlan {
  const domain = coerceBuilderProfileDomain(input.domain);
  const description = normalizeDescription(input.description);
  const blueprint = getBuilderProfileBlueprint(domain);
  const implementationSteps = mergeUnique([
    ...blueprint.implementationSteps,
    ...COMMON_IMPLEMENTATION_STEPS,
  ]);
  const verificationGates = mergeUnique([
    ...blueprint.verificationGates,
    ...COMMON_VERIFICATION_GATES,
  ]);
  const constraints = mergeUnique([
    ...blueprint.constraints,
    ...COMMON_CONSTRAINTS,
  ]);
  const builderManifest = AgentManifestSchema.parse({
    name: blueprint.builderName,
    slug: blueprint.builderSlug,
    level: 2,
    origin: "installed",
    description: `Specialized L2 builder for ${blueprint.targetWorkflow} L1 tools. Seed brief: ${description}`,
    route: blueprint.route,
    instrument: {
      type: "builder",
      workflow: `${blueprint.domain}-l2-builder`,
      document: "files",
      usesSamples: false,
      usesSynthesis: false,
    },
    capabilities: blueprint.capabilities,
    inputs: {
      samples: [],
      bpm: false,
      globalBpm: false,
      globalKey: false,
      scaleSearch: false,
      prompt: false,
      description: true,
      referenceAgent: true,
      requiredAnalysis: [],
    },
    musicContext: {
      globalBpm: false,
      globalKey: false,
      scaleSearch: false,
    },
    outputs: {
      pattern: false,
      synthScene: false,
      midi: false,
      audio: false,
      recording: false,
      files: true,
      manifest: true,
    },
    autonomy: "driven",
    status: "enabled",
  });

  return {
    domain,
    label: blueprint.label,
    requestedDescription: description,
    summary: `${blueprint.builderName} generates ${blueprint.targetDocument} L1 tools for ${blueprint.targetWorkflow} workflows.`,
    builderManifest,
    target: {
      instrumentType: blueprint.targetInstrumentType,
      document: blueprint.targetDocument,
      workflow: blueprint.targetWorkflow,
      musicContext: blueprint.musicContext,
    },
    referenceAgent: blueprint.referenceAgent,
    secondaryReferenceAgents: blueprint.secondaryReferenceAgents,
    templateKit: blueprint.templateKit,
    sandboxRoot: blueprint.sandboxRoot,
    implementationSteps,
    verificationGates,
    constraints,
    handoffPrompt: buildHandoffPrompt(description, blueprint, verificationGates, constraints),
  };
}

function normalizeDescription(description: string | undefined) {
  const trimmed = description?.trim();
  return trimmed ? trimmed : DEFAULT_DESCRIPTION;
}

function buildHandoffPrompt(
  description: string,
  blueprint: BuilderProfileBlueprint,
  verificationGates: string[],
  constraints: string[],
) {
  const secondary = blueprint.secondaryReferenceAgents.length
    ? ` and cross-check ${blueprint.secondaryReferenceAgents.join(", ")}`
    : "";

  return [
    `Build ${blueprint.builderName} as a level-2 builder for ${blueprint.targetWorkflow} tools.`,
    `User brief: ${description}`,
    `Use ${blueprint.referenceAgent} as the primary reference${secondary}.`,
    `Generated L1 tools must declare instrument.type = ${blueprint.targetInstrumentType}, instrument.document = ${blueprint.targetDocument}, and musicContext = ${JSON.stringify(blueprint.musicContext)}.`,
    `Template kit: ${blueprint.templateKit}. Sandbox root for this L2 builder profile: ${blueprint.sandboxRoot}.`,
    `Registration gates: ${verificationGates.join(" ")}`,
    `Hard constraints: ${constraints.join(" ")}`,
  ].join("\n");
}

function mergeUnique(values: string[]) {
  return [...new Set(values)];
}
