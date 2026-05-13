export type MidiFileSummary = {
  format: number;
  noteOffCount: number;
  noteOnCount: number;
  reasons: string[];
  ticksPerQuarter: number;
  trackCount: number;
  valid: boolean;
};

export function parseMidiFileSummary(bytes: Uint8Array): MidiFileSummary {
  const reasons: string[] = [];

  if (readAscii(bytes, 0, 4) !== "MThd") {
    reasons.push("missing MThd header");
    return emptySummary(reasons);
  }

  const headerLength = readUint32(bytes, 4);
  const format = readUint16(bytes, 8);
  const trackCount = readUint16(bytes, 10);
  const ticksPerQuarter = readUint16(bytes, 12);

  if (headerLength !== 6) {
    reasons.push(`unexpected header length ${headerLength}`);
  }
  if (![0, 1].includes(format)) {
    reasons.push(`unsupported MIDI format ${format}`);
  }
  if (trackCount < 1) {
    reasons.push("MIDI file must contain at least one track");
  }

  let offset = 8 + headerLength;
  let noteOnCount = 0;
  let noteOffCount = 0;
  let parsedTracks = 0;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (readAscii(bytes, offset, 4) !== "MTrk") {
      reasons.push(`track ${trackIndex + 1} missing MTrk header`);
      break;
    }
    const trackLength = readUint32(bytes, offset + 4);
    const trackEnd = offset + 8 + trackLength;
    if (trackEnd > bytes.length) {
      reasons.push(`track ${trackIndex + 1} extends beyond file length`);
      break;
    }

    const counts = countTrackNotes(bytes.slice(offset + 8, trackEnd));
    noteOnCount += counts.noteOnCount;
    noteOffCount += counts.noteOffCount;
    parsedTracks += 1;
    offset = trackEnd;
  }

  if (parsedTracks !== trackCount) {
    reasons.push(`expected ${trackCount} tracks, parsed ${parsedTracks}`);
  }
  if (noteOnCount === 0) {
    reasons.push("MIDI file contains no note-on events");
  }
  if (noteOffCount < noteOnCount) {
    reasons.push("MIDI file has fewer note-off events than note-on events");
  }

  return {
    format,
    noteOffCount,
    noteOnCount,
    reasons,
    ticksPerQuarter,
    trackCount,
    valid: reasons.length === 0,
  };
}

function countTrackNotes(track: Uint8Array) {
  let offset = 0;
  let runningStatus = 0;
  let noteOnCount = 0;
  let noteOffCount = 0;

  while (offset < track.length) {
    const delta = readVariableLength(track, offset);
    offset = delta.nextOffset;
    if (offset >= track.length) {
      break;
    }

    let status = track[offset] ?? 0;
    if (status >= 0x80) {
      offset += 1;
      if (status < 0xf0) {
        runningStatus = status;
      }
    } else {
      status = runningStatus;
    }

    if (status === 0xff) {
      const type = track[offset] ?? 0;
      offset += 1;
      const length = readVariableLength(track, offset);
      offset = length.nextOffset + length.value;
      if (type === 0x2f) {
        break;
      }
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const length = readVariableLength(track, offset);
      offset = length.nextOffset + length.value;
      continue;
    }

    const highNibble = status & 0xf0;
    const dataLength = highNibble === 0xc0 || highNibble === 0xd0 ? 1 : 2;
    const first = track[offset] ?? 0;
    const second = dataLength > 1 ? track[offset + 1] ?? 0 : 0;
    offset += dataLength;

    if (highNibble === 0x90 && second > 0) {
      noteOnCount += 1;
    } else if (highNibble === 0x80 || (highNibble === 0x90 && second === 0)) {
      noteOffCount += 1;
    }

    void first;
  }

  return { noteOffCount, noteOnCount };
}

function emptySummary(reasons: string[]): MidiFileSummary {
  return {
    format: -1,
    noteOffCount: 0,
    noteOnCount: 0,
    reasons,
    ticksPerQuarter: 0,
    trackCount: 0,
    valid: false,
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

