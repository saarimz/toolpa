import type { MidiPlaybackData } from "@/components/midi-playback-panel";
import {
  downloadMidiBytes,
  encodeMidiFile,
  sanitizeMidiFilename,
  type MidiExportInput,
} from "@/lib/midi/export";

import {
  getMidiClipTotalBeats,
  type MidiClip,
} from "./schema";

export function createMidiClipExportInput(clip: MidiClip): MidiExportInput {
  const activeTracks = clip.tracks.filter((track) => !track.mute);
  const activeTrackIds = new Set(activeTracks.map((track) => track.id));
  const notes = clip.notes
    .filter((note) => activeTrackIds.has(note.trackId))
    .map((note) => ({
      cc: note.cc,
      channel: normalizeExportChannel(
        note.channel,
        clip.tracks.find((track) => track.id === note.trackId)?.role,
      ),
      durationBeats: note.durationBeats,
      midi: note.midi,
      pitchBendCents: note.pitchBendCents,
      startBeat: note.startBeat,
      velocity: note.velocity,
    }));

  return {
    bpm: clip.bpm,
    format: activeTracks.length > 1 ? 1 : 0,
    name: clip.name,
    notes,
    textEvents: [
      `MidiClip ${clip.id}`,
      `${clip.key} ${clip.scaleId}, ${clip.bars} bars, ${clip.beatsPerBar}/4, ${clip.metadata.generationMode}, ${clip.metadata.styleProfile}, ${clip.notes.length} notes`,
      clip.metadata.rationale,
    ],
    tracks: activeTracks.map((track) => ({
      name: track.name,
      notes: clip.notes
        .filter((note) => note.trackId === track.id)
        .map((note) => ({
          cc: note.cc,
          channel: normalizeExportChannel(note.channel, track.role),
          durationBeats: note.durationBeats,
          midi: note.midi,
          pitchBendCents: note.pitchBendCents,
          startBeat: note.startBeat,
          velocity: note.velocity,
        })),
      textEvents: [`${track.role} track ${track.id}`],
    })),
  };
}

export function encodeMidiClipToMidi(clip: MidiClip): Uint8Array {
  return encodeMidiFile(createMidiClipExportInput(clip));
}

export function downloadMidiClip(
  clip: MidiClip,
  filename = getMidiClipFilename(clip),
) {
  downloadMidiBytes(encodeMidiClipToMidi(clip), filename);
}

export function getMidiClipFilename(clip: Pick<MidiClip, "id" | "name">) {
  return sanitizeMidiFilename(clip.name || clip.id || "midi-clip");
}

export function createMidiClipPlayback(clip: MidiClip): MidiPlaybackData {
  const trackById = new Map(clip.tracks.map((track) => [track.id, track]));

  return {
    bpm: clip.bpm,
    notes: clip.notes
      .filter((note) => !trackById.get(note.trackId)?.mute)
      .map((note) => {
        const track = trackById.get(note.trackId);
        return {
          channel: note.channel,
          durationBeats: note.durationBeats,
          id: note.id,
          laneLabel: track?.name ?? note.trackId,
          midi: note.midi,
          pitchBendCents: note.pitchBendCents,
          sourceLabel: track?.name ?? note.trackId,
          startBeat: note.startBeat,
          velocity: note.velocity,
        };
      }),
    title: "MIDI clip",
    totalBeats: getMidiClipTotalBeats(clip),
  };
}

function normalizeExportChannel(channel: number, role?: string) {
  if (role === "drum") {
    return 9;
  }
  return channel === 9 ? 10 : channel;
}
