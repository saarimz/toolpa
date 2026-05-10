import { join } from "node:path";

export class SandboxBreach extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxBreach";
  }
}

export function assertWithinTool(slug: string, projectPath: string): string {
  const normalizedPath = normalizeProjectPath(projectPath);
  const expectedPrefix = `app/tools/${slug}/`;

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new SandboxBreach(`invalid generated tool slug: ${slug}`);
  }

  if (projectPath.startsWith("/") || /^[a-zA-Z]:/.test(projectPath)) {
    throw new SandboxBreach(`absolute paths are not allowed: ${projectPath}`);
  }

  if (normalizedPath.split("/").includes("..")) {
    throw new SandboxBreach(`path traversal is not allowed: ${projectPath}`);
  }

  if (!normalizedPath.startsWith(expectedPrefix)) {
    throw new SandboxBreach(
      `writes restricted to ${expectedPrefix}; got ${normalizedPath}`,
    );
  }

  if (normalizedPath === expectedPrefix) {
    throw new SandboxBreach(`file path required inside ${expectedPrefix}`);
  }

  return normalizedPath;
}

export function resolveToolFilePath({
  rootDir,
  slug,
  projectPath,
}: {
  rootDir: string;
  slug: string;
  projectPath: string;
}): { projectPath: string; absolutePath: string } {
  const safeProjectPath = assertWithinTool(slug, projectPath);
  return {
    projectPath: safeProjectPath,
    absolutePath: join(/* turbopackIgnore: true */ rootDir, safeProjectPath),
  };
}

export function normalizeProjectPath(projectPath: string): string {
  return projectPath.replaceAll("\\", "/").replace(/^\.\//, "");
}
