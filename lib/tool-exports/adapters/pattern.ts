import {
  renderPatternToAudioBuffer,
  type RenderPatternWavOptions,
} from "@/lib/audio/wav-render";
import { PatternSchemaVersion, type Pattern } from "@/lib/pattern/schema";
import { createWavExportArtifact } from "@/lib/tool-exports/audio";
import type { ExportArtifact } from "@/lib/tool-exports/artifact";

export async function exportPatternWavArtifact({
  filename,
  options,
  pattern,
  toolSlug,
}: {
  filename: string;
  options?: RenderPatternWavOptions;
  pattern: Pattern;
  toolSlug: string;
}): Promise<ExportArtifact> {
  const audioBuffer = await renderPatternToAudioBuffer(pattern, options);
  return createWavExportArtifact({
    audioBuffer,
    filename,
    source: {
      document: pattern,
      documentId: pattern.id,
      documentKind: "pattern",
      schemaVersion: PatternSchemaVersion,
      toolSlug,
    },
  });
}
