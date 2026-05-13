import { z } from "zod";

export const ExportArtifactKindSchema = z.enum(["audio/wav", "audio/midi"]);

export const ExportEvidenceSchema = z.object({
  durationSec: z.number().nonnegative().optional(),
  noteCount: z.number().int().min(0).optional(),
  trackCount: z.number().int().min(0).optional(),
  peak: z.number().nonnegative().optional(),
  rms: z.number().nonnegative().optional(),
  clippedRatio: z.number().nonnegative().optional(),
  ok: z.boolean(),
  reasons: z.array(z.string()),
});

export const ExportArtifactSchema = z.object({
  kind: ExportArtifactKindSchema,
  bytes: z.instanceof(Uint8Array),
  filename: z.string().min(1),
  source: z.object({
    toolSlug: z.string().min(1),
    documentKind: z.string().min(1),
    documentId: z.string().min(1),
    documentHash: z.string().min(1),
    schemaVersion: z.number().int().min(0),
  }),
  evidence: ExportEvidenceSchema,
});

export type ExportArtifactKind = z.infer<typeof ExportArtifactKindSchema>;
export type ExportEvidence = z.infer<typeof ExportEvidenceSchema>;
export type ExportArtifact = z.infer<typeof ExportArtifactSchema>;

export type ArtifactSourceInput = {
  document: unknown;
  documentId: string;
  documentKind: string;
  schemaVersion: number;
  toolSlug: string;
};

export function createArtifactSource({
  document,
  documentId,
  documentKind,
  schemaVersion,
  toolSlug,
}: ArtifactSourceInput): ExportArtifact["source"] {
  return {
    documentHash: hashDocument(document),
    documentId,
    documentKind,
    schemaVersion,
    toolSlug,
  };
}

export function bytesFromArrayBuffer(buffer: ArrayBuffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buffer.slice(0));
}

export function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function createDownloadBlob(artifact: ExportArtifact): Blob {
  return new Blob([copyBytes(artifact.bytes)], { type: artifact.kind });
}

export function downloadArtifact(artifact: ExportArtifact): void {
  const href = URL.createObjectURL(createDownloadBlob(artifact));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = artifact.filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export function hashDocument(document: unknown): string {
  const json = stableStringify(document);
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}
