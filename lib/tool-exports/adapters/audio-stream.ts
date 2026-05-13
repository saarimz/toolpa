import type { ExportArtifact } from "@/lib/tool-exports/artifact";

export function unsupportedAudioStreamOfflineExport(): ExportArtifact {
  throw new Error(
    "Audio-stream tools must use source-audio, live-recording, or a custom offline renderer.",
  );
}

