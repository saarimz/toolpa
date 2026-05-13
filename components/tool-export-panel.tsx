"use client";

import { useState } from "react";
import { Copy, Download, FileMusic, Loader2 } from "lucide-react";

import { AudioOutputRecorder } from "@/components/audio-output-recorder";
import { Button } from "@/components/ui/button";
import type { AgentManifest } from "@/lib/agents/contract";
import {
  downloadArtifact,
  type ExportArtifact,
} from "@/lib/tool-exports/artifact";

type ToolExportPanelProps = {
  audioExport?: () => Promise<ExportArtifact>;
  className?: string;
  document: unknown;
  filenameStem: string;
  manifest: AgentManifest;
  midiExport?: () => ExportArtifact | Promise<ExportArtifact>;
};

type PendingExport = "audio" | "midi" | null;

export function ToolExportPanel({
  audioExport,
  className = "",
  document,
  filenameStem,
  manifest,
  midiExport,
}: ToolExportPanelProps) {
  const [pending, setPending] = useState<PendingExport>(null);
  const [lastArtifact, setLastArtifact] = useState<ExportArtifact | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioDeclaration = manifest.exports?.audio;
  const midiDeclaration = manifest.exports?.midi;
  const canRenderAudio = audioDeclaration?.strategy === "offline-render" && audioExport;
  const canRecordAudio = audioDeclaration?.strategy === "live-recording" || manifest.outputs.recording;
  const canExportMidi = Boolean(midiDeclaration && midiExport);

  async function runExport(kind: Exclude<PendingExport, null>) {
    const exporter = kind === "audio" ? audioExport : midiExport;
    if (!exporter) {
      return;
    }

    setError(null);
    setPending(kind);
    try {
      const artifact = await exporter();
      setLastArtifact(artifact);
      downloadArtifact(artifact);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Export failed");
    } finally {
      setPending(null);
    }
  }

  async function copyJson() {
    setError(null);
    try {
      await navigator.clipboard.writeText(JSON.stringify(document, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Copy failed");
    }
  }

  return (
    <section className={`flex flex-wrap items-center gap-2 ${className}`}>
      {canRenderAudio ? (
        <Button disabled={pending !== null} onClick={() => void runExport("audio")}>
          {pending === "audio" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {pending === "audio" ? "rendering wav" : "download wav"}
        </Button>
      ) : null}

      {canExportMidi ? (
        <Button disabled={pending !== null} onClick={() => void runExport("midi")}>
          {pending === "midi" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileMusic className="size-4" />
          )}
          {pending === "midi" ? "exporting midi" : "download midi"}
        </Button>
      ) : null}

      {canRecordAudio ? (
        <AudioOutputRecorder filename={filenameStem} sourceId={manifest.slug} />
      ) : null}

      <Button disabled={pending !== null} onClick={() => void copyJson()}>
        <Copy className="size-4" />
        {copied ? "copied" : "copy json"}
      </Button>

      {lastArtifact ? (
        <span className="text-xs text-zinc-500">
          {formatEvidence(lastArtifact)}
        </span>
      ) : null}
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </section>
  );
}

function formatEvidence(artifact: ExportArtifact) {
  if (artifact.kind === "audio/midi") {
    return `${artifact.evidence.noteCount ?? 0} notes / ${artifact.evidence.trackCount ?? 0} tracks`;
  }
  return `${artifact.evidence.durationSec?.toFixed(1) ?? "0.0"}s / peak ${
    artifact.evidence.peak?.toFixed(2) ?? "0.00"
  }`;
}

