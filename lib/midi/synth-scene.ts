import {
  collectSynthEvents,
} from "@/app/tools/evolving-fm-synth/lib/events";
import type {
  SynthScene,
  SynthStep,
  SynthVoice,
} from "@/app/tools/evolving-fm-synth/lib/schema";
import {
  downloadMidiBytes,
  encodeMidiFile,
  sanitizeMidiFilename,
  type MidiExportInput,
  type MidiNoteEvent,
  type MidiTrackInput,
} from "@/lib/midi/export";

const SYNTH_MIDI_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

export function createSynthSceneMidiExport(scene: SynthScene): MidiExportInput {
  const tracks = collectSynthSceneMidiTracks(scene);
  const notes = tracks.flatMap((track) => track.notes);
  return {
    bpm: scene.bpm,
    format: scene.voices.length > 1 ? 1 : 0,
    name: scene.name,
    notes,
    textEvents: [
      `SynthScene ${scene.id}`,
      `${scene.key} ${scene.scale}, ${scene.bars} bars, ${scene.stepsPerBar} steps/bar`,
    ],
    tracks,
  };
}

export function encodeSynthSceneToMidi(scene: SynthScene): Uint8Array {
  return encodeMidiFile(createSynthSceneMidiExport(scene));
}

export function downloadSynthSceneMidi(
  scene: SynthScene,
  filename = getSynthSceneMidiFilename(scene),
) {
  downloadMidiBytes(encodeSynthSceneToMidi(scene), filename);
}

export function getSynthSceneMidiFilename(scene: Pick<SynthScene, "name" | "id">) {
  return sanitizeMidiFilename(scene.name || scene.id || "synth-scene");
}

export function collectSynthSceneMidiNotes(scene: SynthScene): MidiNoteEvent[] {
  return collectSynthSceneMidiTracks(scene)
    .flatMap((track) => track.notes)
    .sort(
      (left, right) =>
        left.startBeat - right.startBeat ||
        (left.channel ?? 0) - (right.channel ?? 0) ||
        left.midi - right.midi,
    );
}

export function collectSynthSceneMidiTracks(scene: SynthScene): MidiTrackInput[] {
  const beatDurationSec = 60 / scene.bpm;
  const tracks = scene.voices.map((voice) => ({
    name: voice.label,
    notes: [] as MidiNoteEvent[],
    textEvents: [`${voice.role} voice ${voice.id}`],
  }));
  const voiceState = new Map(
    scene.voices.map((voice, index) => [
      voice.id,
      {
        channel: SYNTH_MIDI_CHANNELS[index % SYNTH_MIDI_CHANNELS.length],
        track: tracks[index]!,
        voice,
      },
    ]),
  );

  for (const event of collectSynthEvents(scene, { random: () => 0 })) {
    const state = voiceState.get(event.voiceId);
    if (!state) {
      continue;
    }

    const step = findStep(state.voice, event.stepIndex);

    state.track.notes.push({
      channel: state.channel,
      durationBeats: event.durationSec / beatDurationSec,
      midi: event.midi,
      pitchBendCents: step?.tuningCents ?? 0,
      startBeat: event.timeSec / beatDurationSec,
      velocity: event.velocity,
    });
  }

  for (const track of tracks) {
    track.notes.sort((left, right) => left.startBeat - right.startBeat || left.midi - right.midi);
  }

  return tracks;
}

function findStep(voice: SynthVoice, stepIndex: number): SynthStep | null {
  return voice.steps.find((step) => step.step === stepIndex) ?? null;
}
