import { el } from '@elemaudio/core';
import { allocateVoices, hashInstrument, type Instrument, type NoteEvent } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { renderNode } from './offline.ts';
import { encodeWav, type WavFormat } from './wav.ts';
import { sha256Hex } from '@toolpa/graph';
import { applyTone, countNodes } from './tone.ts';

function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function voiceNode(note: NoteEvent, instrument: Instrument, index: number) {
  const start = note.startSeconds * instrument.sampleRate;
  const end = (note.startSeconds + note.durationSeconds) * instrument.sampleRate;
  const gate = el.sparseq2(
    {
      key: `gate-${index}`,
      seq: [
        { value: note.velocity / 127, time: start },
        { value: 0, time: end },
      ],
    },
    el.time(),
  );
  const envelope = el.adsr(
    instrument.voice.attackSeconds,
    instrument.voice.decaySeconds,
    instrument.voice.sustain,
    instrument.voice.releaseSeconds,
    gate,
  );
  return el.mul(envelope, el.cycle(midiHz(note.midi)));
}

export function sumVoices(instrument: Instrument, trace?: Trace) {
  const allocated = allocateVoices(instrument.notes, instrument.maxVoices);
  trace?.event('voice.allocate', {
    voices: allocated.sounding.length,
    stolen: allocated.stolen.length,
    maxVoices: instrument.maxVoices,
  });
  for (const note of allocated.stolen) {
    trace?.event('voice.steal', { midi: note.midi, startSeconds: note.startSeconds });
  }
  const voices = allocated.sounding.map((note, index) => voiceNode(note, instrument, index));
  const sum = voices.length === 0 ? el.const({ key: 'silence', value: 0 }) : voices.length === 1 ? voices[0] : el.add(...voices);
  return { sum, ...allocated };
}

export function lowerEffects(instrument: Instrument, effects: Instrument['effect'][], trace?: Trace) {
  if (effects.length < 1 || effects.length > 4) throw new Error('a rack mounts 1 to 4 effects');
  const voices = sumVoices(instrument, trace);
  let node = voices.sum;
  for (const effect of effects) node = applyTone(node, effect, trace);
  const svf = countNodes(node, 'svf');
  if (svf !== effects.length) throw new Error(`mounted ${svf} lowpass filters for ${effects.length} effects`);
  return { node, svf, sounding: voices.sounding, stolen: voices.stolen };
}

export function lowerInstrument(instrument: Instrument, trace?: Trace) {
  const lowered = lowerEffects(instrument, [instrument.effect], trace);
  return lowered;
}

export async function renderVoiceSum(
  input: { instrument: unknown; durationSeconds: number; format?: WavFormat },
  trace?: Trace,
) {
  if (!(input.durationSeconds > 0) || input.durationSeconds > 30) {
    throw new Error('durationSeconds must be greater than 0 and at most 30');
  }
  const { instrument, hash } = await hashInstrument(input.instrument, trace);
  const voices = sumVoices(instrument, trace);
  const frames = Math.round(input.durationSeconds * instrument.sampleRate);
  const pcm = await renderNode(voices.sum, { sampleRate: instrument.sampleRate, frames, trace });
  const format = input.format ?? 'float32';
  const wav = encodeWav(pcm, instrument.sampleRate, { format, documentHash: hash });
  trace?.event('export.stem', { hash, stem: 'dry', frames });
  return { instrument, hash, pcm, wav, wavSha256: await sha256Hex(wav) };
}

export async function renderInstrument(
  input: { instrument: unknown; durationSeconds: number; format?: WavFormat },
  trace?: Trace,
) {
  if (!(input.durationSeconds > 0) || input.durationSeconds > 30) {
    throw new Error('durationSeconds must be greater than 0 and at most 30');
  }
  const { instrument, hash } = await hashInstrument(input.instrument, trace);
  const lowered = lowerInstrument(instrument, trace);
  if (lowered.svf !== 1) throw new Error(`the tone effect mounted ${lowered.svf} times`);
  const frames = Math.round(input.durationSeconds * instrument.sampleRate);
  const started = performance.now();
  const pcm = await renderNode(lowered.node, { sampleRate: instrument.sampleRate, frames, trace });
  const format = input.format ?? 'float32';
  const wav = encodeWav(pcm, instrument.sampleRate, { format, documentHash: hash });
  const renderMs = performance.now() - started;
  trace?.event('instrument.render', {
    hash,
    frames,
    voices: lowered.sounding.length,
    stolen: lowered.stolen.length,
    svf: lowered.svf,
    renderMs,
  });
  return {
    instrument,
    hash,
    pcm,
    wav,
    wavSha256: await sha256Hex(wav),
    svf: lowered.svf,
    sounding: lowered.sounding,
    stolen: lowered.stolen,
    renderMs,
  };
}
