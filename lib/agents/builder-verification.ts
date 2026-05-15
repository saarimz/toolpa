import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";

export type BuilderGateResult = {
  passed: boolean;
  command: string;
  stdout: string;
  stderr: string;
};

export type GeneratedToolSnapshotResult = {
  fileCount: number;
  path: string;
};

type StaticIssue = {
  file: string;
  message: string;
  rule: string;
};

type SourceFileWithParseDiagnostics = ts.SourceFile & {
  readonly parseDiagnostics?: readonly ts.Diagnostic[];
};

const REQUIRED_GENERATED_FILES = [
  "manifest.ts",
  "page.tsx",
  "client.tsx",
  "render.ts",
  "render.audio.test.ts",
] as const;

const DISALLOWED_IMPORTS = new Set([
  "child_process",
  "fs",
  "node:child_process",
  "node:fs",
  "node:process",
  "process",
]);

const DISALLOWED_STORAGE_GLOBALS = new Set([
  "indexedDB",
  "localStorage",
  "sessionStorage",
]);

const DISALLOWED_NETWORK_GLOBALS = new Set([
  "EventSource",
  "RTCPeerConnection",
  "WebSocket",
]);

export function runGeneratedToolStaticAudit({
  rootDir,
  slug,
}: {
  rootDir: string;
  slug: string;
}): BuilderGateResult {
  const toolRoot = join(/* turbopackIgnore: true */ rootDir, "app", "tools", slug);
  const issues: StaticIssue[] = [];

  if (!existsSync(/* turbopackIgnore: true */ toolRoot)) {
    return staticResult([
      {
        file: `app/tools/${slug}`,
        message: "generated tool directory is missing",
        rule: "required-directory",
      },
    ]);
  }

  for (const fileName of REQUIRED_GENERATED_FILES) {
    const absolutePath = join(/* turbopackIgnore: true */ toolRoot, fileName);
    if (!existsSync(/* turbopackIgnore: true */ absolutePath)) {
      issues.push({
        file: `app/tools/${slug}/${fileName}`,
        message: `${fileName} is required for L2 registration`,
        rule: "required-file",
      });
    }
  }

  const files = readToolSourceFiles(rootDir, toolRoot);
  for (const [projectPath, source] of files) {
    issues.push(...scanSourceFile(projectPath, source));
  }

  if (!files.some(([projectPath]) => projectPath.endsWith(".test.ts") || projectPath.endsWith(".test.tsx"))) {
    issues.push({
      file: `app/tools/${slug}`,
      message: "at least one generated-tool test is required",
      rule: "required-test",
    });
  }

  return staticResult(issues);
}

export function runGeneratedToolSourceSyntaxAudit({
  projectPath,
  source,
}: {
  projectPath: string;
  source: string;
}): BuilderGateResult {
  const sourceFile = createToolSourceFile(projectPath, source);
  return staticResult(
    getParseDiagnostics(sourceFile).map((diagnostic) =>
      syntaxDiagnosticToIssue(projectPath, sourceFile, diagnostic),
    ),
    "syntax-audit",
  );
}

export function snapshotGeneratedTool({
  rootDir,
  slug,
}: {
  rootDir: string;
  slug: string;
}): GeneratedToolSnapshotResult {
  const toolRoot = join(/* turbopackIgnore: true */ rootDir, "app", "tools", slug);
  const files = Object.fromEntries(readAllToolFiles(rootDir, toolRoot));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const projectPath = `.audit/snapshots/${slug}/${timestamp}.json`;
  const absolutePath = join(/* turbopackIgnore: true */ rootDir, projectPath);
  mkdirSync(/* turbopackIgnore: true */ dirname(absolutePath), { recursive: true });
  writeFileSync(
    /* turbopackIgnore: true */
    absolutePath,
    `${JSON.stringify({ createdAt: new Date().toISOString(), files, slug }, null, 2)}\n`,
    "utf8",
  );
  return { fileCount: Object.keys(files).length, path: projectPath };
}

function staticResult(
  issues: StaticIssue[],
  command = "static-audit",
): BuilderGateResult {
  return {
    command,
    passed: issues.length === 0,
    stderr: "",
    stdout:
      issues.length === 0
        ? "static audit passed"
        : issues
            .map((issue) => `${issue.file}: ${issue.rule}: ${issue.message}`)
            .join("\n"),
  };
}

function scanSourceFile(projectPath: string, source: string): StaticIssue[] {
  const sourceFile = createToolSourceFile(projectPath, source);
  const issues: StaticIssue[] = [];
  issues.push(
    ...getParseDiagnostics(sourceFile).map((diagnostic) =>
      syntaxDiagnosticToIssue(projectPath, sourceFile, diagnostic),
    ),
  );

  if (/\/\/\s*(\.\.\.\s*rest|TODO|placeholder)/i.test(source)) {
    issues.push({
      file: projectPath,
      message: "generated files must be complete and cannot contain placeholders",
      rule: "no-placeholder",
    });
  }

  if (projectPath.endsWith("/client.tsx") && !hasUseClientDirective(sourceFile)) {
    issues.push({
      file: projectPath,
      message: "client.tsx must start with the \"use client\" directive",
      rule: "use-client",
    });
  }

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier;
      if (ts.isStringLiteral(moduleSpecifier) && DISALLOWED_IMPORTS.has(moduleSpecifier.text)) {
        issues.push({
          file: projectPath,
          message: `disallowed import: ${moduleSpecifier.text}`,
          rule: "disallowed-import",
        });
      }
    }

    if (ts.isNewExpression(node)) {
      const expressionText = node.expression.getText(sourceFile);
      if (expressionText === "Function") {
        issues.push({
          file: projectPath,
          message: "new Function is not allowed in generated tools",
          rule: "no-dynamic-code",
        });
      }
      if (DISALLOWED_NETWORK_GLOBALS.has(expressionText)) {
        issues.push({
          file: projectPath,
          message: `${expressionText} is not allowed in generated tools`,
          rule: "no-exfiltration-channel",
        });
      }
      if (
        isTopLevel(node) &&
        (expressionText === "AudioContext" ||
          expressionText === "OfflineAudioContext" ||
          expressionText.startsWith("Tone."))
      ) {
        issues.push({
          file: projectPath,
          message: `${expressionText} must be constructed inside a function, effect, handler, or renderOffline`,
          rule: "no-module-level-audio",
        });
      }
    }

    if (ts.isCallExpression(node)) {
      const expressionText = node.expression.getText(sourceFile);
      if (expressionText === "eval") {
        issues.push({
          file: projectPath,
          message: "eval is not allowed in generated tools",
          rule: "no-dynamic-code",
        });
      }
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        !ts.isStringLiteral(node.arguments[0])
      ) {
        issues.push({
          file: projectPath,
          message: "dynamic import paths must be literal strings",
          rule: "literal-dynamic-import",
        });
      }
      if (
        isTopLevel(node) &&
        expressionText === "fetch" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0]) &&
        /^https?:\/\//i.test(node.arguments[0].text)
      ) {
        issues.push({
          file: projectPath,
          message: "top-level external fetch is not allowed in generated tools",
          rule: "no-top-level-external-fetch",
        });
      }
    }

    if (ts.isIdentifier(node) && DISALLOWED_STORAGE_GLOBALS.has(node.text)) {
      issues.push({
        file: projectPath,
        message: `${node.text} is not allowed in generated tools`,
        rule: "no-browser-storage",
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return issues;
}

function createToolSourceFile(projectPath: string, source: string) {
  return ts.createSourceFile(
    projectPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    projectPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function getParseDiagnostics(sourceFile: ts.SourceFile): readonly ts.Diagnostic[] {
  return (sourceFile as SourceFileWithParseDiagnostics).parseDiagnostics ?? [];
}

function syntaxDiagnosticToIssue(
  projectPath: string,
  sourceFile: ts.SourceFile,
  diagnostic: ts.Diagnostic,
): StaticIssue {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (typeof diagnostic.start !== "number") {
    return {
      file: projectPath,
      message,
      rule: "syntax",
    };
  }

  const location = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
  return {
    file: projectPath,
    message: `${location.line + 1}:${location.character + 1}: ${message}`,
    rule: "syntax",
  };
}

function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  const firstStatement = sourceFile.statements[0];
  return (
    Boolean(firstStatement) &&
    ts.isExpressionStatement(firstStatement) &&
    ts.isStringLiteral(firstStatement.expression) &&
    firstStatement.expression.text === "use client"
  );
}

function isTopLevel(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (isFunctionLike(current) || ts.isClassDeclaration(current)) {
      return false;
    }
    if (ts.isSourceFile(current)) {
      return true;
    }
    current = current.parent;
  }
  return true;
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isArrowFunction(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function readToolSourceFiles(rootDir: string, toolRoot: string): Array<[string, string]> {
  return readAllToolFiles(rootDir, toolRoot).filter(([projectPath]) =>
    /\.(tsx?|mts)$/.test(projectPath),
  );
}

function readAllToolFiles(rootDir: string, directory: string): Array<[string, string]> {
  if (!existsSync(/* turbopackIgnore: true */ directory)) {
    return [];
  }

  const entries = readdirSync(/* turbopackIgnore: true */ directory);
  const files: Array<[string, string]> = [];

  for (const entry of entries) {
    const absolutePath = join(/* turbopackIgnore: true */ directory, entry);
    const stats = statSync(/* turbopackIgnore: true */ absolutePath);
    if (stats.isDirectory()) {
      files.push(...readAllToolFiles(rootDir, absolutePath));
      continue;
    }

    const projectPath = absolutePath.slice(rootDir.length + 1).replaceAll("\\", "/");
    files.push([
      projectPath,
      readFileSync(/* turbopackIgnore: true */ absolutePath, "utf8"),
    ]);
  }

  return files;
}
