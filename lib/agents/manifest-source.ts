import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Script } from "node:vm";
import ts from "typescript";

import {
  type AgentManifest,
  AgentManifestSchema,
} from "@/lib/agents/contract";

export function readInTreeAgentManifests(rootDir = process.cwd()): AgentManifest[] {
  const toolsRoot = join(/* turbopackIgnore: true */ rootDir, "app", "tools");
  if (!existsSync(/* turbopackIgnore: true */ toolsRoot)) {
    return [];
  }

  return readdirSync(/* turbopackIgnore: true */ toolsRoot, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .map((slug) => {
      const manifestPath = join(
        /* turbopackIgnore: true */
        toolsRoot,
        slug,
        "manifest.ts",
      );
      if (!existsSync(/* turbopackIgnore: true */ manifestPath)) {
        return null;
      }

      const source = readFileSync(/* turbopackIgnore: true */ manifestPath, "utf8");
      return extractAgentManifestFromSource(source, slug);
    })
    .filter((manifest): manifest is AgentManifest => manifest !== null);
}

export function extractAgentManifestFromSource(
  source: string,
  slug: string,
): AgentManifest {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: "manifest.ts",
    reportDiagnostics: true,
  });

  const diagnostic = transpiled.diagnostics?.find(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostic) {
    throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  }

  const cjsModule = { exports: {} as Record<string, unknown> };
  const context = {
    exports: cjsModule.exports,
    module: cjsModule,
    require: (specifier: string) => {
      throw new Error(`manifest runtime import is not allowed: ${specifier}`);
    },
  };

  new Script(transpiled.outputText, { filename: "manifest.js" }).runInNewContext(
    context,
  );

  for (const value of Object.values(cjsModule.exports)) {
    const parsed = AgentManifestSchema.safeParse(value);
    if (parsed.success && parsed.data.slug === slug) {
      return parsed.data;
    }
  }

  throw new Error(`manifest.ts must export an AgentManifest with slug "${slug}"`);
}
