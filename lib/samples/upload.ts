import {
  createUploadedSampleId,
  saveUploadedSample,
  type UploadedSampleRecord,
} from "@/lib/samples/storage";

const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/aiff",
  "audio/flac",
  "audio/ogg",
  "audio/mp4",
]);

export function validateAudioFile(file: File): void {
  const hasAudioType = file.type === "" || ACCEPTED_AUDIO_TYPES.has(file.type);
  const hasKnownExtension = /\.(wav|mp3|aif|aiff|flac|ogg|m4a)$/i.test(file.name);

  if (!hasAudioType && !hasKnownExtension) {
    throw new Error("Unsupported audio file type");
  }
}

export async function persistUploadedSample(
  file: File,
  durationSec?: number,
): Promise<UploadedSampleRecord> {
  validateAudioFile(file);
  const record: UploadedSampleRecord = {
    id: createUploadedSampleId(file),
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    arrayBuffer: await file.arrayBuffer(),
    durationSec,
    createdAt: Date.now(),
  };

  return saveUploadedSample(record);
}
