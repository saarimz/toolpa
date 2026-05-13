"use client";

import { useEffect, useMemo, useState } from "react";

import type { SynthScene } from "@/app/tools/evolving-fm-synth/lib/schema";
import { collectSynthEvents } from "@/app/tools/evolving-fm-synth/lib/events";
import { collectPatternEvents } from "@/lib/audio/pattern";
import type { MidiNoteEvent } from "@/lib/midi/export";
import type { GlobalMusicContext } from "@/lib/music/context";
import type { Pattern } from "@/lib/pattern/schema";
import { cn } from "@/lib/utils";

export type MidiPlaybackNote = MidiNoteEvent & {
  id?: string;
  laneDetail?: string;
  laneLabel?: string;
  laneId?: string;
  laneMidi?: number;
  laneOrder?: number;
  sourceLabel?: string;
  probability?: number;
};

export type MidiPlaybackData = {
  bpm: number;
  notes: MidiPlaybackNote[];
  title?: string;
  totalBeats: number;
};

type MidiPlaybackPanelProps = MidiPlaybackData & {
  currentBeat?: number | null;
  isPlaying?: boolean;
  className?: string;
};

type MidiLane = {
  detail?: string;
  id: string;
  label: string;
  midi: number;
  order?: number;
};

const SYNTH_MIDI_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
const PATTERN_LANE_ROOT_MIDI = 36;
const MIN_TIMELINE_WIDTH_PX = 640;
const PX_PER_BEAT = 34;
const ROW_HEIGHT_PX = 24;
const NOTE_COLORS = [
  "bg-sky-300 text-sky-950",
  "bg-emerald-300 text-emerald-950",
  "bg-amber-200 text-amber-950",
  "bg-fuchsia-300 text-fuchsia-950",
  "bg-zinc-100 text-zinc-950",
] as const;

export function MidiPlaybackPanel({
  bpm,
  className,
  currentBeat,
  isPlaying = false,
  notes,
  title = "MIDI playback",
  totalBeats,
}: MidiPlaybackPanelProps) {
  const boundedTotalBeats = Math.max(1, totalBeats);
  const lanes = useMemo(() => createMidiLanes(notes), [notes]);
  const animatedBeat = usePlaybackBeat({
    bpm,
    enabled: isPlaying && currentBeat == null,
    totalBeats: boundedTotalBeats,
  });
  const playheadBeat =
    currentBeat == null ? animatedBeat : modulo(currentBeat, boundedTotalBeats);
  const timelineWidth = Math.max(
    MIN_TIMELINE_WIDTH_PX,
    Math.ceil(boundedTotalBeats * PX_PER_BEAT),
  );
  const rowHeight = Math.max(ROW_HEIGHT_PX * Math.max(lanes.length, 1), ROW_HEIGHT_PX);
  const beatCount = Math.ceil(boundedTotalBeats);
  const laneIndexById = new Map(lanes.map((lane, index) => [lane.id, index]));
  const noteCount = notes.length;
  const activeLaneCount = lanes.length;

  return (
    <section
      aria-label={title}
      className={cn("border-b border-zinc-800 bg-black/30 p-4", className)}
      role="region"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-zinc-100">{title}</span>
          <span className="text-zinc-600">{bpm} bpm</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span>{noteCount} notes</span>
          <span>{activeLaneCount} lanes</span>
          <span>{formatBeatCount(boundedTotalBeats)}</span>
        </div>
      </div>
      <div className="overflow-x-auto border border-zinc-800 bg-zinc-950">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "82px 1fr",
            minWidth: timelineWidth + 82,
          }}
        >
          <div className="border-b border-r border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-600">
            pitch
          </div>
          <div className="relative h-6 border-b border-zinc-800">
            {Array.from({ length: beatCount + 1 }, (_, beat) => (
              <div
                className="absolute top-0 h-full border-l border-zinc-900 px-1 text-[10px] text-zinc-700"
                key={beat}
                style={{ left: `${(beat / boundedTotalBeats) * 100}%` }}
              >
                {beat % 4 === 0 ? beat + 1 : ""}
              </div>
            ))}
          </div>
          <div
            className="border-r border-zinc-800"
            style={{ height: rowHeight }}
          >
            {lanes.length > 0 ? (
              lanes.map((lane) => (
                <div
                  className="flex h-6 items-center justify-between gap-2 border-b border-zinc-900 px-2 text-[10px]"
                  key={lane.id}
                >
                  <span className="truncate text-zinc-400">{lane.label}</span>
                  <span className="text-zinc-700">{lane.detail ?? noteName(lane.midi)}</span>
                </div>
              ))
            ) : (
              <div className="flex h-6 items-center px-2 text-[10px] text-zinc-700">
                empty
              </div>
            )}
          </div>
          <div className="relative" style={{ height: rowHeight }}>
            {lanes.map((lane, index) => (
              <div
                className="absolute left-0 right-0 border-b border-zinc-900"
                key={lane.id}
                style={{ top: index * ROW_HEIGHT_PX, height: ROW_HEIGHT_PX }}
              />
            ))}
            {Array.from({ length: beatCount + 1 }, (_, beat) => (
              <div
                className={cn(
                  "absolute top-0 h-full border-l",
                  beat % 4 === 0 ? "border-zinc-800" : "border-zinc-900",
                )}
                key={beat}
                style={{ left: `${(beat / boundedTotalBeats) * 100}%` }}
              />
            ))}
            {notes.map((note, index) => {
              const laneIndex = laneIndexById.get(laneId(note));
              if (laneIndex == null) {
                return null;
              }

              const startBeat = clampNumber(note.startBeat, 0, boundedTotalBeats);
              const endBeat = clampNumber(
                note.startBeat + Math.max(0.05, note.durationBeats),
                startBeat + 0.05,
                boundedTotalBeats,
              );
              const widthBeat = Math.max(0.05, endBeat - startBeat);

              return (
                <div
                  aria-label={`${note.sourceLabel ?? noteName(note.midi)} ${formatBeat(startBeat)}`}
                  className={cn(
                    "absolute overflow-hidden rounded-sm border border-black/40 px-1 text-[10px] leading-5 shadow-[0_0_10px_rgba(255,255,255,0.12)]",
                    NOTE_COLORS[(note.channel ?? index) % NOTE_COLORS.length],
                  )}
                  key={note.id ?? `${note.midi}-${note.startBeat}-${index}`}
                  style={{
                    left: `${(startBeat / boundedTotalBeats) * 100}%`,
                    opacity: 0.45 + clampNumber(note.velocity ?? 0.8, 0, 1) * 0.5,
                    top: laneIndex * ROW_HEIGHT_PX + 3,
                    width: `${(widthBeat / boundedTotalBeats) * 100}%`,
                  }}
                  title={[
                    note.sourceLabel ?? note.laneLabel ?? noteName(note.midi),
                    noteName(note.midi),
                    `beat ${formatBeat(startBeat)}`,
                  ].join(" / ")}
                >
                  <span className="block truncate">
                    {note.sourceLabel ?? noteName(note.midi)}
                  </span>
                </div>
              );
            })}
            {playheadBeat == null ? null : (
              <div
                aria-hidden="true"
                className="absolute top-0 h-full w-px bg-white shadow-[0_0_12px_rgba(255,255,255,0.85)]"
                style={{
                  left: `${(playheadBeat / boundedTotalBeats) * 100}%`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function createSynthSceneMidiPlayback(scene: SynthScene): MidiPlaybackData {
  const beatDurationSec = 60 / scene.bpm;
  const voiceState = new Map(
    scene.voices.map((voice, index) => [
      voice.id,
      {
        channel: SYNTH_MIDI_CHANNELS[index % SYNTH_MIDI_CHANNELS.length],
        order: index,
        voice,
      },
    ]),
  );

  return {
    bpm: scene.bpm,
    notes: collectSynthEvents(scene, { random: () => 0 }).map((event) => {
      const state = voiceState.get(event.voiceId);
      const voice = state?.voice;
      const step = voice?.steps.find((candidate) => candidate.step === event.stepIndex);

      return {
        channel: state?.channel ?? 0,
        durationBeats: event.durationSec / beatDurationSec,
        id: `synth-${event.voiceId}-${event.stepIndex}-${event.midi}`,
        laneDetail: voice?.role,
        laneId: `voice:${event.voiceId}`,
        laneLabel: event.voiceLabel,
        laneMidi: 127 - (state?.order ?? 0),
        laneOrder: state?.order ?? 0,
        midi: event.midi,
        pitchBendCents: step?.tuningCents ?? 0,
        sourceLabel: `${event.voiceLabel} ${noteName(event.midi)}`,
        startBeat: event.timeSec / beatDurationSec,
        velocity: event.velocity,
      };
    }),
    title: "MIDI playback",
    totalBeats: scene.bars * 4,
  };
}

export function createPatternMidiPlayback(
  pattern: Pattern,
  options: { musicalContext?: GlobalMusicContext } = {},
): MidiPlaybackData {
  const beatDurationSec = 60 / pattern.bpm;
  const trackLaneMidi = new Map(
    pattern.tracks.map((track, index) => [
      track.id,
      clampMidi(PATTERN_LANE_ROOT_MIDI + index),
    ]),
  );
  const trackChannel = new Map(
    pattern.tracks.map((track, index) => [track.id, index % 16]),
  );

  return {
    bpm: pattern.bpm,
    notes: collectPatternEvents(pattern, {
      musicalContext: options.musicalContext,
      random: () => Number.EPSILON,
    }).map((event, index) => {
      const baseMidi = trackLaneMidi.get(event.trackId) ?? PATTERN_LANE_ROOT_MIDI;
      const midi = clampMidi(baseMidi + Math.round(event.pitchSemitones));

      return {
        channel: trackChannel.get(event.trackId) ?? 0,
        durationBeats: event.durationSec / beatDurationSec,
        id: `${event.trackId}-${event.stepIndex}-${event.repeatIndex}-${index}`,
        laneLabel: event.trackName,
        midi,
        probability: event.probability,
        sourceLabel: event.trackName,
        startBeat: event.timeSec / beatDurationSec,
        velocity: event.velocity,
      };
    }),
    title: "MIDI playback",
    totalBeats: pattern.bars * 4,
  };
}

function usePlaybackBeat({
  bpm,
  enabled,
  totalBeats,
}: {
  bpm: number;
  enabled: boolean;
  totalBeats: number;
}) {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    function tick(now: number) {
      const elapsedSec = (now - startedAt) / 1000;
      setBeat(modulo((elapsedSec * bpm) / 60, totalBeats));
      frame = window.requestAnimationFrame(tick);
    }

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [bpm, enabled, totalBeats]);

  return enabled ? modulo(beat, totalBeats) : null;
}

function createMidiLanes(notes: MidiPlaybackNote[]): MidiLane[] {
  const lanes = new Map<string, MidiLane>();

  for (const note of notes) {
    const id = laneId(note);
    if (!lanes.has(id)) {
      lanes.set(id, {
        detail: note.laneDetail,
        id,
        label: note.laneLabel ?? noteName(note.midi),
        midi: clampMidi(note.laneMidi ?? note.midi),
        order: note.laneOrder,
      });
    }
  }

  return [...lanes.values()].sort(
    (left, right) =>
      compareLaneOrder(left, right) ||
      right.midi - left.midi ||
      left.label.localeCompare(right.label),
  );
}

function laneId(note: Pick<MidiPlaybackNote, "laneId" | "laneLabel" | "midi">) {
  return note.laneId ?? `${note.laneLabel ?? noteName(note.midi)}:${clampMidi(note.midi)}`;
}

function compareLaneOrder(left: MidiLane, right: MidiLane) {
  if (left.order == null && right.order == null) {
    return 0;
  }
  if (left.order == null) {
    return 1;
  }
  if (right.order == null) {
    return -1;
  }
  return left.order - right.order;
}

function noteName(midi: number) {
  const pitchNames = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const clamped = clampMidi(midi);
  const octave = Math.floor(clamped / 12) - 1;
  return `${pitchNames[clamped % 12]}${octave}`;
}

function formatBeat(beat: number) {
  return Number.isInteger(beat) ? String(beat + 1) : (beat + 1).toFixed(2);
}

function formatBeatCount(beats: number) {
  if (beats % 4 !== 0) {
    return `${beats} beats`;
  }

  const bars = beats / 4;
  return `${bars} ${bars === 1 ? "bar" : "bars"}`;
}

function clampMidi(midi: number) {
  return Math.round(clampNumber(midi, 0, 127));
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}
