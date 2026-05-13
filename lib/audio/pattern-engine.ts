"use client";

import {
  collectPatternSampleIds,
  collectPatternPlaybackPlan,
  getStepDurationSec,
  type PatternStepTraceEvent,
  type ScheduledStepEvent,
} from "@/lib/audio/pattern";
import type { DeclickPreset } from "@/lib/audio/declick";
import {
  createToneFxGraph,
  type ToneFxGraph,
} from "@/lib/audio/fx-chain";
import {
  collectFxAutomationEvents,
  resolveFxAutomationWet,
  serializeFxPattern,
  type FxPatternInput,
} from "@/lib/audio/fx-manifest";
import { publishPatternPlaybackTrace } from "@/lib/audio/playback-agency";
import { resolveSamplePlaybackSegment } from "@/lib/audio/sample-engine";
import {
  registerActiveEngine,
  unregisterActiveEngine,
} from "@/lib/audio/transport-owner";
import type { Pattern } from "@/lib/pattern/schema";
import type { GlobalMusicContext } from "@/lib/music/context";
import { resolveSample } from "@/lib/samples/resolver";
import { type SliceRegion } from "@/lib/audio/slices";

type ToneModule = typeof import("tone");
type TonePlayer = InstanceType<ToneModule["Player"]>;
type ToneTransportTime = Parameters<TonePlayer["stop"]>[0];
type ResolvedSample = Awaited<ReturnType<typeof resolveSample>>;
type ToneOutputNode = ToneFxGraph["input"];

type DisposablePart = {
  loop: boolean | number;
  loopEnd: unknown;
  start: (time?: number) => unknown;
  stop: () => unknown;
  dispose: () => unknown;
};

const MANUAL_STOP_RELEASE_SEC = 0.02;
const DEFAULT_POOL_BUCKET_MAX = 8;

export type PatternEnginePlayOptions = {
  declickPreset?: DeclickPreset;
  fxPattern?: FxPatternInput;
  sliceCount?: number;
  slicesBySampleId?: Map<string, SliceRegion[]>;
  musicalContext?: GlobalMusicContext;
  zeroCrossingWindowMs?: number;
  random?: () => number;
};

export type PatternEngineStopOptions = {
  graceful?: boolean;
};

export type PatternEngineOptions = {
  id: string;
};

export class PatternEngine {
  readonly id: string;

  #activePart: DisposablePart | null = null;
  #activeFxAutomationPart: DisposablePart | null = null;
  #activeTracePart: DisposablePart | null = null;
  #activeOutputGraph: ToneFxGraph | null = null;
  #activePlayers = new Set<TonePlayer>();
  #activeChokePlayers = new Map<string, TonePlayer>();
  #disposeTimers = new Set<ReturnType<typeof setTimeout>>();
  #playerPool = new Map<unknown, TonePlayer[]>();
  #poolBucketMax = DEFAULT_POOL_BUCKET_MAX;
  #lastOptions: PatternEnginePlayOptions = {};

  constructor(options: PatternEngineOptions) {
    this.id = options.id;
  }

  get isPlaying(): boolean {
    return this.#activePart !== null;
  }

  async play(pattern: Pattern, options: PatternEnginePlayOptions = {}): Promise<void> {
    const Tone = await import("tone");
    await Tone.start();
    await this.stop({ graceful: false });

    const transport = Tone.getTransport();
    transport.bpm.value = pattern.bpm;
    transport.swing = pattern.swing;
    transport.swingSubdivision = "16n";

    const outputGraph = await createToneFxGraph({
      fxPattern: options.fxPattern,
      Tone,
    });
    this.#activeOutputGraph = outputGraph;
    this.#lastOptions = options;

    const sampleMap = await this.#resolveSampleMap(pattern);
    this.#scheduleParts({
      pattern,
      sampleMap,
      options,
      Tone,
      outputGraph,
    });

    const ownership = registerActiveEngine(this.id);
    if (ownership === "first") {
      transport.stop();
      transport.position = 0;
      transport.start();
    }
  }

  async updatePattern(
    pattern: Pattern,
    options: PatternEnginePlayOptions = this.#lastOptions,
  ): Promise<void> {
    if (!this.#activePart || !this.#activeOutputGraph) {
      return;
    }

    const Tone = await import("tone");
    const transport = Tone.getTransport();
    transport.bpm.rampTo(pattern.bpm, 0.05);
    transport.swing = pattern.swing;
    transport.swingSubdivision = "16n";

    this.#lastOptions = options;
    const sampleMap = await this.#resolveSampleMap(pattern);

    this.#activePart.stop();
    this.#activePart.dispose();
    this.#activePart = null;
    this.#activeFxAutomationPart?.stop();
    this.#activeFxAutomationPart?.dispose();
    this.#activeFxAutomationPart = null;
    this.#activeTracePart?.stop();
    this.#activeTracePart?.dispose();
    this.#activeTracePart = null;

    let outputGraph = this.#activeOutputGraph;
    if (serializeFxPattern(options.fxPattern) !== outputGraph.signature) {
      this.clearPlaybackState({ graceful: false });
      outputGraph = await createToneFxGraph({
        fxPattern: options.fxPattern,
        Tone,
      });
      this.#activeOutputGraph = outputGraph;
    }

    this.#scheduleParts({
      pattern,
      sampleMap,
      options,
      Tone,
      outputGraph,
    });
  }

  async stop(options: PatternEngineStopOptions = {}): Promise<void> {
    const Tone = await import("tone");
    this.#activePart?.stop();
    this.#activePart?.dispose();
    this.#activePart = null;
    this.#activeFxAutomationPart?.stop();
    this.#activeFxAutomationPart?.dispose();
    this.#activeFxAutomationPart = null;
    this.#activeTracePart?.stop();
    this.#activeTracePart?.dispose();
    this.#activeTracePart = null;
    const ownership = unregisterActiveEngine(this.id);
    if (ownership === "last") {
      Tone.getTransport().stop();
      Tone.getTransport().cancel();
    }
    this.clearPlaybackState({ graceful: options.graceful ?? true });
  }

  dispose(): void {
    this.clearPlaybackState({ graceful: false });
    this.#activePart?.dispose();
    this.#activePart = null;
    this.#activeFxAutomationPart?.dispose();
    this.#activeFxAutomationPart = null;
    this.#activeTracePart?.dispose();
    this.#activeTracePart = null;
  }

  clearPlaybackState({ graceful = false }: { graceful?: boolean } = {}): void {
    this.#activeFxAutomationPart?.stop();
    this.#activeFxAutomationPart?.dispose();
    this.#activeFxAutomationPart = null;

    for (const timer of this.#disposeTimers) {
      clearTimeout(timer);
    }
    this.#disposeTimers.clear();

    const outputGraph = this.#activeOutputGraph;
    this.#activeOutputGraph = null;

    if (graceful) {
      for (const player of this.#activePlayers) {
        this.#releaseAndDisposePlayer(player, MANUAL_STOP_RELEASE_SEC);
      }
      this.#activePlayers.clear();
      this.#activeChokePlayers.clear();
      for (const bucket of this.#playerPool.values()) {
        for (const pooled of bucket) {
          this.#scheduleDispose(pooled, MANUAL_STOP_RELEASE_SEC * 1000 + 100);
        }
      }
      this.#playerPool.clear();
      if (outputGraph) {
        this.#scheduleDispose(outputGraph, MANUAL_STOP_RELEASE_SEC * 1000 + 100);
      }
      return;
    }

    for (const player of this.#activePlayers) {
      player.stop();
      player.dispose();
    }
    this.#activePlayers.clear();
    this.#activeChokePlayers.clear();
    for (const bucket of this.#playerPool.values()) {
      for (const pooled of bucket) {
        pooled.dispose();
      }
    }
    this.#playerPool.clear();
    outputGraph?.dispose();
  }

  async #resolveSampleMap(pattern: Pattern): Promise<Map<string, ResolvedSample>> {
    const samples = await Promise.all(
      collectPatternSampleIds(pattern).map(
        async (sampleId) => [sampleId, await resolveSample(sampleId)] as const,
      ),
    );
    return new Map(samples);
  }

  #scheduleParts({
    pattern,
    sampleMap,
    options,
    Tone,
    outputGraph,
  }: {
    pattern: Pattern;
    sampleMap: Map<string, ResolvedSample>;
    options: PatternEnginePlayOptions;
    Tone: ToneModule;
    outputGraph: ToneFxGraph;
  }): void {
    const random = options.random ?? Math.random;
    const { events, traces } = collectPatternPlaybackPlan(pattern, {
      musicalContext: options.musicalContext,
      random,
      probabilityMode: "defer",
    });
    const eventEntries = events.map((event) => [event.timeSec, event] as const);
    const traceEntries = traces.map((event) => [event.timeSec, event] as const);
    const outputNode = outputGraph.input;
    this.#activeChokePlayers.clear();

    const tracePart = new Tone.Part((_time, event: PatternStepTraceEvent) => {
      publishPatternPlaybackTrace(event);
    }, traceEntries);

    const part = new Tone.Part((time, event: ScheduledStepEvent) => {
      if (event.probability < 1 && random() > event.probability) {
        return;
      }
      const sample = sampleMap.get(event.sampleId);
      if (!sample) {
        return;
      }

      const audioBuffer = sample.audioBuffer;
      const player = this.#acquirePlayer(Tone, audioBuffer, outputNode);
      const segment = resolveSamplePlaybackSegment({
        audioBuffer: sample.audioBuffer,
        event,
        options,
      });
      const gain = Math.max(0.0001, segment.targetGain);
      const fadeOutStart = Math.max(
        Number(time),
        Number(time) + segment.releaseStartOffsetSec,
      );

      player.reverse = event.reverse;
      player.fadeIn = segment.envelope.attackSec;
      player.fadeOut = segment.envelope.releaseSec;
      player.playbackRate = event.playbackRate;
      player.volume.value = Tone.gainToDb(gain);

      if (event.chokeGroup) {
        this.#activeChokePlayers.get(event.chokeGroup)?.stop(time as ToneTransportTime);
        this.#activeChokePlayers.set(event.chokeGroup, player);
      }
      player.start(time, segment.sourceOffsetSec);
      player.stop(fadeOutStart as ToneTransportTime);

      const releaseTimer = setTimeout(
        () => {
          if (event.chokeGroup && this.#activeChokePlayers.get(event.chokeGroup) === player) {
            this.#activeChokePlayers.delete(event.chokeGroup);
          }
          this.#releasePlayer(audioBuffer, player);
          this.#disposeTimers.delete(releaseTimer);
        },
        Math.max(250, (segment.audibleDurationSec + segment.envelope.releaseSec) * 1000 + 100),
      );
      this.#disposeTimers.add(releaseTimer);
    }, eventEntries);

    part.loop = true;
    part.loopEnd = getStepDurationSec(pattern) * pattern.stepsPerBar * pattern.bars;
    tracePart.loop = true;
    tracePart.loopEnd = part.loopEnd;
    this.#activeFxAutomationPart = this.#createFxAutomationPart({
      fxPattern: options.fxPattern,
      loopEnd: Number(part.loopEnd),
      pattern,
      random,
      Tone,
      outputGraph,
    });
    tracePart.start(0);
    part.start(0);
    this.#activePart = part;
    this.#activeTracePart = tracePart;
  }

  #createFxAutomationPart({
    fxPattern,
    loopEnd,
    pattern,
    random,
    Tone,
    outputGraph,
  }: {
    fxPattern?: FxPatternInput;
    loopEnd: number;
    pattern: Pattern;
    random: () => number;
    Tone: ToneModule;
    outputGraph: ToneFxGraph;
  }): DisposablePart | null {
    const events = collectFxAutomationEvents({
      fxPattern,
      stepDurationSec: getStepDurationSec(pattern),
      totalSteps: pattern.stepsPerBar * pattern.bars,
    });
    if (events.length === 0) {
      return null;
    }

    const part = new Tone.Part((time, event: (typeof events)[number]) => {
      outputGraph.setSlotWet(
        event.slotId,
        resolveFxAutomationWet(event, random),
        Number(time),
        event.smoothSec,
      );
    }, events.map((event) => [event.timeSec, event] as const));

    part.loop = true;
    part.loopEnd = loopEnd;
    part.start(0);
    return part;
  }

  #acquirePlayer(
    Tone: ToneModule,
    buffer: ResolvedSample["audioBuffer"],
    outputNode: ToneOutputNode,
  ): TonePlayer {
    const bucket = this.#playerPool.get(buffer);
    const pooled = bucket?.pop();
    if (pooled) {
      this.#activePlayers.add(pooled);
      return pooled;
    }
    const player = new Tone.Player(buffer);
    player.connect(outputNode as Parameters<TonePlayer["connect"]>[0]);
    this.#activePlayers.add(player);
    return player;
  }

  #releasePlayer(buffer: ResolvedSample["audioBuffer"], player: TonePlayer): void {
    if (!this.#activePlayers.delete(player)) {
      return;
    }
    let bucket = this.#playerPool.get(buffer);
    if (!bucket) {
      bucket = [];
      this.#playerPool.set(buffer, bucket);
    }
    if (bucket.length < this.#poolBucketMax) {
      bucket.push(player);
      return;
    }
    player.dispose();
  }

  #releaseAndDisposePlayer(player: TonePlayer, releaseSec: number): void {
    if (typeof player.fadeOut === "number") {
      player.fadeOut = Math.max(player.fadeOut, releaseSec);
    } else {
      player.fadeOut = releaseSec;
    }
    player.stop();
    this.#scheduleDispose(player, releaseSec * 1000 + 100);
  }

  #scheduleDispose(disposable: { dispose: () => unknown }, delayMs: number): void {
    const disposeTimer = setTimeout(() => {
      disposable.dispose();
      this.#disposeTimers.delete(disposeTimer);
    }, Math.max(0, delayMs));
    this.#disposeTimers.add(disposeTimer);
  }

}

export function createPatternEngine(options: PatternEngineOptions): PatternEngine {
  return new PatternEngine(options);
}
