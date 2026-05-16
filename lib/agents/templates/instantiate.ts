import {
  createToolSkeleton,
  type ToolSkeletonInput,
  type ToolSkeletonInstance,
} from "@/lib/agents/templates/tool-skeleton/files";
import { runGeneratedToolSourceSyntaxAudit } from "@/lib/agents/builder-verification";

export type InstantiateToolInput = ToolSkeletonInput;

export function instantiateToolSkeleton(
  input: InstantiateToolInput,
): ToolSkeletonInstance {
  const instance = createToolSkeleton(input);
  for (const [path, content] of instance.files) {
    if (!path.startsWith(`app/tools/${instance.manifest.slug}/`)) {
      throw new Error(`Template emitted path outside tool root: ${path}`);
    }

    if (/\{\{[a-zA-Z]/.test(content)) {
      throw new Error(`Template placeholder was not rendered in ${path}`);
    }

    if (/\.(tsx?|mts)$/.test(path)) {
      const syntaxAudit = runGeneratedToolSourceSyntaxAudit({
        projectPath: path,
        source: content,
      });
      if (!syntaxAudit.passed) {
        throw new Error(`Template emitted invalid TypeScript in ${path}:\n${syntaxAudit.stdout}`);
      }
    }
  }

  return instance;
}
