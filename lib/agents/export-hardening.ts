import type { AgentManifest } from "@/lib/agents/contract";

export type ExportHardeningIssue = {
  detail: string;
  id: string;
  severity: "warning" | "error";
  slug: string;
};

export function createExportHardeningIssues(
  manifest: AgentManifest,
): ExportHardeningIssue[] {
  if (manifest.level !== 1) {
    return [];
  }

  const issues: ExportHardeningIssue[] = [];
  const declaration = manifest.exports;

  if (manifest.outputs.audio && !declaration?.audio) {
    issues.push(issue(manifest, "export-audio-contract", "error", "L1 tools that declare audio output must declare an audio export strategy."));
  }
  if (manifest.outputs.midi && !declaration?.midi) {
    issues.push(issue(manifest, "export-midi-contract", "error", "L1 tools that declare MIDI output must declare a Standard MIDI export strategy."));
  }
  if (declaration && declaration.document !== manifest.instrument.document) {
    issues.push(
      issue(
        manifest,
        "export-document-contract",
        "error",
        `Export document ${declaration.document} must match instrument document ${manifest.instrument.document}.`,
      ),
    );
  }
  if (
    manifest.capabilities.includes("continuousSynth") &&
    declaration?.midi
  ) {
    issues.push(
      issue(
        manifest,
        "export-continuous-midi",
        "error",
        "Continuous synths must not claim MIDI export unless they serialize a discrete note timeline.",
      ),
    );
  }
  if (declaration?.midi && declaration.midi.strategy !== "standard-midi-file") {
    issues.push(issue(manifest, "export-midi-strategy", "error", "MIDI exports must use Standard MIDI Files."));
  }
  if (
    manifest.instrument.document === "midi-clip" &&
    declaration?.midi &&
    declaration.midi.format !== "smf-1"
  ) {
    issues.push(issue(manifest, "export-midi-clip-format", "error", "MidiClip exports must default to SMF format 1 so tracks survive host import."));
  }
  if (
    manifest.instrument.document === "audio-stream" &&
    declaration?.audio?.strategy === "offline-render" &&
    !manifest.origin
  ) {
    issues.push(issue(manifest, "export-audio-stream-renderer", "warning", "Audio-stream offline export requires a custom renderer."));
  }

  return issues;
}

function issue(
  manifest: AgentManifest,
  id: string,
  severity: "warning" | "error",
  detail: string,
): ExportHardeningIssue {
  return {
    detail,
    id: `${manifest.slug}:${id}`,
    severity,
    slug: manifest.slug,
  };
}
