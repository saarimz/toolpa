import type {
  BuilderStreamChunk,
  BuildToolRequest,
  BuildToolSpecialization,
} from "@/lib/agents/builder-contracts";
import type { AgentManifest, InstrumentType } from "@/lib/agents/contract";
import { stepCountIs, ToolLoopAgent } from "ai";

import {
  createBuilderEditTools,
  createBuilderToolRuntime,
  createBuilderTools,
  type BuilderCommandInvocation,
  type BuilderCommandResult,
  type BuilderToolRuntime,
  instantiateSkeleton,
  readSchema,
  readToolFiles,
  registerTool,
  validateGeneratedManifest,
} from "@/lib/agents/builder-tools";
import {
  deriveGeneratedToolName,
  slugifyToolName,
} from "@/lib/agents/builder-naming";

type BuilderAgentRequest = Omit<BuildToolRequest, "register" | "tokenBudget"> & {
  register?: boolean;
  tokenBudget?: number;
};

export type RunBuilderAgentInput = BuilderAgentRequest & {
  rootDir?: string;
  generatedRegistryPath?: string;
  runCommand?: (
    invocation: BuilderCommandInvocation,
  ) => Promise<BuilderCommandResult>;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  onChunk?: (chunk: BuilderStreamChunk) => void;
};

export type RunBuilderAgentResult = {
  manifest: AgentManifest;
  files: string[];
  registered: boolean;
  traces: BuilderToolRuntime["traces"];
};

export type RunBuilderToolLoopAgentInput = RunBuilderAgentInput & {
  model?: string;
  maxSteps?: number;
};

export type RunBuilderToolLoopAgentResult = {
  traces: BuilderToolRuntime["traces"];
};

export async function runBuilderAgent(
  input: RunBuilderAgentInput,
): Promise<RunBuilderAgentResult> {
  const name = input.name ?? deriveGeneratedToolName(input.description);
  const slug = input.slug ?? slugifyToolName(name);
  const instrumentType = resolveInstrumentType(input);
  const specialization = input.builderSpecialization;
  const referenceAgent = resolveReferenceAgent(
    input.referenceAgent ?? specialization?.referenceAgent,
    instrumentType,
  );
  const shouldRegister = input.register ?? true;
  const runtime = createBuilderToolRuntime({
    rootDir: input.rootDir,
    generatedRegistryPath: input.generatedRegistryPath,
    runCommand: input.runCommand,
    abortSignal: input.abortSignal,
    commandTimeoutMs: input.timeoutMs,
  });
  const emit = input.onChunk ?? (() => undefined);

  emit({
    type: "decision",
    message: `instrument workflow: ${instrumentType}`,
  });
  validateSpecializationOrThrow(specialization, instrumentType, emit);
  if (specialization) {
    emit({
      type: "decision",
      message: `builder specialization: ${specialization.domain} via ${specialization.builderSlug}`,
    });
    emit({
      type: "decision",
      message: `specialized target: ${specialization.targetDocument} / ${specialization.targetWorkflow} using ${specialization.templateKit}`,
    });
  }
  emit({
    type: "decision",
    message: `using ${referenceAgent} as the reference tool shape`,
  });
  readSchema(runtime);
  emitLatestTrace(runtime, emit);

  readToolFiles(runtime, { slug: referenceAgent });
  emitLatestTrace(runtime, emit);

  emit({
    type: "alternative",
    message:
      "not modifying shared lib/ or package dependencies; generated files stay inside app/tools/<slug>/",
  });

  if (
    instrumentType !== "sample" &&
    instrumentType !== "synth" &&
    instrumentType !== "effect" &&
    instrumentType !== "hybrid"
  ) {
    const message =
      `L2 classified this as ${instrumentType}, but the installed skeletons currently cover sample Pattern, synth SynthScene, effect audio-stream, and sample-informed hybrid tools only.`;
    emit({ type: "breach", message });
    throw new Error(message);
  }

  const skeleton = instantiateSkeleton(runtime, {
    slug,
    name,
    description: describeSpecializedTool(input.description, specialization),
    instrumentType,
  });
  emitLatestTrace(runtime, emit);
  for (const file of skeleton.files) {
    emit({ type: "file", path: file });
  }

  const manifestResult = validateGeneratedManifest(runtime, { slug });
  emitLatestTrace(runtime, emit);
  if (!manifestResult.valid) {
    emit({ type: "verification", name: "manifest", passed: false });
    throw new Error(manifestResult.error);
  }

  emit({ type: "manifest", manifest: manifestResult.manifest });
  emit({ type: "verification", name: "manifest", passed: true });

  if (!shouldRegister) {
    emit({
      type: "complete",
      manifest: manifestResult.manifest,
      files: skeleton.files,
      registered: false,
    });
    return {
      manifest: manifestResult.manifest,
      files: skeleton.files,
      registered: false,
      traces: runtime.traces,
    };
  }

  const registration = await registerTool(runtime, { slug });
  emitLatestTrace(runtime, emit);

  if (!registration.registered) {
    emitVerificationFromRegistration(registration, emit);
    throw new Error(registration.reason);
  }

  emitVerificationFromRegistration(registration, emit);
  emit({
    type: "complete",
    manifest: registration.manifest,
    files: skeleton.files,
    registered: true,
  });

  return {
    manifest: registration.manifest,
    files: skeleton.files,
    registered: true,
    traces: runtime.traces,
  };
}

export async function runBuilderToolLoopAgent(
  input: RunBuilderToolLoopAgentInput,
): Promise<RunBuilderToolLoopAgentResult> {
  const { getGatewayModel } = await import("@/lib/ai/gateway");
  const runtime = createBuilderToolRuntime({
    rootDir: input.rootDir,
    generatedRegistryPath: input.generatedRegistryPath,
    runCommand: input.runCommand,
    abortSignal: input.abortSignal,
    commandTimeoutMs: input.timeoutMs,
  });
  const name = input.name ?? deriveGeneratedToolName(input.description);
  const slug = input.slug ?? slugifyToolName(name);
  const instrumentType = resolveInstrumentType(input);
  const specialization = input.builderSpecialization;
  const referenceAgent = resolveReferenceAgent(
    input.referenceAgent ?? specialization?.referenceAgent,
    instrumentType,
  );
  validateSpecializationOrThrow(specialization, instrumentType);
  const tokenBudget = input.tokenBudget ?? 50000;
  let consumedTokens = 0;
  const agent = new ToolLoopAgent({
    model: getGatewayModel(input.model),
    instructions: [
      "You are the L2 tool-builder agent inside ai-daw-tools.",
      "Use the builder tools to read a reference tool, read the shared schemas, instantiate a skeleton, edit only inside the generated tool directory, validate the manifest, run the static audit, run typecheck, run tests, run the audio gate, and register only after the gates pass.",
      "Call readToolList early to browse every existing L1 tool — manifests, document types, instrument types — before you commit to a shape. Read multiple reference tools when the request blends domains.",
      "The manifest instrument field is mandatory semantics: sample tools use Pattern and sample upload/picker workflows; synth tools use SynthScene and global key/scale workflows; effect tools transform audio streams.",
      "Use the shared FxManifest/FxPattern contract for tool-level A/B FX slots instead of inventing per-tool effect state.",
      "Generated musical instruments should opt into musicContext.globalBpm, musicContext.globalKey, and musicContext.scaleSearch unless there is a clear reason to stay local.",
      "The current canonical skeletons cover sample Pattern tools, synth SynthScene tools, effect audio-stream tools, and sample-informed hybrid SynthScene tools. Do not claim deeper sample resynthesis unless the requested shared document primitive exists.",
      "If builderSpecialization is present, treat it as a hard domain contract: targetInstrumentType, targetDocument, targetWorkflow, templateKit, constraints, and verificationGates must shape the generated tool.",
      "Generated instruments should use components/tool-export-panel for portable artifact actions, declare manifest.exports for audio/MIDI outputs, and keep AudioOutputRecorder available through the shared panel when they can produce live audio.",
      "If a requested feature requires shared lib changes or dependencies, do not write outside the sandbox. Explain the breach as a feature request instead.",
      "When runToolStaticAudit, runToolTypecheck, runToolTests, or runToolAudioGate fails, read its output, edit the offending file, and re-run the verification. Treat failures as feedback signals to iterate on, not terminal errors.",
      "Aim for prompts that mention concrete musical and document-level vocabulary (slot, pitchCents, tuningRef, voices, envelopes) so generated tools produce documents that actually validate against the shared schemas.",
    ].join("\n"),
    stopWhen: stepCountIs(input.maxSteps ?? 30),
    tools: createBuilderTools(runtime),
  });

  const emit = input.onChunk;
  await agent.generate({
    prompt: [
      `description: ${input.description}`,
      `name: ${name}`,
      `slug: ${slug}`,
      `instrumentType: ${instrumentType}`,
      `referenceAgent: ${referenceAgent}`,
      specialization
        ? `builderSpecialization: ${JSON.stringify(specialization)}`
        : "",
      `register: ${input.register ?? true}`,
    ].filter(Boolean).join("\n"),
    abortSignal: input.abortSignal,
    timeout: input.timeoutMs,
    onStepFinish: (step) => {
      consumedTokens +=
        step.usage.totalTokens ??
        (step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0);
      if (consumedTokens > tokenBudget) {
        throw new Error(
          `Builder token budget exceeded: ${consumedTokens}/${tokenBudget}`,
        );
      }
      const reasoningText = extractReasoningText(step);
      if (reasoningText && emit) {
        emit({ type: "reasoning", delta: reasoningText });
      }
    },
  });

  const manifestResult = validateGeneratedManifest(runtime, { slug });
  if (emit) {
    emitLatestTrace(runtime, emit);
  }
  if (!manifestResult.valid) {
    emit?.({ type: "verification", name: "manifest", passed: false });
    throw new Error(manifestResult.error);
  }

  emit?.({ type: "manifest", manifest: manifestResult.manifest });
  emit?.({ type: "verification", name: "manifest", passed: true });

  const fileSnapshot = readToolFiles(runtime, { slug });
  if (emit) {
    emitLatestTrace(runtime, emit);
  }
  const files = Object.keys(fileSnapshot.files);

  if (input.register === false) {
    emit?.({
      type: "complete",
      manifest: manifestResult.manifest,
      files,
      registered: false,
    });
    return { traces: runtime.traces };
  }

  const registration = await registerTool(runtime, { slug });
  if (emit) {
    emitLatestTrace(runtime, emit);
    emitVerificationFromRegistration(registration, emit);
  }
  if (!registration.registered) {
    throw new Error(registration.reason);
  }

  emit?.({
    type: "complete",
    manifest: registration.manifest,
    files,
    registered: true,
  });

  return { traces: runtime.traces };
}

function extractReasoningText(step: unknown): string | undefined {
  if (!step || typeof step !== "object") {
    return undefined;
  }
  const candidate = step as {
    reasoningText?: unknown;
    reasoning?: unknown;
  };
  if (typeof candidate.reasoningText === "string" && candidate.reasoningText.length > 0) {
    return candidate.reasoningText;
  }
  if (typeof candidate.reasoning === "string" && candidate.reasoning.length > 0) {
    return candidate.reasoning;
  }
  if (Array.isArray(candidate.reasoning)) {
    const text = candidate.reasoning
      .map((item) =>
        typeof item === "object" && item && "text" in item && typeof item.text === "string"
          ? item.text
          : typeof item === "string"
            ? item
            : "",
      )
      .filter(Boolean)
      .join("");
    return text.length > 0 ? text : undefined;
  }
  return undefined;
}

export type RunBuilderEditAgentInput = {
  slug: string;
  description: string;
  rootDir?: string;
  generatedRegistryPath?: string;
  runCommand?: (
    invocation: BuilderCommandInvocation,
  ) => Promise<BuilderCommandResult>;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  tokenBudget?: number;
  maxSteps?: number;
  register?: boolean;
  model?: string;
  onChunk?: (chunk: BuilderStreamChunk) => void;
};

export type RunBuilderEditAgentResult = {
  traces: BuilderToolRuntime["traces"];
};

export async function runBuilderEditAgent(
  input: RunBuilderEditAgentInput,
): Promise<RunBuilderEditAgentResult> {
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { getGatewayModel } = await import("@/lib/ai/gateway");
  const runtime = createBuilderToolRuntime({
    rootDir: input.rootDir,
    generatedRegistryPath: input.generatedRegistryPath,
    runCommand: input.runCommand,
    abortSignal: input.abortSignal,
    commandTimeoutMs: input.timeoutMs,
  });
  const emit = input.onChunk;
  const slug = input.slug;
  const toolRoot = join(runtime.rootDir, "app", "tools", slug);
  if (!existsSync(toolRoot)) {
    const message = `cannot edit tool '${slug}': directory ${toolRoot} does not exist`;
    emit?.({ type: "breach", message });
    throw new Error(message);
  }

  emit?.({
    type: "decision",
    message: `editing existing tool '${slug}' with no skeleton regeneration`,
  });

  const tokenBudget = input.tokenBudget ?? 50_000;
  let consumedTokens = 0;
  const agent = new ToolLoopAgent({
    model: getGatewayModel(input.model),
    instructions: [
      "You are the L2 tool-editor agent inside ai-daw-tools.",
      `You are editing the existing L1 tool '${slug}'. Read its current files, plan the requested change, and update only what is necessary.`,
      "Do NOT instantiate a skeleton. Do not create a new tool. The slug is fixed.",
      "Always run readToolFiles({ slug }) and readToolList() before editing anything so your changes match the current shape.",
      "Use editToolFile to overwrite specific files inside the tool directory. The sandbox enforces the boundary.",
      "When changing artifact behavior, keep manifest.exports, ToolExportPanel actions, adapter calls, and export tests aligned.",
      "After every meaningful edit run runToolStaticAudit, runToolTypecheck, runToolTests, and runToolAudioGate. If they fail, read output, fix the offending file, and re-run.",
      "Only call registerTool once manifest, static audit, typecheck, tests, and audio gate all pass. registerTool will overwrite the existing registry entry.",
      "If a requested change requires shared lib changes or new dependencies, do not write outside the sandbox; surface a feature-request breach instead.",
      "Preserve declared instrument type, document, and workflow unless the requested change is explicitly about changing them.",
    ].join("\n"),
    stopWhen: stepCountIs(input.maxSteps ?? 30),
    tools: createBuilderEditTools(runtime),
  });

  await agent.generate({
    prompt: [
      `slug: ${slug}`,
      `edit description: ${input.description}`,
      `register: ${input.register ?? true}`,
    ].join("\n"),
    abortSignal: input.abortSignal,
    timeout: input.timeoutMs,
    onStepFinish: (step) => {
      consumedTokens +=
        step.usage.totalTokens ??
        (step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0);
      if (consumedTokens > tokenBudget) {
        throw new Error(
          `Builder token budget exceeded: ${consumedTokens}/${tokenBudget}`,
        );
      }
      const reasoningText = extractReasoningText(step);
      if (reasoningText && emit) {
        emit({ type: "reasoning", delta: reasoningText });
      }
    },
  });

  return { traces: runtime.traces };
}

function emitLatestTrace(
  runtime: BuilderToolRuntime,
  emit: (chunk: BuilderStreamChunk) => void,
) {
  const trace = runtime.traces.at(-1);
  if (!trace) {
    return;
  }

  emit({
    type: "tool-call",
    name: trace.name,
    input: trace.input,
    result: trace.result,
  });
}

function emitVerificationFromRegistration(
  registration: Awaited<ReturnType<typeof registerTool>>,
  emit: (chunk: BuilderStreamChunk) => void,
) {
  if ("staticAudit" in registration && registration.staticAudit) {
    emit({
      type: "verification",
      name: "static",
      passed: registration.staticAudit.passed,
      stdout: registration.staticAudit.stdout,
      stderr: registration.staticAudit.stderr,
    });
  }

  if ("typecheck" in registration && registration.typecheck) {
    emit({
      type: "verification",
      name: "typecheck",
      passed: registration.typecheck.passed,
      stdout: registration.typecheck.stdout,
      stderr: registration.typecheck.stderr,
    });
  }

  if ("tests" in registration && registration.tests) {
    emit({
      type: "verification",
      name: "tests",
      passed: registration.tests.passed,
      stdout: registration.tests.stdout,
      stderr: registration.tests.stderr,
    });
  }

  if ("audioGate" in registration && registration.audioGate) {
    emit({
      type: "verification",
      name: "audio-gate",
      passed: registration.audioGate.passed,
      stdout: registration.audioGate.stdout,
      stderr: registration.audioGate.stderr,
    });
  }
}

function resolveInstrumentType(input: Pick<BuilderAgentRequest, "description" | "builderSpecialization"> & {
  instrumentType?: InstrumentType;
}): Exclude<InstrumentType, "builder"> {
  if (input.instrumentType && input.instrumentType !== "builder") {
    return input.instrumentType;
  }

  if (input.builderSpecialization) {
    return input.builderSpecialization.targetInstrumentType;
  }

  const description = input.description.toLowerCase();
  if (/\b(hybrid|sample.*synth|synth.*sample|resynth)\b/.test(description)) {
    return "hybrid";
  }

  if (/\b(synth|fm|wavetable|oscillator|oscillators|subtractive|additive|pad synth|bass synth)\b/.test(description)) {
    return "synth";
  }

  if (/\b(effect|processor|reverb|delay|distortion|compressor|filter bank|fx)\b/.test(description)) {
    return "effect";
  }

  return "sample";
}

function resolveReferenceAgent(
  requestedReference: string | undefined,
  instrumentType: Exclude<InstrumentType, "builder">,
) {
  if (requestedReference) {
    return requestedReference;
  }

  if (instrumentType === "synth") {
    return "evolving-fm-synth";
  }

  if (instrumentType === "effect" || instrumentType === "hybrid") {
    return "splice-lab";
  }

  return "intelligence-sampler";
}

function validateSpecializationOrThrow(
  specialization: BuildToolSpecialization | undefined,
  instrumentType: Exclude<InstrumentType, "builder">,
  emit?: (chunk: BuilderStreamChunk) => void,
) {
  if (!specialization) {
    return;
  }

  const expectedDocument = getExpectedDocumentForInstrument(instrumentType);
  if (specialization.targetInstrumentType !== instrumentType) {
    const message = `Builder specialization target ${specialization.targetInstrumentType} does not match resolved instrument workflow ${instrumentType}.`;
    emit?.({ type: "breach", message });
    throw new Error(message);
  }

  if (specialization.targetDocument !== expectedDocument) {
    const message = `Builder specialization document ${specialization.targetDocument} does not match expected ${expectedDocument} for ${instrumentType} tools.`;
    emit?.({ type: "breach", message });
    throw new Error(message);
  }
}

function getExpectedDocumentForInstrument(
  instrumentType: Exclude<InstrumentType, "builder">,
) {
  if (instrumentType === "synth" || instrumentType === "hybrid") {
    return "synth-scene";
  }

  if (instrumentType === "effect") {
    return "audio-stream";
  }

  return "pattern";
}

function describeSpecializedTool(
  description: string,
  specialization: BuildToolSpecialization | undefined,
) {
  if (!specialization) {
    return description;
  }

  const constraints = specialization.constraints.slice(0, 3).join(" ");
  const gates = specialization.verificationGates.slice(0, 2).join(" ");
  return [
    description,
    `Specialized builder profile: ${specialization.domain}.`,
    `Target document: ${specialization.targetDocument}; workflow: ${specialization.targetWorkflow}; template kit: ${specialization.templateKit}.`,
    constraints ? `Required constraints: ${constraints}` : "",
    gates ? `Verification intent: ${gates}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
