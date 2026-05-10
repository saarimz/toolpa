import type { BuilderStreamChunk, BuildToolRequest } from "@/lib/agents/builder-contracts";
import type { AgentManifest, InstrumentType } from "@/lib/agents/contract";
import { stepCountIs, ToolLoopAgent } from "ai";

import {
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
  const name = input.name ?? deriveToolName(input.description);
  const slug = input.slug ?? slugify(name);
  const instrumentType = resolveInstrumentType(input);
  const referenceAgent = resolveReferenceAgent(input.referenceAgent, instrumentType);
  const shouldRegister = input.register ?? true;
  const runtime = createBuilderToolRuntime({
    rootDir: input.rootDir,
    generatedRegistryPath: input.generatedRegistryPath,
    runCommand: input.runCommand,
  });
  const emit = input.onChunk ?? (() => undefined);

  emit({
    type: "decision",
    message: `instrument workflow: ${instrumentType}`,
  });
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

  if (instrumentType !== "sample") {
    const message =
      `L2 classified this as ${instrumentType}, but the installed skeleton is sample-pattern only. ` +
      "Add a specialized synth/effect skeleton before generating this tool.";
    emit({ type: "breach", message });
    throw new Error(message);
  }

  const skeleton = instantiateSkeleton(runtime, {
    slug,
    name,
    description: input.description,
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

  emit({ type: "verification", name: "typecheck", passed: registration.typecheck.passed });
  emit({ type: "verification", name: "tests", passed: registration.tests.passed });
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
  });
  const name = input.name ?? deriveToolName(input.description);
  const slug = input.slug ?? slugify(name);
  const instrumentType = resolveInstrumentType(input);
  const referenceAgent = resolveReferenceAgent(input.referenceAgent, instrumentType);
  const tokenBudget = input.tokenBudget ?? 50000;
  let consumedTokens = 0;
  const agent = new ToolLoopAgent({
    model: getGatewayModel(input.model),
    instructions: [
      "You are the L2 tool-builder agent inside ai-daw-tools.",
      "Use the builder tools to read a reference tool, read the shared schemas, instantiate a skeleton, edit only inside the generated tool directory, validate the manifest, run typecheck, run tests, and register only after the gates pass.",
      "The manifest instrument field is mandatory semantics: sample tools use Pattern and sample upload/picker workflows; synth tools use SynthScene and global key/scale workflows; effect tools transform audio streams.",
      "Generated musical instruments should opt into musicContext.globalBpm, musicContext.globalKey, and musicContext.scaleSearch unless there is a clear reason to stay local.",
      "The current canonical skeleton is sample-pattern only. For synth/effect/hybrid requests, read the closest reference and report the missing specialized skeleton instead of pretending the sample workflow is correct.",
      "Generated instruments should expose AudioOutputRecorder from components/audio-output-recorder and declare recordOutput plus outputs.recording when they can produce live audio.",
      "If a requested feature requires shared lib changes or dependencies, do not write outside the sandbox. Explain the breach as a feature request instead.",
    ].join("\n"),
    stopWhen: stepCountIs(input.maxSteps ?? 8),
    tools: createBuilderTools(runtime),
  });

  await agent.generate({
    prompt: [
      `description: ${input.description}`,
      `name: ${name}`,
      `slug: ${slug}`,
      `instrumentType: ${instrumentType}`,
      `referenceAgent: ${referenceAgent}`,
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
}

function deriveToolName(description: string) {
  const words = description
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !["a", "an", "the", "tool", "that", "takes"].includes(word.toLowerCase()))
    .slice(0, 3);

  return words.length > 0 ? titleCase(words.join(" ")) : "Generated Tool";
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "generated-tool";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function resolveInstrumentType(input: Pick<BuilderAgentRequest, "description"> & {
  instrumentType?: InstrumentType;
}): Exclude<InstrumentType, "builder"> {
  if (input.instrumentType && input.instrumentType !== "builder") {
    return input.instrumentType;
  }

  const description = input.description.toLowerCase();
  if (/\b(synth|fm|wavetable|oscillator|oscillators|subtractive|additive|pad synth|bass synth)\b/.test(description)) {
    return "synth";
  }

  if (/\b(effect|processor|reverb|delay|distortion|compressor|filter bank|fx)\b/.test(description)) {
    return "effect";
  }

  if (/\b(hybrid|sample.*synth|synth.*sample|resynth)\b/.test(description)) {
    return "hybrid";
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
