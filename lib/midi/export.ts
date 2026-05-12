export type MidiNoteEvent = {
  midi: number;
  startBeat: number;
  durationBeats: number;
  velocity?: number;
  channel?: number;
  pitchBendCents?: number;
  pitchBendRangeCents?: number;
};

export type MidiExportInput = {
  name?: string;
  bpm?: number;
  ticksPerQuarter?: number;
  notes: MidiNoteEvent[];
  textEvents?: string[];
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
  const bpm = clampNumber(input.bpm ?? DEFAULT_BPM, 20, 320);
  const timedEvents: TimedMidiEvent[] = [
    { tick: 0, order: 0, bytes: encodeTrackName(input.name ?? "ai-daw-tools") },
    { tick: 0, order: 1, bytes: encodeTempoEvent(bpm) },
    { tick: 0, order: 2, bytes: encodeTimeSignatureEvent() },
    ...encodeTextEvents(input.textEvents ?? []),
    ...encodeNoteEvents(input.notes, ticksPerQuarter),
  ].sort((left, right) => left.tick - right.tick || left.order - right.order);

  const trackBytes = encodeTrack(timedEvents);

  return new Uint8Array([
    ...asciiBytes("MThd"),
    ...uint32Bytes(6),
    ...uint16Bytes(0),
    ...uint16Bytes(1),
    ...uint16Bytes(ticksPerQuarter),
    ...asciiBytes("MTrk"),
    ...uint32Bytes(trackBytes.length),
    ...trackBytes,
  ]);
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

function encodeNoteEvents(
  notes: MidiNoteEvent[],
  ticksPerQuarter: number,
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
    const orderBase = 20 + index * 4;
    const events: TimedMidiEvent[] = [];

    if (Math.abs(pitchBendCents) >= 0.01) {
      events.push({
        tick: startTick,
        order: orderBase,
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
        order: orderBase + 1,
        bytes: [0x90 | channel, midi, velocity],
      },
      {
        tick: endTick,
        order: orderBase + 2,
        bytes: [0x80 | channel, midi, 0],
      },
    );

    if (Math.abs(pitchBendCents) >= 0.01) {
      events.push({
        tick: endTick,
        order: orderBase + 3,
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

function encodeTextEvents(textEvents: string[]): TimedMidiEvent[] {
  return textEvents.map((text, index) => ({
    tick: 0,
    order: 3 + index,
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
