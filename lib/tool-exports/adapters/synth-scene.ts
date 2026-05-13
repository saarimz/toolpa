import {
  SynthSceneSchemaVersion,
  type SynthScene,
} from "@/app/tools/evolving-fm-synth/lib/schema";
import { renderSynthSceneToAudioBuffer } from "@/lib/audio/synth-wav-render";
import type { FxPatternInput } from "@/lib/audio/fx-manifest";
import {
  createSynthSceneMidiExport,
  encodeSynthSceneToMidi,
  getSynthSceneMidiFilename,
} from "@/lib/midi/synth-scene";
import { createWavExportArtifact } from "@/lib/tool-exports/audio";
import type { ExportArtifact } from "@/lib/tool-exports/artifact";
import { createMidiExportArtifact } from "@/lib/tool-exports/midi";

export async function exportSynthSceneWavArtifact({
  filename,
  fxPattern,
  scene,
  toolSlug,
}: {
  filename: string;
  fxPattern?: FxPatternInput | null;
  scene: SynthScene;
  toolSlug: string;
}): Promise<ExportArtifact> {
  const audioBuffer = await renderSynthSceneToAudioBuffer(scene, { fxPattern });
  return createWavExportArtifact({
    audioBuffer,
    filename,
    source: {
      document: scene,
      documentId: scene.id,
      documentKind: "synth-scene",
      schemaVersion: SynthSceneSchemaVersion,
      toolSlug,
    },
  });
}

export function exportSynthSceneMidiArtifact({
  scene,
  filename = getSynthSceneMidiFilename(scene),
  toolSlug,
}: {
  filename?: string;
  scene: SynthScene;
  toolSlug: string;
}): ExportArtifact {
  return createMidiExportArtifact({
    bytes: encodeSynthSceneToMidi(scene),
    filename,
    input: createSynthSceneMidiExport(scene),
    source: {
      document: scene,
      documentId: scene.id,
      documentKind: "synth-scene",
      schemaVersion: SynthSceneSchemaVersion,
      toolSlug,
    },
  });
}
