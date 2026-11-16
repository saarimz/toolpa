import type { NoteEvent } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';

export interface PatternNote {
  midi: number;
  step: number;
  velocity: number;
}

export interface PromptGenerator {
  generate(prompt: string, trace?: Trace): PatternNote[];
}

export class GenerateError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GenerateError';
  }
}

export function euclidean(steps: number, pulses: number): number[] {
  if (!Number.isInteger(steps) || steps < 1 || steps > 32) {
    throw new GenerateError('PATTERN_RANGE', 'PATTERN_RANGE: steps must be an integer from 1 to 32');
  }
  if (!Number.isInteger(pulses) || pulses < 0 || pulses > steps) {
    throw new GenerateError('PATTERN_RANGE', 'PATTERN_RANGE: pulses must be an integer from 0 to the step count');
  }
  const pattern = Array.from({ length: steps }, () => 0);
  let bucket = 0;
  for (let index = 0; index < steps; index += 1) {
    bucket += pulses;
    if (bucket >= steps) {
      bucket -= steps;
      pattern[index] = 1;
    }
  }
  const first = pattern.indexOf(1);
  const rotated = first <= 0 ? pattern : pattern.slice(first).concat(pattern.slice(0, first));
  return rotated;
}

export function notesFromPulses(pattern: readonly number[], root: number, velocity = 100, trace?: Trace): PatternNote[] {
  if (!Number.isInteger(root) || root < 0 || root > 115) {
    throw new GenerateError('PATTERN_RANGE', 'PATTERN_RANGE: root must be an integer from 0 to 115');
  }
  const notes = pattern.flatMap((pulse, step) =>
    pulse ? [{ midi: Math.min(127, root + (step % 4 === 0 ? 0 : 7)), step, velocity }] : [],
  );
  trace?.event('generate.pattern', { steps: pattern.length, notes: notes.length, root });
  return notes;
}

function hashString(text: string): number {
  let hash = 2_166_136_261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class LocalPromptProvider implements PromptGenerator {
  generate(prompt: string, trace?: Trace): PatternNote[] {
    const text = prompt.trim().toLowerCase();
    if (!text) throw new GenerateError('PROMPT_EMPTY', 'PROMPT_EMPTY: the prompt is empty');
    const hash = hashString(text);
    const pulses = 1 + (hash % 4);
    const root = 48 + (hash % 12);
    const notes = notesFromPulses(euclidean(8, pulses), root, 80 + (hash % 20));
    trace?.event('generate.prompt', { provider: 'local', notes: notes.length, pulses, root });
    return notes;
  }
}

export class RemotePromptProvider implements PromptGenerator {
  generate(): PatternNote[] {
    throw new GenerateError('NOT_CONFIGURED', 'NOT_CONFIGURED: a hosted prompt model is not wired');
  }
}

export function notesFromTokens(tokens: readonly string[]): PatternNote[] {
  const notes: PatternNote[] = [];
  for (const token of tokens) {
    const match = /^(\d+):(\d+):(\d+)$/.exec(token);
    if (!match) continue;
    const midi = Number(match[1]);
    const step = Number(match[2]);
    const velocity = Number(match[3]);
    if (!Number.isInteger(midi) || midi > 127 || step > 31 || velocity > 127) continue;
    notes.push({ midi, step, velocity });
  }
  if (notes.length === 0) throw new GenerateError('PROMPT_EMPTY', 'PROMPT_EMPTY: the model returned no notes');
  return notes;
}

export async function notesFromHosted(
  prompt: string,
  complete: (prompt: string) => string[] | Promise<string[]>,
  trace?: Trace,
): Promise<PatternNote[]> {
  const text = prompt.trim();
  if (!text) throw new GenerateError('PROMPT_EMPTY', 'PROMPT_EMPTY: the prompt is empty');
  const notes = notesFromTokens(await complete(text));
  trace?.event('generate.prompt', { provider: 'remote', notes: notes.length, pulses: notes.length, root: notes[0]?.midi ?? 0 });
  return notes;
}

export async function hostedPromptSelfCheck(): Promise<{ notes: number; midi: number; remote: string }> {
  const notes = await notesFromHosted('bass', async () => ['60:0:90', '64:2:80']);
  let remote = '';
  try {
    new RemotePromptProvider().generate('bass');
  } catch (error) {
    remote = error instanceof GenerateError ? error.code : 'error';
  }
  return { notes: notes.length, midi: notes[0]?.midi ?? -1, remote };
}

export function schedulePattern(notes: readonly PatternNote[], secondsPerStep: number): NoteEvent[] {
  if (!(secondsPerStep > 0) || secondsPerStep > 2) {
    throw new GenerateError('PATTERN_RANGE', 'PATTERN_RANGE: seconds per step must be greater than 0 and at most 2');
  }
  return notes.map((note) => ({
    midi: note.midi,
    startSeconds: note.step * secondsPerStep,
    durationSeconds: Math.min(secondsPerStep * 0.8, 1),
    velocity: note.velocity,
  }));
}

export function generateSelfCheck(): { pulses: number; first: number; same: boolean; remote: string } {
  const pattern = euclidean(8, 3);
  const local = new LocalPromptProvider();
  const first = local.generate('bass');
  const again = local.generate('bass');
  const other = local.generate('lead');
  let remote = '';
  try {
    new RemotePromptProvider().generate('bass');
  } catch (error) {
    remote = error instanceof GenerateError ? error.code : 'error';
  }
  return {
    pulses: pattern.filter((step) => step === 1).length,
    first: first[0]?.midi ?? -1,
    same: JSON.stringify(first) === JSON.stringify(again) && JSON.stringify(first) !== JSON.stringify(other),
    remote,
  };
}
