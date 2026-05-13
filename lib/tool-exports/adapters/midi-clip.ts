import {
  MidiClipSchemaVersion,
  type MidiClip,
} from "@/app/tools/midi-generator/lib/schema";
import {
  createMidiClipExportInput,
  encodeMidiClipToMidi,
  getMidiClipFilename,
} from "@/app/tools/midi-generator/lib/export";
import type { ExportArtifact } from "@/lib/tool-exports/artifact";
import { createMidiExportArtifact } from "@/lib/tool-exports/midi";

export function exportMidiClipMidiArtifact({
  clip,
  filename = getMidiClipFilename(clip),
  toolSlug,
}: {
  clip: MidiClip;
  filename?: string;
  toolSlug: string;
}): ExportArtifact {
  return createMidiExportArtifact({
    bytes: encodeMidiClipToMidi(clip),
    filename,
    input: createMidiClipExportInput(clip),
    source: {
      document: clip,
      documentId: clip.id,
      documentKind: "midi-clip",
      schemaVersion: MidiClipSchemaVersion,
      toolSlug,
    },
  });
}

