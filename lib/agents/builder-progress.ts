import type { BuilderStreamChunk } from "@/lib/agents/builder-contracts";

export type BuilderProgressStageId =
  | "brief"
  | "schema"
  | "reference"
  | "sandbox"
  | "skeleton"
  | "manifest"
  | "typecheck"
  | "tests"
  | "registry";

export type BuilderProgressStatus =
  | "pending"
  | "active"
  | "passed"
  | "failed"
  | "blocked";

export type BuilderRunStatus =
  | "idle"
  | "running"
  | "stopped"
  | "complete"
  | "failed"
  | "blocked";

export type BuilderProgressStage = {
  id: BuilderProgressStageId;
  label: string;
  description: string;
  status: BuilderProgressStatus;
  evidence?: string;
};

export type BuilderProgressSummary = {
  activeLabel: string;
  completedCount: number;
  nextAction: string;
  status: BuilderRunStatus;
  stages: BuilderProgressStage[];
  totalCount: number;
};

const STAGE_DEFINITIONS: Array<Omit<BuilderProgressStage, "status" | "evidence">> = [
  {
    id: "brief",
    label: "brief classified",
    description: "Name, slug, instrument type, and reference agent are chosen.",
  },
  {
    id: "schema",
    label: "schemas read",
    description: "Shared Pattern, SynthScene, sample, and manifest contracts are loaded.",
  },
  {
    id: "reference",
    label: "reference studied",
    description: "The selected L1 tool shape is read before writing a new tool.",
  },
  {
    id: "sandbox",
    label: "sandbox boundary",
    description: "The run stays inside app/tools/<slug> and records alternatives.",
  },
  {
    id: "skeleton",
    label: "files generated",
    description: "The canonical L1 skeleton and any tool edits are written.",
  },
  {
    id: "manifest",
    label: "manifest valid",
    description: "The generated AgentManifest evaluates and passes schema validation.",
  },
  {
    id: "typecheck",
    label: "typecheck passed",
    description: "Scoped TypeScript verification passes for the generated tool.",
  },
  {
    id: "tests",
    label: "tests passed",
    description: "Scoped Vitest verification passes for the generated tool.",
  },
  {
    id: "registry",
    label: "registry complete",
    description: "The generated manifest is registered for the dashboard.",
  },
];

export function buildBuilderProgress(
  chunks: BuilderStreamChunk[],
  options: {
    error?: string | null;
    isBuilding?: boolean;
  } = {},
): BuilderProgressSummary {
  const stages: BuilderProgressStage[] = STAGE_DEFINITIONS.map((stage) => ({
    ...stage,
    status: "pending" as BuilderProgressStatus,
  }));

  const mark = (
    id: BuilderProgressStageId,
    status: BuilderProgressStatus,
    evidence?: string,
  ) => {
    const stage = stages.find((candidate) => candidate.id === id);
    if (!stage || isTerminal(stage.status)) {
      return;
    }

    if (statusRank(status) >= statusRank(stage.status)) {
      stage.status = status;
      stage.evidence = evidence ?? stage.evidence;
    }
  };

  if (options.isBuilding && chunks.length === 0) {
    mark("brief", "active", "posting build request");
  }

  for (const chunk of chunks) {
    if (chunk.type === "decision") {
      mark("brief", "passed", chunk.message);
      continue;
    }

    if (chunk.type === "alternative") {
      mark("sandbox", "passed", chunk.message);
      continue;
    }

    if (chunk.type === "tool-call") {
      applyToolCallProgress(mark, chunk.name, chunk.result);
      continue;
    }

    if (chunk.type === "file") {
      mark("skeleton", "passed", chunk.path);
      continue;
    }

    if (chunk.type === "manifest") {
      mark("manifest", "passed", chunk.manifest.slug);
      continue;
    }

    if (chunk.type === "verification") {
      mark(chunk.name, chunk.passed ? "passed" : "failed", verificationEvidence(chunk));
      continue;
    }

    if (chunk.type === "breach") {
      mark("sandbox", "blocked", chunk.message);
      continue;
    }

    if (chunk.type === "complete") {
      mark("brief", "passed");
      mark("schema", "passed");
      mark("reference", "passed");
      mark("sandbox", "passed");
      mark("skeleton", "passed");
      mark("manifest", "passed", chunk.manifest.slug);
      if (chunk.registered) {
        mark("typecheck", "passed");
        mark("tests", "passed");
        mark("registry", "passed", `${chunk.manifest.slug} registered`);
      } else {
        mark("registry", "passed", `${chunk.manifest.slug} generated without registry write`);
      }
      continue;
    }

    if (chunk.type === "reasoning") {
      continue;
    }

    mark(firstUnfinishedStage(stages)?.id ?? "registry", "failed", chunk.message);
  }

  if (options.error) {
    mark(firstUnfinishedStage(stages)?.id ?? "registry", "failed", options.error);
  }

  const blockedStage = stages.find((stage) => stage.status === "blocked");
  const failedStage = stages.find((stage) => stage.status === "failed");
  const complete = chunks.some((chunk) => chunk.type === "complete");

  if (options.isBuilding && !blockedStage && !failedStage && !complete) {
    const nextStage = firstUnfinishedStage(stages);
    if (nextStage) {
      mark(nextStage.id, "active");
    }
  }

  const activeStage = stages.find((stage) => stage.status === "active");
  const completedCount = stages.filter((stage) => stage.status === "passed").length;
  const status = resolveRunStatus({
    blocked: Boolean(blockedStage),
    chunks,
    complete,
    failed: Boolean(failedStage),
    isBuilding: Boolean(options.isBuilding),
  });

  return {
    activeLabel: activeStage?.label ?? statusLabel(status),
    completedCount,
    nextAction: resolveNextAction({
      activeStage,
      blockedStage,
      failedStage,
      status,
    }),
    status,
    stages,
    totalCount: stages.length,
  };
}

function applyToolCallProgress(
  mark: (
    id: BuilderProgressStageId,
    status: BuilderProgressStatus,
    evidence?: string,
  ) => void,
  name: string,
  result: unknown,
) {
  if (name === "readSchema") {
    mark("schema", "passed", "shared schemas loaded");
    return;
  }

  if (name === "readToolFiles") {
    mark("reference", resultHasBoolean(result, "missing", true) ? "failed" : "passed", "reference files read");
    return;
  }

  if (name === "instantiateSkeleton") {
    mark("skeleton", "passed", "canonical skeleton written");
    return;
  }

  if (name === "editToolFile") {
    mark("skeleton", "active", resultString(result, "path") ?? "editing generated files");
    return;
  }

  if (name === "validateManifest") {
    mark("manifest", resultHasBoolean(result, "valid", false) ? "failed" : "passed", resultString(result, "error") ?? "manifest checked");
    return;
  }

  if (name === "runToolTypecheck") {
    mark("typecheck", resultHasBoolean(result, "passed", true) ? "passed" : "failed", verificationResultEvidence(result));
    return;
  }

  if (name === "runToolTests") {
    mark("tests", resultHasBoolean(result, "passed", true) ? "passed" : "failed", verificationResultEvidence(result));
    return;
  }

  if (name === "registerTool") {
    mark("registry", resultHasBoolean(result, "registered", true) ? "passed" : "failed", resultString(result, "reason") ?? "registration attempted");
    applyNestedVerification(mark, result, "typecheck");
    applyNestedVerification(mark, result, "tests");
  }
}

function applyNestedVerification(
  mark: (
    id: BuilderProgressStageId,
    status: BuilderProgressStatus,
    evidence?: string,
  ) => void,
  result: unknown,
  key: "typecheck" | "tests",
) {
  if (!isRecord(result) || !isRecord(result[key])) {
    return;
  }

  const nested = result[key];
  mark(key, nested.passed === true ? "passed" : "failed", verificationResultEvidence(nested));
}

function resolveRunStatus({
  blocked,
  chunks,
  complete,
  failed,
  isBuilding,
}: {
  blocked: boolean;
  chunks: BuilderStreamChunk[];
  complete: boolean;
  failed: boolean;
  isBuilding: boolean;
}): BuilderRunStatus {
  if (blocked) {
    return "blocked";
  }

  if (failed) {
    return "failed";
  }

  if (complete) {
    return "complete";
  }

  if (isBuilding) {
    return "running";
  }

  return chunks.length > 0 ? "stopped" : "idle";
}

function resolveNextAction({
  activeStage,
  blockedStage,
  failedStage,
  status,
}: {
  activeStage?: BuilderProgressStage;
  blockedStage?: BuilderProgressStage;
  failedStage?: BuilderProgressStage;
  status: BuilderRunStatus;
}) {
  if (blockedStage) {
    return `Resolve sandbox breach: ${blockedStage.evidence ?? "the requested primitive is outside the current builder domain"}.`;
  }

  if (failedStage) {
    return `Fix ${failedStage.label}: ${failedStage.evidence ?? "check the build stream for diagnostics"}.`;
  }

  if (status === "complete") {
    return "Open the dashboard and test the generated tool from the L1 catalog.";
  }

  if (status === "running") {
    return `Wait for ${activeStage?.label ?? "the active builder stage"} to finish.`;
  }

  if (status === "stopped") {
    return "Restart the build stream when ready.";
  }

  return "Describe a tool, confirm the instrument type, then start the L2 build.";
}

function firstUnfinishedStage(stages: BuilderProgressStage[]) {
  return stages.find(
    (stage) => stage.status === "pending" || stage.status === "active",
  );
}

function isTerminal(status: BuilderProgressStatus) {
  return status === "failed" || status === "blocked";
}

function statusRank(status: BuilderProgressStatus) {
  const ranks = {
    pending: 0,
    active: 1,
    passed: 2,
    failed: 3,
    blocked: 3,
  } satisfies Record<BuilderProgressStatus, number>;

  return ranks[status];
}

function statusLabel(status: BuilderRunStatus) {
  const labels = {
    blocked: "blocked",
    complete: "complete",
    failed: "failed",
    idle: "idle",
    running: "running",
    stopped: "stopped",
  } satisfies Record<BuilderRunStatus, string>;

  return labels[status];
}

function verificationEvidence(chunk: Extract<BuilderStreamChunk, { type: "verification" }>) {
  if (chunk.passed) {
    return "passed";
  }

  return chunk.stderr || chunk.stdout || "failed";
}

function verificationResultEvidence(result: unknown) {
  return resultString(result, "stderr") || resultString(result, "stdout") || resultString(result, "reason") || "verification result";
}

function resultHasBoolean(result: unknown, key: string, expected: boolean) {
  return isRecord(result) && result[key] === expected;
}

function resultString(result: unknown, key: string) {
  if (!isRecord(result)) {
    return undefined;
  }

  const value = result[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
