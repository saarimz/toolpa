import {
  encodeAudioBufferToWav,
  normalizeAudioBufferPeak,
} from "@/lib/audio/wav-render";
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
  const normalizedBuffer = normalizeAudioBufferPeak(audioBuffer);

  return {
    bytes: bytesFromArrayBuffer(encodeAudioBufferToWav(normalizedBuffer)),
    evidence: createAudioExportEvidence(normalizedBuffer),
    filename,
    kind: "audio/wav",
    source: createArtifactSource(source),
  };
}
