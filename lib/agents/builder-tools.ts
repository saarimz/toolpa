import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tool } from "ai";
import { z } from "zod";

import {
  type AgentManifest,
  InstrumentTypeSchema,
} from "@/lib/agents/contract";
import { writeGeneratedAgentManifest } from "@/lib/agents/generated-registry";
import {
  extractAgentManifestFromSource,
} from "@/lib/agents/manifest-source";
import { resolveToolFilePath } from "@/lib/agents/sandbox";
import { instantiateToolSkeleton } from "@/lib/agents/templates/instantiate";
import { SampleRoleSchema } from "@/lib/samples/roles";

export type BuilderToolTrace = {
  name: string;
  input: unknown;
  result: unknown;
};

export type BuilderCommandInvocation = {
  command: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const SIGKILL_GRACE_MS = 5_000;
const SUBPROCESS_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "NODE_ENV",
  "NODE_PATH",
  "PNPM_HOME",
  "PNPM_STORE_PATH",
  "PNPM_CACHE_DIR",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
] as const;

export type BuilderCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type BuilderToolRuntime = {
  rootDir: string;
  generatedRegistryPath?: string;
  traces: BuilderToolTrace[];
  runCommand?: (
    invocation: BuilderCommandInvocation,
  ) => Promise<BuilderCommandResult>;
  abortSignal?: AbortSignal;
  commandTimeoutMs?: number;
};

export type BuilderVerificationResult = {
  passed: boolean;
  command: string;
  stdout: string;
  stderr: string;
};

export type RegisterToolResult =
  | {
      registered: false;
      reason: string;
      manifest?: AgentManifest;
      typecheck?: BuilderVerificationResult;
      tests?: BuilderVerificationResult;
    }
  | {
      registered: true;
      manifest: AgentManifest;
      registrySize: number;
      typecheck: BuilderVerificationResult;
      tests: BuilderVerificationResult;
    };

export function createBuilderToolRuntime(
  overrides: Partial<Omit<BuilderToolRuntime, "traces">> & {
    traces?: BuilderToolTrace[];
  } = {},
): BuilderToolRuntime {
  return {
    rootDir: overrides.rootDir ?? process.cwd(),
    generatedRegistryPath: overrides.generatedRegistryPath,
    traces: overrides.traces ?? [],
    runCommand: overrides.runCommand,
    abortSignal: overrides.abortSignal,
    commandTimeoutMs: overrides.commandTimeoutMs,
  };
}

export function createBuilderTools(runtime = createBuilderToolRuntime()) {
  return {
    readToolList: tool({
      description: "List every existing L1 tool with its slug, instrument type, document, and description.",
      inputSchema: z.object({}),
      execute: async () => readToolList(runtime),
    }),
    readToolFiles: tool({
      description: "Read all files of an existing tool to study its shape.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => readToolFiles(runtime, input),
    }),
    readSchema: tool({
      description: "Read universal agent and pattern schemas.",
      inputSchema: z.object({}),
      execute: async () => readSchema(runtime),
    }),
    instantiateSkeleton: tool({
      description: "Instantiate the canonical L1 tool skeleton.",
      inputSchema: InstantiateSkeletonInputSchema,
      execute: async (input) => instantiateSkeleton(runtime, input),
    }),
    editToolFile: tool({
      description: "Write a file inside the generated tool sandbox.",
      inputSchema: z.object({
        slug: z.string().min(1),
        projectPath: z.string().min(1),
        content: z.string(),
      }),
      execute: async (input) => editToolFile(runtime, input),
    }),
    runToolTypecheck: tool({
      description: "Run TypeScript verification for the generated tool.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => runToolTypecheck(runtime, input),
    }),
    runToolTests: tool({
      description: "Run the generated tool's Vitest unit tests.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => runToolTests(runtime, input),
    }),
    validateManifest: tool({
      description: "Validate the generated manifest against AgentManifestSchema.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => validateGeneratedManifest(runtime, input),
    }),
    registerTool: tool({
      description: "Register a generated tool only after manifest, typecheck, and tests pass.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => registerTool(runtime, input),
    }),
  };
}

export function createBuilderEditTools(runtime = createBuilderToolRuntime()) {
  return {
    readToolList: tool({
      description: "List every existing L1 tool with its slug, instrument type, document, and description.",
      inputSchema: z.object({}),
      execute: async () => readToolList(runtime),
    }),
    readToolFiles: tool({
      description: "Read all files of the tool currently being edited.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => readToolFiles(runtime, input),
    }),
    readSchema: tool({
      description: "Read universal agent and pattern schemas.",
      inputSchema: z.object({}),
      execute: async () => readSchema(runtime),
    }),
    editToolFile: tool({
      description: "Write a file inside the existing tool sandbox.",
      inputSchema: z.object({
        slug: z.string().min(1),
        projectPath: z.string().min(1),
        content: z.string(),
      }),
      execute: async (input) => editToolFile(runtime, input),
    }),
    runToolTypecheck: tool({
      description: "Run TypeScript verification on the edited tool.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => runToolTypecheck(runtime, input),
    }),
    runToolTests: tool({
      description: "Run the edited tool's Vitest unit tests.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => runToolTests(runtime, input),
    }),
    validateManifest: tool({
      description: "Validate the edited manifest against AgentManifestSchema.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => validateGeneratedManifest(runtime, input),
    }),
    registerTool: tool({
      description: "Re-register the edited tool after manifest, typecheck, and tests pass.",
      inputSchema: z.object({ slug: z.string().min(1) }),
      execute: async (input) => registerTool(runtime, input),
    }),
  };
}

export function readToolFiles(
  runtime: BuilderToolRuntime,
  { slug }: { slug: string },
) {
  const toolRoot = join(
    /* turbopackIgnore: true */ runtime.rootDir,
    "app",
    "tools",
    slug,
  );
  if (!existsSync(/* turbopackIgnore: true */ toolRoot)) {
    return recordTrace(runtime, "readToolFiles", { slug }, { files: {}, missing: true });
  }

  const files = readDirRecursive(runtime.rootDir, toolRoot);
  return recordTrace(runtime, "readToolFiles", { slug }, { files, missing: false });
}

export function readToolList(runtime: BuilderToolRuntime) {
  const toolsRoot = join(/* turbopackIgnore: true */ runtime.rootDir, "app", "tools");
  if (!existsSync(/* turbopackIgnore: true */ toolsRoot)) {
    return recordTrace(runtime, "readToolList", {}, { tools: [] });
  }

  const entries = readdirSync(
    /* turbopackIgnore: true */ toolsRoot,
    { withFileTypes: true },
  );
  const tools: Array<{
    slug: string;
    instrumentType: string;
    document: string;
    description: string;
    workflow: string;
  }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = join(
      /* turbopackIgnore: true */ toolsRoot,
      entry.name,
      "manifest.ts",
    );
    if (!existsSync(/* turbopackIgnore: true */ manifestPath)) {
      continue;
    }
    try {
      const source = readFileSync(/* turbopackIgnore: true */ manifestPath, "utf8");
      const manifest = extractAgentManifestFromSource(source, entry.name);
      tools.push({
        slug: manifest.slug,
        instrumentType: manifest.instrument.type,
        document: manifest.instrument.document,
        description: manifest.description,
        workflow: manifest.instrument.workflow,
      });
    } catch {
      // skip unreadable manifests; surfacing them is the validateManifest tool's job
    }
  }

  return recordTrace(runtime, "readToolList", {}, { tools });
}

export function readSchema(runtime: BuilderToolRuntime) {
  const files = [
    "lib/pattern/schema.ts",
    "lib/agents/contract.ts",
    "lib/samples/roles.ts",
    "app/tools/evolving-fm-synth/lib/schema.ts",
  ];
  const contents = Object.fromEntries(
    files.map((path) => [
      path,
      readFileSync(
        /* turbopackIgnore: true */
        join(/* turbopackIgnore: true */ runtime.rootDir, path),
        "utf8",
      ),
    ]),
  );

  return recordTrace(runtime, "readSchema", {}, { files: contents });
}

export function instantiateSkeleton(
  runtime: BuilderToolRuntime,
  input: z.infer<typeof InstantiateSkeletonInputSchema>,
) {
  const instance = instantiateToolSkeleton(input);
  for (const [projectPath, content] of instance.files) {
    writeSandboxedFile(runtime, input.slug, projectPath, content);
  }

  return recordTrace(runtime, "instantiateSkeleton", input, {
    manifest: instance.manifest,
    files: [...instance.files.keys()],
  });
}

export function editToolFile(
  runtime: BuilderToolRuntime,
  {
    slug,
    projectPath,
    content,
  }: {
    slug: string;
    projectPath: string;
    content: string;
  },
) {
  const writtenPath = writeSandboxedFile(runtime, slug, projectPath, content);
  return recordTrace(runtime, "editToolFile", { slug, projectPath }, { path: writtenPath });
}

export async function runToolTypecheck(
  runtime: BuilderToolRuntime,
  { slug }: { slug: string },
): Promise<BuilderVerificationResult> {
  const projectPath = writeToolTypecheckConfig(runtime.rootDir, slug);
  const result = await runCommand(runtime, {
    command: "pnpm",
    args: ["exec", "tsc", "--noEmit", "-p", projectPath],
    cwd: runtime.rootDir,
    signal: runtime.abortSignal,
    timeoutMs: runtime.commandTimeoutMs,
  });

  return recordTrace(runtime, "runToolTypecheck", { slug }, toVerificationResult(result));
}

export async function runToolTests(
  runtime: BuilderToolRuntime,
  { slug }: { slug: string },
): Promise<BuilderVerificationResult> {
  const result = await runCommand(runtime, {
    command: "pnpm",
    args: ["exec", "vitest", "run", "--project", "unit", `app/tools/${slug}`],
    cwd: runtime.rootDir,
    signal: runtime.abortSignal,
    timeoutMs: runtime.commandTimeoutMs,
  });

  return recordTrace(runtime, "runToolTests", { slug }, toVerificationResult(result));
}

export function validateGeneratedManifest(
  runtime: BuilderToolRuntime,
  { slug }: { slug: string },
):
  | { valid: true; manifest: AgentManifest }
  | { valid: false; error: string } {
  try {
    const manifestPath = join(
      /* turbopackIgnore: true */ runtime.rootDir,
      "app",
      "tools",
      slug,
      "manifest.ts",
    );
    const source = readFileSync(/* turbopackIgnore: true */ manifestPath, "utf8");
    const manifest = extractAgentManifestFromSource(source, slug);
    return recordTrace(runtime, "validateManifest", { slug }, { valid: true, manifest });
  } catch (error) {
    return recordTrace(runtime, "validateManifest", { slug }, {
      valid: false,
      error: error instanceof Error ? error.message : "manifest validation failed",
    });
  }
}

export async function registerTool(
  runtime: BuilderToolRuntime,
  { slug }: { slug: string },
): Promise<RegisterToolResult> {
  const manifestResult = validateGeneratedManifest(runtime, { slug });
  if (!manifestResult.valid) {
    return recordTrace(runtime, "registerTool", { slug }, {
      registered: false,
      reason: manifestResult.error,
    });
  }

  const typecheck = await runToolTypecheck(runtime, { slug });
  if (!typecheck.passed) {
    return recordTrace(runtime, "registerTool", { slug }, {
      registered: false,
      reason: "typecheck failed",
      manifest: manifestResult.manifest,
      typecheck,
    });
  }

  const tests = await runToolTests(runtime, { slug });
  if (!tests.passed) {
    return recordTrace(runtime, "registerTool", { slug }, {
      registered: false,
      reason: "tests failed",
      manifest: manifestResult.manifest,
      typecheck,
      tests,
    });
  }

  const manifests = writeGeneratedAgentManifest({
    manifest: manifestResult.manifest,
    path: runtime.generatedRegistryPath,
  });

  return recordTrace(runtime, "registerTool", { slug }, {
    registered: true,
    manifest: manifestResult.manifest,
    registrySize: manifests.length,
    typecheck,
    tests,
  });
}

function writeSandboxedFile(
  runtime: BuilderToolRuntime,
  slug: string,
  projectPath: string,
  content: string,
) {
  const { projectPath: safeProjectPath, absolutePath } = resolveToolFilePath({
    rootDir: runtime.rootDir,
    slug,
    projectPath,
  });
  mkdirSync(/* turbopackIgnore: true */ dirname(absolutePath), { recursive: true });
  writeFileSync(/* turbopackIgnore: true */ absolutePath, content, "utf8");
  return safeProjectPath;
}

function readDirRecursive(rootDir: string, directory: string): Record<string, string> {
  const entries = readdirSync(/* turbopackIgnore: true */ directory);
  const files: Record<string, string> = {};

  for (const entry of entries) {
    const absolutePath = join(directory, entry);
    const stats = statSync(/* turbopackIgnore: true */ absolutePath);
    if (stats.isDirectory()) {
      Object.assign(files, readDirRecursive(rootDir, absolutePath));
      continue;
    }

    const projectPath = absolutePath.slice(rootDir.length + 1).replaceAll("\\", "/");
    files[projectPath] = readFileSync(
      /* turbopackIgnore: true */ absolutePath,
      "utf8",
    );
  }

  return files;
}

function writeToolTypecheckConfig(rootDir: string, slug: string) {
  const projectPath = `.audit/typecheck/tsconfig.${slug}.json`;
  const absolutePath = join(/* turbopackIgnore: true */ rootDir, projectPath);
  mkdirSync(/* turbopackIgnore: true */ dirname(absolutePath), { recursive: true });
  writeFileSync(
    /* turbopackIgnore: true */
    absolutePath,
    JSON.stringify(
      {
        extends: "../../tsconfig.json",
        compilerOptions: {
          incremental: false,
          tsBuildInfoFile: `./${slug}.tsbuildinfo`,
        },
        include: [
          "../../next-env.d.ts",
          "../../vitest.setup.ts",
          `../../app/tools/${slug}/**/*.ts`,
          `../../app/tools/${slug}/**/*.tsx`,
        ],
        exclude: ["../../node_modules", "../../.next", "../../coverage"],
      },
      null,
      2,
    ),
    "utf8",
  );

  return projectPath;
}

async function runCommand(
  runtime: BuilderToolRuntime,
  invocation: BuilderCommandInvocation,
): Promise<BuilderCommandResult> {
  if (runtime.runCommand) {
    return runtime.runCommand(invocation);
  }

  const env = Object.fromEntries(
    SUBPROCESS_ENV_ALLOWLIST.map((key) => [key, process.env[key]]).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  ) as NodeJS.ProcessEnv;

  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      stdio: ["ignore", "pipe", "pipe"] as const,
      env,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const settle = (result: BuilderCommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(softTimer);
      clearTimeout(hardTimer);
      invocation.signal?.removeEventListener("abort", abortHandler);
      resolve(result);
    };

    const timeoutMs = invocation.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const softTimer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    const hardTimer = setTimeout(() => {
      child.kill("SIGKILL");
      settle({
        exitCode: 124,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}\nbuilder: command timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs + SIGKILL_GRACE_MS);

    const abortHandler = () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), SIGKILL_GRACE_MS).unref();
      settle({
        exitCode: 130,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}\nbuilder: aborted by signal`,
      });
    };
    invocation.signal?.addEventListener("abort", abortHandler);
    if (invocation.signal?.aborted) {
      abortHandler();
    }

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("close", (exitCode) => {
      settle({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    child.on("error", (error) => {
      settle({
        exitCode: 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: error.message,
      });
    });
  });
}

function toVerificationResult(result: BuilderCommandResult): BuilderVerificationResult {
  return {
    passed: result.exitCode === 0,
    command: "pnpm",
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function recordTrace<TResult>(
  runtime: BuilderToolRuntime,
  name: string,
  input: unknown,
  result: TResult,
): TResult {
  runtime.traces.push({ name, input, result });
  return result;
}

const InstantiateSkeletonInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  capabilities: z.array(z.string().min(1)).optional(),
  sampleRoles: z.array(SampleRoleSchema).optional(),
  instrumentType: InstrumentTypeSchema.exclude(["builder"]).optional(),
});
