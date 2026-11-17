import type { Trace } from '@toolpa/trace';

export class PerformError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PerformError';
  }
}

export interface Scene {
  id: string;
  name: string;
}

export function quantizeLaunch(nowBeats: number, quantum: number): number {
  if (!Number.isFinite(nowBeats) || nowBeats < 0 || nowBeats > 4096) {
    throw new PerformError('PERFORM_BEAT', 'PERFORM_BEAT: the playhead must be from 0 to 4096 beats');
  }
  if (!Number.isFinite(quantum) || quantum <= 0 || quantum > 64) {
    throw new PerformError('PERFORM_QUANTUM', 'PERFORM_QUANTUM: the quantum must be greater than 0 and at most 64');
  }
  const cells = nowBeats / quantum;
  if (Math.abs(cells - Math.round(cells)) < 1e-9) return Math.round(cells) * quantum;
  return Math.ceil(cells) * quantum;
}

export class PerformanceSet {
  private learning: string | null = null;
  private active = '';
  private readonly macros = new Map<number, string>();

  constructor(
    readonly scenes: readonly Scene[],
    private readonly trace?: Trace,
  ) {
    if (scenes.length < 1 || scenes.length > 64) throw new PerformError('PERFORM_SCENE', 'PERFORM_SCENE: a set has 1 to 64 scenes');
  }

  select(id: string): string {
    if (!this.scenes.some((scene) => scene.id === id)) throw new PerformError('PERFORM_SCENE', 'PERFORM_SCENE: that scene is not in the set');
    this.active = id;
    this.trace?.event('performance.scene', { scene: id });
    return id;
  }

  armLearn(param: string): void {
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(param)) throw new PerformError('PERFORM_MACRO', 'PERFORM_MACRO: a macro name is lowercase');
    this.learning = param;
    this.trace?.event('performance.learn', { param, cc: -1 });
  }

  controlChange(cc: number): { cc: number; param: string } | null {
    if (!Number.isInteger(cc) || cc < 0 || cc > 127) throw new PerformError('PERFORM_CC', 'PERFORM_CC: a control change is 0 to 127');
    if (!this.learning) return null;
    const param = this.learning;
    this.macros.set(cc, param);
    this.learning = null;
    this.trace?.event('performance.learn', { param, cc });
    return { cc, param };
  }

  macro(cc: number): string | null {
    return this.macros.get(cc) ?? null;
  }

  launch(nowBeats: number, quantum: number): { scene: string; at: number } {
    if (!this.active) throw new PerformError('PERFORM_SCENE', 'PERFORM_SCENE: select a scene before launch');
    const at = quantizeLaunch(nowBeats, quantum);
    this.trace?.event('performance.launch', { scene: this.active, at });
    return { scene: this.active, at };
  }

  reportXrun(underruns: number, outputLatency = 0): number {
    if (!Number.isInteger(underruns) || underruns < 0) throw new PerformError('PERFORM_XRUN', 'PERFORM_XRUN: underruns must be a non-negative integer');
    if (!Number.isFinite(outputLatency) || outputLatency < 0) throw new PerformError('PERFORM_XRUN', 'PERFORM_XRUN: latency must be finite and at least 0');
    this.trace?.event('performance.xrun', { underruns, output: outputLatency });
    return underruns;
  }
}

export function performanceSelfCheck(): { at: number; param: string; scene: string } {
  const set = new PerformanceSet([
    { id: 'scene-a', name: 'Scene A' },
    { id: 'scene-b', name: 'Scene B' },
  ]);
  set.select('scene-a');
  set.armLearn('cutoff');
  const mapped = set.controlChange(74);
  const launched = set.launch(1.2, 1);
  return { at: launched.at, param: mapped?.param ?? '', scene: launched.scene };
}
