import { encodeAudioBufferToWav } from "@/lib/audio/wav-render";
import {
  bytesFromArrayBuffer,
  createArtifactSource,
  type ExportArtifact,
  type ArtifactSourceInput,
} from "@/lib/tool-exports/artifact";
import { createAudioExportEvidence } from "@/lib/tool-exports/evidence";

export function createWavExportArtifact({
  audioBuffer,
  filename,
  source,
}: {
  audioBuffer: AudioBuffer;
  filename: string;
  source: ArtifactSourceInput;
}): ExportArtifact {
  return {
    bytes: bytesFromArrayBuffer(encodeAudioBufferToWav(audioBuffer)),
    evidence: createAudioExportEvidence(audioBuffer),
    filename,
    kind: "audio/wav",
    source: createArtifactSource(source),
  };
}

