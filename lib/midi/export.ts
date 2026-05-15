export type MidiCcEvent = {
  beatOffset?: number;
  controller: number;
  value: number;
};

export type MidiNoteEvent = {
  midi: number;
  startBeat: number;
  durationBeats: number;
  velocity?: number;
  channel?: number;
  pitchBendCents?: number;
  pitchBendRangeCents?: number;
  cc?: MidiCcEvent[];
};

export type MidiTrackInput = {
  name?: string;
  notes: MidiNoteEvent[];
  textEvents?: string[];
};

export type MidiExportInput = {
  format?: 0 | 1;
  name?: string;
  bpm?: number;
  ticksPerQuarter?: number;
  notes?: MidiNoteEvent[];
  textEvents?: string[];
  tracks?: MidiTrackInput[];
};

type TimedMidiEvent = {
  tick: number;
  order: number;
  bytes: number[];
};

const DEFAULT_TICKS_PER_QUARTER = 480;
const DEFAULT_BPM = 120;
const MIDI_MIME_TYPE = "audio/midi";

export function encodeMidiFile(input: MidiExportInput): Uint8Array {
  const ticksPerQuarter = clampInt(
    input.ticksPerQuarter ?? DEFAULT_TICKS_PER_QUARTER,
    24,
    9600,
  );
  const format = input.format ?? (input.tracks && input.tracks.length > 1 ? 1 : 0);
  const tracks =
    input.tracks && input.tracks.length > 0
      ? input.tracks
      : [{ name: input.name, notes: input.notes ?? [] }];

  if (format === 1) {
    return encodeFormatOneMidiFile(input, tracks, ticksPerQuarter);
  }

  return encodeFormatZeroMidiFile(input, tracks, ticksPerQuarter);
}

export function createMidiBlob(bytes: Uint8Array): Blob {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: MIDI_MIME_TYPE });
}

export function downloadMidiBytes(bytes: Uint8Array, filename: string) {
  const href = URL.createObjectURL(createMidiBlob(bytes));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = sanitizeMidiFilename(filename);
  anchor.click();
  URL.revokeObjectURL(href);
}

export function sanitizeMidiFilename(filename: string) {
  const sanitized =
    filename
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export";

  return /\.(mid|midi)$/i.test(sanitized) ? sanitized : `${sanitized}.mid`;
}

function encodeFormatZeroMidiFile(
  input: MidiExportInput,
  tracks: MidiTrackInput[],
  ticksPerQuarter: number,
) {
  const timedEvents: TimedMidiEvent[] = [
    ...createConductorEvents(input),
    ...tracks.flatMap((track, trackIndex) => [
      ...(track.name ? [{ tick: 0, order: 10 + trackIndex, bytes: encodeTrackName(track.name) }] : []),
      ...encodeTextEvents(track.textEvents ?? [], 20 + trackIndex * 10),
      ...encodeNoteEvents(track.notes, ticksPerQuarter, 1000 + trackIndex * 10000),
    ]),
  ].sort(sortTimedEvents);

  const trackBytes = encodeTrack(timedEvents);
  return encodeMidiContainer({
    format: 0,
    ticksPerQuarter,
    tracks: [trackBytes],
  });
}

function encodeFormatOneMidiFile(
  input: MidiExportInput,
  tracks: MidiTrackInput[],
  ticksPerQuarter: number,
) {
  const conductorTrack = encodeTrack(createConductorEvents(input).sort(sortTimedEvents));
  const noteTracks = tracks.map((track, trackIndex) =>
    encodeTrack(
      [
        { tick: 0, order: 0, bytes: encodeTrackName(track.name ?? `track-${trackIndex + 1}`) },
        ...encodeTextEvents(track.textEvents ?? [], 10),
        ...encodeNoteEvents(track.notes, ticksPerQuarter, 100),
      ].sort(sortTimedEvents),
    ),
  );

  return encodeMidiContainer({
    format: 1,
    ticksPerQuarter,
    tracks: [conductorTrack, ...noteTracks],
  });
}

function createConductorEvents(input: MidiExportInput): TimedMidiEvent[] {
  const bpm = clampNumber(input.bpm ?? DEFAULT_BPM, 20, 320);
  return [
    { tick: 0, order: 0, bytes: encodeTrackName(input.name ?? "toolpa") },
    { tick: 0, order: 1, bytes: encodeTempoEvent(bpm) },
    { tick: 0, order: 2, bytes: encodeTimeSignatureEvent() },
    ...encodeTextEvents(input.textEvents ?? [], 3),
  ];
}

function encodeMidiContainer({
  format,
  ticksPerQuarter,
  tracks,
}: {
  format: 0 | 1;
  ticksPerQuarter: number;
  tracks: number[][];
}) {
  return new Uint8Array([
    ...asciiBytes("MThd"),
    ...uint32Bytes(6),
    ...uint16Bytes(format),
    ...uint16Bytes(tracks.length),
    ...uint16Bytes(ticksPerQuarter),
    ...tracks.flatMap((trackBytes) => [
      ...asciiBytes("MTrk"),
      ...uint32Bytes(trackBytes.length),
      ...trackBytes,
    ]),
  ]);
}

function encodeNoteEvents(
  notes: MidiNoteEvent[],
  ticksPerQuarter: number,
  orderBase = 20,
): TimedMidiEvent[] {
  return notes.flatMap((note, index) => {
    const midi = clampInt(note.midi, 0, 127);
    const channel = clampInt(note.channel ?? 0, 0, 15);
    const startTick = Math.max(0, Math.round(note.startBeat * ticksPerQuarter));
    const durationTicks = Math.max(
      1,
      Math.round(note.durationBeats * ticksPerQuarter),
    );
    const endTick = startTick + durationTicks;
    const velocity = clampInt(Math.round((note.velocity ?? 0.8) * 127), 1, 127);
    const pitchBendCents = note.pitchBendCents ?? 0;
    const order = orderBase + index * 10;
    const events: TimedMidiEvent[] = [];

    for (const [ccIndex, cc] of (note.cc ?? []).entries()) {
      events.push({
        tick: startTick + Math.max(0, Math.round((cc.beatOffset ?? 0) * ticksPerQuarter)),
        order: order + ccIndex,
        bytes: [
          0xb0 | channel,
          clampInt(cc.controller, 0, 127),
          clampInt(cc.value, 0, 127),
        ],
      });
    }

    if (Math.abs(pitchBendCents) >= 0.01) {
      events.push({
        tick: startTick,
        order: order + 3,
        bytes: encodePitchBendEvent(
          channel,
          pitchBendCents,
          note.pitchBendRangeCents ?? 200,
        ),
      });
    }

    events.push(
      {
        tick: startTick,
        order: order + 4,
        bytes: [0x90 | channel, midi, velocity],
      },
      {
        tick: endTick,
        order: order + 5,
        bytes: [0x80 | channel, midi, 0],
      },
    );

    if (Math.abs(pitchBendCents) >= 0.01) {
      events.push({
        tick: endTick,
        order: order + 6,
        bytes: encodePitchBendEvent(channel, 0, note.pitchBendRangeCents ?? 200),
      });
    }

    return events;
  });
}

function encodeTrack(events: TimedMidiEvent[]) {
  const track: number[] = [];
  let lastTick = 0;

  for (const event of events) {
    track.push(...variableLengthQuantity(event.tick - lastTick), ...event.bytes);
    lastTick = event.tick;
  }

  track.push(...variableLengthQuantity(0), 0xff, 0x2f, 0x00);
  return track;
}

function encodeTrackName(name: string) {
  return encodeMetaTextEvent(0x03, name);
}

function encodeTextEvents(textEvents: string[], orderStart: number): TimedMidiEvent[] {
  return textEvents.map((text, index) => ({
    tick: 0,
    order: orderStart + index,
    bytes: encodeMetaTextEvent(0x01, text),
  }));
}

function encodeMetaTextEvent(type: number, text: string) {
  const textBytes = Array.from(new TextEncoder().encode(text));
  return [0xff, type, ...variableLengthQuantity(textBytes.length), ...textBytes];
}

function encodeTempoEvent(bpm: number) {
  const microsecondsPerQuarter = clampInt(Math.round(60_000_000 / bpm), 1, 0xffffff);
  return [
    0xff,
    0x51,
    0x03,
    (microsecondsPerQuarter >> 16) & 0xff,
    (microsecondsPerQuarter >> 8) & 0xff,
    microsecondsPerQuarter & 0xff,
  ];
}

function encodeTimeSignatureEvent() {
  return [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08];
}

function encodePitchBendEvent(
  channel: number,
  cents: number,
  pitchBendRangeCents: number,
) {
  const range = Math.max(1, pitchBendRangeCents);
  const bend = clampNumber(cents / range, -1, 1);
  const value = clampInt(Math.round(8192 + bend * 8191), 0, 16383);
  return [0xe0 | channel, value & 0x7f, (value >> 7) & 0x7f];
}

function sortTimedEvents(left: TimedMidiEvent, right: TimedMidiEvent) {
  return left.tick - right.tick || left.order - right.order;
}

function asciiBytes(text: string) {
  return Array.from(text, (character) => character.charCodeAt(0) & 0xff);
}

function uint16Bytes(value: number) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint32Bytes(value: number) {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

function variableLengthQuantity(value: number) {
  const bytes = [value & 0x7f];
  let remaining = Math.max(0, Math.floor(value / 128));

  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }

  return bytes;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampInt(value: number, min: number, max: number) {
  return Math.round(clampNumber(value, min, max));
}

