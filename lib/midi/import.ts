export type ParsedMidiNote = {
  channel: number;
  durationBeats: number;
  midi: number;
  startBeat: number;
  velocity: number;
};

export type ParsedMidiTrack = {
  name: string;
  notes: ParsedMidiNote[];
};

export type ParsedMidiFile = {
  bpm: number | null;
  format: number;
  ticksPerQuarter: number;
  tracks: ParsedMidiTrack[];
};

type ActiveNote = {
  channel: number;
  midi: number;
  startTick: number;
  velocity: number;
};

export function parseMidiFile(bytes: Uint8Array): ParsedMidiFile {
  if (readAscii(bytes, 0, 4) !== "MThd") {
    throw new Error("Not a Standard MIDI File");
  }

  const headerLength = readUint32(bytes, 4);
  const format = readUint16(bytes, 8);
  const trackCount = readUint16(bytes, 10);
  const ticksPerQuarter = readUint16(bytes, 12);
  let offset = 8 + headerLength;
  let bpm: number | null = null;
  const tracks: ParsedMidiTrack[] = [];

  for (let index = 0; index < trackCount; index += 1) {
    if (readAscii(bytes, offset, 4) !== "MTrk") {
      throw new Error(`MIDI track ${index + 1} is missing MTrk header`);
    }
    const trackLength = readUint32(bytes, offset + 4);
    const trackBytes = bytes.slice(offset + 8, offset + 8 + trackLength);
    const parsed = parseMidiTrack(trackBytes, ticksPerQuarter, `track ${index + 1}`);
    if (parsed.bpm !== null && bpm === null) {
      bpm = parsed.bpm;
    }
    if (parsed.notes.length > 0) {
      tracks.push({
        name: parsed.name,
        notes: parsed.notes,
      });
    }
    offset += 8 + trackLength;
  }

  return {
    bpm,
    format,
    ticksPerQuarter,
    tracks,
  };
}

function parseMidiTrack(
  bytes: Uint8Array,
  ticksPerQuarter: number,
  fallbackName: string,
) {
  const activeNotes = new Map<string, ActiveNote[]>();
  const notes: ParsedMidiNote[] = [];
  let absoluteTick = 0;
  let bpm: number | null = null;
  let cursor = 0;
  let name = fallbackName;
  let runningStatus = 0;

  while (cursor < bytes.length) {
    const delta = readVariableLength(bytes, cursor);
    absoluteTick += delta.value;
    cursor = delta.nextOffset;

    let status = bytes[cursor] ?? 0;
    if (status >= 0x80) {
      cursor += 1;
      if (status < 0xf0) {
        runningStatus = status;
      }
    } else {
      status = runningStatus;
    }

    if (status === 0xff) {
      const metaType = bytes[cursor] ?? 0;
      cursor += 1;
      const length = readVariableLength(bytes, cursor);
      cursor = length.nextOffset;
      const payload = bytes.slice(cursor, cursor + length.value);
      cursor += length.value;
      if (metaType === 0x03 && payload.length > 0) {
        name = new TextDecoder().decode(payload);
      }
      if (metaType === 0x51 && payload.length === 3) {
        const microsecondsPerQuarter =
          ((payload[0] ?? 0) << 16) | ((payload[1] ?? 0) << 8) | (payload[2] ?? 0);
        bpm = Math.round(60_000_000 / Math.max(1, microsecondsPerQuarter));
      }
      if (metaType === 0x2f) {
        break;
      }
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const length = readVariableLength(bytes, cursor);
      cursor = length.nextOffset + length.value;
      continue;
    }

    const channel = status & 0x0f;
    const kind = status & 0xf0;
    const dataLength = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
    const first = bytes[cursor] ?? 0;
    const second = dataLength > 1 ? bytes[cursor + 1] ?? 0 : 0;
    cursor += dataLength;

    if (kind === 0x90 && second > 0) {
      const key = `${channel}:${first}`;
      const bucket = activeNotes.get(key) ?? [];
      bucket.push({
        channel,
        midi: first,
        startTick: absoluteTick,
        velocity: second / 127,
      });
      activeNotes.set(key, bucket);
    }

    if (kind === 0x80 || (kind === 0x90 && second === 0)) {
      const key = `${channel}:${first}`;
      const bucket = activeNotes.get(key) ?? [];
      const active = bucket.shift();
      if (active) {
        notes.push({
          channel: active.channel,
          durationBeats: Math.max(1 / ticksPerQuarter, (absoluteTick - active.startTick) / ticksPerQuarter),
          midi: active.midi,
          startBeat: active.startTick / ticksPerQuarter,
          velocity: active.velocity,
        });
      }
      if (bucket.length === 0) {
        activeNotes.delete(key);
      }
    }
  }

  return {
    bpm,
    name,
    notes: notes.sort(
      (left, right) => left.startBeat - right.startBeat || left.midi - right.midi,
    ),
  };
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readUint16(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function readVariableLength(bytes: Uint8Array, offset: number) {
  let value = 0;
  let cursor = offset;
  for (let index = 0; index < 4 && cursor < bytes.length; index += 1) {
    const byte = bytes[cursor] ?? 0;
    cursor += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return { nextOffset: cursor, value };
}

