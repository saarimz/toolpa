import {
  sanitizeMidiFilename,
  type MidiExportInput,
} from "@/lib/midi/export";
import {
  copyBytes,
  createArtifactSource,
  type ArtifactSourceInput,
  type ExportArtifact,
} from "@/lib/tool-exports/artifact";
import { createMidiExportEvidence } from "@/lib/tool-exports/evidence";

export function createMidiExportArtifact({
  bytes,
  filename,
  source,
}: {
  bytes: Uint8Array;
  filename: string;
  input?: MidiExportInput;
  source: ArtifactSourceInput;
}): ExportArtifact {
  return {
    bytes: copyBytes(bytes),
    evidence: createMidiExportEvidence(bytes),
    filename: sanitizeMidiFilename(filename),
    kind: "audio/midi",
    source: createArtifactSource(source),
  };
}
