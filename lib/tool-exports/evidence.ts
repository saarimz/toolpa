import {
  analyzeAudioBuffer,
  type AudioBufferLike,
} from "@/lib/audio/offline-analysis";
import { parseMidiFileSummary } from "@/lib/midi/parse";
import type { ExportEvidence } from "@/lib/tool-exports/artifact";

export function createAudioExportEvidence(
  buffer: AudioBufferLike,
  options: Parameters<typeof analyzeAudioBuffer>[1] = {},
): ExportEvidence {
  const analysis = analyzeAudioBuffer(buffer, options);
  return {
    clippedRatio: analysis.clippedRatio,
    durationSec: buffer.duration,
    ok: analysis.ok,
    peak: analysis.peak,
    reasons: analysis.reasons,
    rms: analysis.rms,
  };
}

export function createMidiExportEvidence(bytes: Uint8Array): ExportEvidence {
  const summary = parseMidiFileSummary(bytes);
  return {
    noteCount: summary.noteOnCount,
    ok: summary.valid,
    reasons: summary.reasons,
    trackCount: summary.trackCount,
  };
}

