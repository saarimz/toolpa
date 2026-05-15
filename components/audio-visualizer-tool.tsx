"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Loader2,
  Maximize2,
  Mic,
  Pause,
  Play,
  Sparkles,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LlmGeneratingOverlay } from "@/components/llm-generating-overlay";
import {
  computeAudioFeatureFrame,
  createSilentFeatureFrame,
  selectAudioFeature,
  type AudioFeatureFrame,
  type AudioFeatureMemory,
} from "@/lib/visualizers/audio-features";
import {
  createDefaultVisualizerScene,
  VisualizerSceneSchema,
  type VisualizerMode,
  type VisualizerPalette,
  type VisualizerScene,
} from "@/lib/visualizers/schema";
import { createVisualizerSceneFromPrompt } from "@/lib/visualizers/prompt";
import { logClientPromptMemory } from "@/lib/prompt-memory/client";
import { usePromptParamState } from "@/lib/tools/use-prompt-param";

type AudioVisualizerToolProps = {
  defaultPrompt: string;
  description: string;
  manifestLabel?: string;
  toolName: string;
  toolSlug: string;
};

type AudioByteArray = Uint8Array<ArrayBuffer>;

type VisualizerRuntime = {
  analyser: AnalyserNode | null;
  audioContext: AudioContext | null;
  buffer: AudioBuffer | null;
  fileName: string;
  frequencyData: AudioByteArray | null;
  gainNode: GainNode | null;
  history: Float32Array[];
  lastHudAt: number;
  liveNodes: AudioNode[];
  liveNoiseSource: AudioBufferSourceNode | null;
  liveOscillators: OscillatorNode[];
  mediaSourceNode: MediaStreamAudioSourceNode | null;
  mediaStream: MediaStream | null;
  memory: AudioFeatureMemory | undefined;
  rafId: number | null;
  sourceNode: AudioBufferSourceNode | null;
  startedAtMs: number;
  timeData: AudioByteArray | null;
};

const SOURCE_OPTIONS = [
  { label: "live audio", value: "live-audio" },
  { label: "audio file", value: "audio-file" },
  { label: "microphone", value: "microphone" },
] as const;

const MODE_OPTIONS: Array<{ label: string; value: VisualizerMode }> = [
  { label: "spectral bloom", value: "spectrogram" },
  { label: "frequency crown", value: "frequency-bars" },
  { label: "radial bloom", value: "radial-bloom" },
  { label: "particle field", value: "particle-field" },
  { label: "waveform ribbon", value: "waveform-ribbon" },
  { label: "tunnel", value: "tunnel" },
];

const PALETTE_OPTIONS: VisualizerPalette[] = [
  "mono",
  "neon",
  "ember",
  "ultraviolet",
  "sea-glass",
  "prism",
];

const PALETTE_HUES = {
  ember: [12, 28, 46, 340],
  mono: [0, 0, 0, 0],
  neon: [185, 250, 310, 118],
  prism: [0, 54, 128, 215, 284],
  "sea-glass": [158, 184, 204, 96],
  ultraviolet: [265, 288, 318, 232],
} satisfies Record<VisualizerPalette, number[]>;

export function AudioVisualizerTool({
  defaultPrompt,
  description,
  manifestLabel = "installed visualizer",
  toolName,
  toolSlug,
}: AudioVisualizerToolProps) {
  const [prompt, setPrompt] = usePromptParamState(defaultPrompt);
  const [scene, setScene] = useState<VisualizerScene>(() =>
    createDefaultVisualizerScene(defaultPrompt),
  );
  const [status, setStatus] = useState("start live audio, load a file, or use the mic");
  const [isRunning, setIsRunning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [fullscreenChromeVisible, setFullscreenChromeVisible] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureFrame, setFeatureFrame] = useState<AudioFeatureFrame>(() =>
    createSilentFeatureFrame(),
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullscreenChromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef(scene);
  const runtimeRef = useRef<VisualizerRuntime>({
    analyser: null,
    audioContext: null,
    buffer: null,
    fileName: "",
    frequencyData: null,
    gainNode: null,
    history: [],
    lastHudAt: 0,
    liveNodes: [],
    liveNoiseSource: null,
    liveOscillators: [],
    mediaSourceNode: null,
    mediaStream: null,
    memory: undefined,
    rafId: null,
    sourceNode: null,
    startedAtMs: 0,
    timeData: null,
  });

  useEffect(() => {
    sceneRef.current = scene;
    configureAnalyser(runtimeRef.current, scene);
  }, [scene]);

  useEffect(() => () => {
    stopSource(runtimeRef.current);
    if (runtimeRef.current.rafId !== null) {
      cancelAnimationFrame(runtimeRef.current.rafId);
    }
    if (fullscreenChromeTimerRef.current !== null) {
      clearTimeout(fullscreenChromeTimerRef.current);
    }
    void runtimeRef.current.audioContext?.close();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement === stageRef.current;
      setIsStageFullscreen(isFullscreen);
      setFullscreenChromeVisible(true);
      scheduleFullscreenChromeHide(isFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  async function handleAudioFile(file: File | null) {
    if (!file) {
      return;
    }
    setError(null);
    setStatus("decoding recorded input");
    try {
      const context = ensureAudioContext(runtimeRef.current);
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      runtimeRef.current.buffer = buffer;
      runtimeRef.current.fileName = file.name;
      updateScene({ source: "audio-file" });
      setStatus(`${file.name} ready`);
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Could not decode audio file",
      );
      setStatus("audio file failed");
    }
  }

  async function start() {
    setError(null);
    try {
      const source = sceneRef.current.source;
      if (source === "microphone") {
        await startMicrophone();
      } else if (source === "audio-file") {
        await startAudioFile();
      } else {
        await startLiveAudio();
      }
      setIsRunning(true);
      startAnimationLoop();
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Could not start audio visualizer",
      );
      setIsRunning(false);
    }
  }

  function stop() {
    stopSource(runtimeRef.current);
    setIsRunning(false);
    setStatus("stopped");
  }

  async function startAudioFile() {
    const runtime = runtimeRef.current;
    if (!runtime.buffer) {
      throw new Error("Choose an audio file before starting file visualization");
    }
    stopSource(runtime);
    const context = ensureAudioContext(runtime);
    await context.resume();
    const analyser = ensureAnalyser(runtime, sceneRef.current);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = runtime.buffer;
    source.loop = true;
    gain.gain.value = 0.92;
    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(context.destination);
    source.start();
    runtime.sourceNode = source;
    runtime.gainNode = gain;
    runtime.startedAtMs = performance.now();
    runtime.history = [];
    setStatus(`${runtime.fileName || "audio file"} visualizing`);
  }

  async function startLiveAudio() {
    const runtime = runtimeRef.current;
    stopSource(runtime);
    const context = ensureAudioContext(runtime);
    await context.resume();
    const analyser = ensureAnalyser(runtime, sceneRef.current);
    const settings = resolveLiveAudioSettings(sceneRef.current);

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = settings.cutoffHz;
    filter.Q.value = settings.resonance;

    const outputGain = context.createGain();
    outputGain.gain.value = settings.outputGain;

    const oscillatorNodes = settings.oscillators.map((setting) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = setting.type;
      oscillator.frequency.value = setting.frequencyHz;
      oscillator.detune.value = setting.detuneCents;
      gain.gain.value = setting.gain;
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start();
      runtime.liveNodes.push(gain);
      return oscillator;
    });

    const noiseSource = context.createBufferSource();
    const noiseGain = context.createGain();
    noiseSource.buffer = createNoiseBuffer(context, sceneRef.current.motion.seed);
    noiseSource.loop = true;
    noiseGain.gain.value = settings.noiseGain;
    noiseSource.connect(noiseGain);
    noiseGain.connect(filter);
    noiseSource.start();

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = settings.lfoRateHz;
    lfoGain.gain.value = settings.lfoDepthHz;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    filter.connect(analyser);
    analyser.connect(outputGain);
    outputGain.connect(context.destination);

    runtime.liveNodes.push(filter, outputGain, noiseGain, lfoGain);
    runtime.liveNoiseSource = noiseSource;
    runtime.liveOscillators = [...oscillatorNodes, lfo];
    runtime.gainNode = outputGain;
    runtime.startedAtMs = performance.now();
    runtime.history = [];
    setStatus("live audio visualizing");
  }

  async function startMicrophone() {
    const runtime = runtimeRef.current;
    stopSource(runtime);
    const context = ensureAudioContext(runtime);
    await context.resume();
    const analyser = ensureAnalyser(runtime, sceneRef.current);
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone input requires navigator.mediaDevices.getUserMedia");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      },
    });
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    runtime.mediaStream = stream;
    runtime.mediaSourceNode = source;
    runtime.startedAtMs = performance.now();
    runtime.history = [];
    setStatus("microphone visualizing");
  }

  function generateScene() {
    setIsGenerating(true);
    setError(null);
    window.setTimeout(() => {
      try {
        setScene((current) => {
          const nextScene = createVisualizerSceneFromPrompt(prompt, current);
          logClientPromptMemory({
            action: "generate-visual-scene",
            metadata: {
              mode: nextScene.mode,
              palette: nextScene.palette,
              source: nextScene.source,
            },
            source: "client.audio-visualizer",
            toolSlug,
            userPrompt: prompt,
          });
          return nextScene;
        });
        setStatus("prompt scene ready");
      } catch (unknownError) {
        setError(
          unknownError instanceof Error
            ? unknownError.message
            : "Could not generate visual scene",
        );
      } finally {
        setIsGenerating(false);
      }
    }, 120);
  }

  function updateScene(patch: Partial<VisualizerScene>) {
    setScene((current) => VisualizerSceneSchema.parse({ ...current, ...patch }));
  }

  function updateMapping(
    patch: Partial<VisualizerScene["mapping"]>,
  ) {
    setScene((current) =>
      VisualizerSceneSchema.parse({
        ...current,
        mapping: { ...current.mapping, ...patch },
      }),
    );
  }

  function updateMotion(
    patch: Partial<VisualizerScene["motion"]>,
  ) {
    setScene((current) =>
      VisualizerSceneSchema.parse({
        ...current,
        motion: { ...current.motion, ...patch },
      }),
    );
  }

  function updateSpectrogram(
    patch: Partial<VisualizerScene["spectrogram"]>,
  ) {
    setScene((current) =>
      VisualizerSceneSchema.parse({
        ...current,
        spectrogram: { ...current.spectrogram, ...patch },
      }),
    );
  }

  function updateParticles(
    patch: Partial<VisualizerScene["particles"]>,
  ) {
    setScene((current) =>
      VisualizerSceneSchema.parse({
        ...current,
        particles: { ...current.particles, ...patch },
      }),
    );
  }

  async function copySceneJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(scene, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Copy failed");
    }
  }

  async function requestFullscreen() {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        setFullscreenChromeVisible(true);
        await stage.requestFullscreen({ navigationUI: "hide" });
      }
    } catch (unknownError) {
      setError(
        unknownError instanceof Error ? unknownError.message : "Fullscreen failed",
      );
    }
  }

  function revealFullscreenChrome() {
    if (!isStageFullscreen) {
      return;
    }
    setFullscreenChromeVisible(true);
    scheduleFullscreenChromeHide(true);
  }

  function scheduleFullscreenChromeHide(shouldHide: boolean) {
    if (fullscreenChromeTimerRef.current !== null) {
      clearTimeout(fullscreenChromeTimerRef.current);
      fullscreenChromeTimerRef.current = null;
    }
    if (!shouldHide) {
      return;
    }
    fullscreenChromeTimerRef.current = setTimeout(() => {
      setFullscreenChromeVisible(false);
      fullscreenChromeTimerRef.current = null;
    }, 1800);
  }

  function startAnimationLoop() {
    const runtime = runtimeRef.current;
    if (runtime.rafId !== null) {
      cancelAnimationFrame(runtime.rafId);
    }

    const tick = () => {
      const analyser = runtime.analyser;
      const canvas = canvasRef.current;
      if (!analyser || !canvas) {
        runtime.rafId = requestAnimationFrame(tick);
        return;
      }

      ensureAnalysisBuffers(runtime, analyser);
      if (!runtime.frequencyData || !runtime.timeData) {
        runtime.rafId = requestAnimationFrame(tick);
        return;
      }

      analyser.getByteFrequencyData(runtime.frequencyData);
      analyser.getByteTimeDomainData(runtime.timeData);
      const computed = computeAudioFeatureFrame({
        frequencyData: runtime.frequencyData,
        memory: runtime.memory,
        sampleRate: runtime.audioContext?.sampleRate ?? 44_100,
        timeDomainData: runtime.timeData,
        timestampMs: performance.now() - runtime.startedAtMs,
      });
      runtime.memory = computed.memory;
      drawVisualizer(
        canvas,
        sceneRef.current,
        computed.frame,
        runtime.frequencyData,
        runtime.timeData,
        runtime.history,
      );

      if (performance.now() - runtime.lastHudAt > 120) {
        runtime.lastHudAt = performance.now();
        setFeatureFrame(computed.frame);
      }
      runtime.rafId = requestAnimationFrame(tick);
    };

    runtime.rafId = requestAnimationFrame(tick);
  }

  const showChrome = !isStageFullscreen || fullscreenChromeVisible || isGenerating || Boolean(error);
  const chromeVisibilityClass = showChrome
    ? "opacity-100"
    : "pointer-events-none opacity-0";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div
        ref={stageRef}
        className={`relative min-h-screen overflow-hidden bg-black ${isStageFullscreen && !showChrome ? "cursor-none" : ""}`}
        onPointerDown={revealFullscreenChrome}
        onPointerMove={revealFullscreenChrome}
      >
        <canvas
          ref={canvasRef}
          aria-label="audio reactive visualizer canvas"
          className="absolute inset-0 h-full w-full"
        />

        <div
          aria-hidden={!showChrome}
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/80 via-black/35 to-transparent p-4 transition-opacity duration-500 ${chromeVisibilityClass}`}
          data-visualizer-chrome="header"
        >
          <header className="pointer-events-auto mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-3">
            <div>
              <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-200">
                /dashboard
              </Link>
              <h1 className="mt-1 text-xl text-zinc-100">{toolName}</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
                {description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>{manifestLabel}</span>
              <span>{toolSlug}</span>
              <span>{scene.mode}</span>
              <span>{scene.palette}</span>
              <span>{status}</span>
            </div>
          </header>
        </div>

        <section
          aria-hidden={!showChrome}
          className={`absolute inset-x-0 bottom-0 z-10 border-t border-zinc-800/80 bg-black/85 p-4 backdrop-blur transition-opacity duration-500 ${chromeVisibilityClass}`}
          data-visualizer-chrome="controls"
        >
          {isGenerating ? (
            <LlmGeneratingOverlay
              detail="Applying prompt language to the visual-scene document."
              label="generating visual scene"
              tone="soft"
            />
          ) : null}

          <div className="mx-auto grid max-w-7xl gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="grid gap-3">
              <label className="block text-xs text-zinc-500">
                visualizer prompt
                <textarea
                  className="mt-2 min-h-24 w-full resize-y rounded-sm border border-zinc-800 bg-zinc-950 p-3 text-sm leading-6 text-zinc-100 outline-none focus:border-zinc-200"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 items-center gap-2 rounded-sm border border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-200 hover:border-zinc-500">
                  <Upload className="size-4" />
                  recorded input
                  <input
                    accept="audio/*"
                    className="sr-only"
                    type="file"
                    onChange={(event) => void handleAudioFile(event.target.files?.[0] ?? null)}
                  />
                </label>

                <Button onClick={() => void (isRunning ? stop() : start())}>
                  {isRunning ? <Pause className="size-4" /> : <Play className="size-4" />}
                  {isRunning ? "stop" : "start"}
                </Button>
                <Button disabled={isGenerating} onClick={generateScene}>
                  {isGenerating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  generate
                </Button>
                <Button onClick={() => void requestFullscreen()}>
                  <Maximize2 className="size-4" />
                  {isStageFullscreen ? "exit" : "fullscreen"}
                </Button>
                <Button onClick={() => void copySceneJson()}>
                  <Copy className="size-4" />
                  {copied ? "copied" : "copy json"}
                </Button>
                {error ? <span className="text-xs text-red-300">{error}</span> : null}
              </div>
            </div>

            <div className="grid gap-3 text-xs">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
                <label className="text-zinc-500">
                  source
                  <select
                    className="mt-1 h-9 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-2 text-zinc-100"
                    value={scene.source}
                    onChange={(event) => {
                      const value = event.target.value as VisualizerScene["source"];
                      updateScene({ source: value });
                    }}
                  >
                    {SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-zinc-500">
                  mode
                  <select
                    className="mt-1 h-9 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-2 text-zinc-100"
                    value={scene.mode}
                    onChange={(event) => updateScene({ mode: event.target.value as VisualizerMode })}
                  >
                    {MODE_OPTIONS.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-zinc-500">
                  palette
                  <select
                    className="mt-1 h-9 w-full rounded-sm border border-zinc-800 bg-zinc-950 px-2 text-zinc-100"
                    value={scene.palette}
                    onChange={(event) => updateScene({ palette: event.target.value as VisualizerPalette })}
                  >
                    {PALETTE_OPTIONS.map((palette) => (
                      <option key={palette} value={palette}>
                        {palette}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex h-full items-end gap-2 text-zinc-500">
                  <Mic className="mb-2 size-4" />
                  <span className="mb-2">live/mic/file analyzer</span>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <RangeControl
                  label="sensitivity"
                  max={4}
                  min={0.1}
                  step={0.01}
                  value={scene.mapping.sensitivity}
                  onChange={(value) => updateMapping({ sensitivity: value })}
                />
                <RangeControl
                  label="reactivity"
                  max={1}
                  min={0}
                  step={0.01}
                  value={scene.mapping.reactivity}
                  onChange={(value) => updateMapping({ reactivity: value })}
                />
                <RangeControl
                  label="motion"
                  max={4}
                  min={0}
                  step={0.01}
                  value={scene.motion.speed}
                  onChange={(value) => updateMotion({ speed: value })}
                />
                <RangeControl
                  label="zoom"
                  max={4}
                  min={0.25}
                  step={0.01}
                  value={scene.motion.zoom}
                  onChange={(value) => updateMotion({ zoom: value })}
                />
                <RangeControl
                  label="warp"
                  max={1}
                  min={0}
                  step={0.01}
                  value={scene.motion.warp}
                  onChange={(value) => updateMotion({ warp: value })}
                />
                <RangeControl
                  label="micro fluctuation"
                  max={1}
                  min={0}
                  step={0.01}
                  value={scene.motion.microFluctuation}
                  onChange={(value) => updateMotion({ microFluctuation: value })}
                />
                <RangeControl
                  label="spectral gain"
                  max={4}
                  min={0.25}
                  step={0.01}
                  value={scene.spectrogram.gain}
                  onChange={(value) => updateSpectrogram({ gain: value })}
                />
                <RangeControl
                  label="trails"
                  max={0.96}
                  min={0}
                  step={0.01}
                  value={scene.particles.trails}
                  onChange={(value) => updateParticles({ trails: value })}
                />
                <RangeControl
                  label="density"
                  max={1200}
                  min={24}
                  step={1}
                  value={scene.particles.count}
                  onChange={(value) => updateParticles({ count: Math.round(value) })}
                />
              </div>

              <div className="grid grid-cols-5 gap-2 border-t border-zinc-900 pt-3 text-[11px] text-zinc-500">
                <Metric label="rms" value={featureFrame.rms} />
                <Metric label="bass" value={featureFrame.bass} />
                <Metric label="mid" value={featureFrame.mid} />
                <Metric label="air" value={featureFrame.air} />
                <Metric label="flux" value={featureFrame.flux} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function RangeControl({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  const safeValue = Number.isFinite(value) ? value : min;
  return (
    <label className="text-zinc-500">
      <span className="flex items-center justify-between gap-2">
        {label}
        <span className="font-mono text-zinc-400">{safeValue.toFixed(2)}</span>
      </span>
      <input
        className="mt-1 w-full accent-zinc-200"
        max={max}
        min={min}
        step={step}
        type="range"
        value={safeValue}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-zinc-600">{label}</div>
      <div className="mt-1 font-mono text-zinc-300">{Math.round(value * 100)}</div>
    </div>
  );
}

function ensureAudioContext(runtime: VisualizerRuntime) {
  if (runtime.audioContext) {
    return runtime.audioContext;
  }
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("AudioContext is not available in this browser");
  }
  runtime.audioContext = new AudioContextClass();
  return runtime.audioContext;
}

function ensureAnalyser(runtime: VisualizerRuntime, scene: VisualizerScene) {
  const context = ensureAudioContext(runtime);
  if (!runtime.analyser) {
    runtime.analyser = context.createAnalyser();
  }
  configureAnalyser(runtime, scene);
  return runtime.analyser;
}

function configureAnalyser(runtime: VisualizerRuntime, scene: VisualizerScene) {
  const analyser = runtime.analyser;
  if (!analyser) {
    return;
  }
  analyser.fftSize = scene.analyzer.fftSize;
  analyser.minDecibels = scene.analyzer.minDecibels;
  analyser.maxDecibels = scene.analyzer.maxDecibels;
  analyser.smoothingTimeConstant = scene.analyzer.smoothingTimeConstant;
  ensureAnalysisBuffers(runtime, analyser);
}

function ensureAnalysisBuffers(runtime: VisualizerRuntime, analyser: AnalyserNode) {
  if (runtime.frequencyData?.length !== analyser.frequencyBinCount) {
    runtime.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    runtime.timeData = new Uint8Array(analyser.fftSize);
    runtime.memory = undefined;
    runtime.history = [];
  }
}

function stopSource(runtime: VisualizerRuntime) {
  if (runtime.rafId !== null) {
    cancelAnimationFrame(runtime.rafId);
    runtime.rafId = null;
  }
  stopAudioBufferSource(runtime.sourceNode);
  stopAudioBufferSource(runtime.liveNoiseSource);
  runtime.liveOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {
      // OscillatorNode throws if it was already stopped.
    }
    oscillator.disconnect();
  });
  runtime.analyser?.disconnect();
  runtime.sourceNode?.disconnect();
  runtime.liveNoiseSource?.disconnect();
  runtime.liveNodes.forEach((node) => node.disconnect());
  runtime.mediaSourceNode?.disconnect();
  runtime.gainNode?.disconnect();
  runtime.mediaStream?.getTracks().forEach((track) => track.stop());
  runtime.sourceNode = null;
  runtime.liveNoiseSource = null;
  runtime.liveNodes = [];
  runtime.liveOscillators = [];
  runtime.mediaSourceNode = null;
  runtime.mediaStream = null;
  runtime.gainNode = null;
}

function stopAudioBufferSource(source: AudioBufferSourceNode | null) {
  if (!source) {
    return;
  }
  try {
    source.stop();
  } catch {
    // AudioBufferSourceNode throws if it was already stopped or never started.
  }
}

function resolveLiveAudioSettings(scene: VisualizerScene) {
  const baseFrequencyHz = 48 + (scene.motion.seed % 28) + scene.mapping.sensitivity * 18;
  const brightMode = scene.mode === "frequency-bars" || scene.mode === "radial-bloom";
  const oscillatorType: OscillatorType = brightMode
    ? "sawtooth"
    : scene.mode === "waveform-ribbon"
      ? "triangle"
      : "sine";
  const harmonicType: OscillatorType = scene.mode === "particle-field" ? "square" : "triangle";

  return {
    cutoffHz: Math.min(4200, 520 + scene.mapping.reactivity * 1800 + scene.motion.warp * 1100),
    lfoDepthHz: 45 + scene.mapping.reactivity * 240 + scene.motion.microFluctuation * 180,
    lfoRateHz: 0.12 + scene.motion.speed * 0.22,
    noiseGain: scene.mode === "particle-field" || scene.mode === "spectrogram" ? 0.028 : 0.014,
    oscillators: [
      {
        detuneCents: -4,
        frequencyHz: baseFrequencyHz,
        gain: 0.28,
        type: oscillatorType,
      },
      {
        detuneCents: 7,
        frequencyHz: baseFrequencyHz * 1.5,
        gain: 0.16,
        type: harmonicType,
      },
      {
        detuneCents: -12,
        frequencyHz: baseFrequencyHz * 0.5,
        gain: 0.2,
        type: "sine" as OscillatorType,
      },
    ],
    outputGain: 0.22,
    resonance: 0.8 + scene.mapping.reactivity * 7,
  };
}

function createNoiseBuffer(context: AudioContext, seed: number) {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let state = seed || 1;
  for (let index = 0; index < data.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    data[index] = ((state / 0xffffffff) * 2 - 1) * 0.45;
  }
  return buffer;
}

function drawVisualizer(
  canvas: HTMLCanvasElement,
  scene: VisualizerScene,
  frame: AudioFeatureFrame,
  frequencyData: AudioByteArray,
  timeData: AudioByteArray,
  history: Float32Array[],
) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const size = resizeCanvas(canvas, context);
  const automation = resolveAutomation(scene, frame);
  const primary = selectAudioFeature(frame, scene.mapping.primaryFeature);
  const secondary = selectAudioFeature(frame, scene.mapping.secondaryFeature);
  const accent = selectAudioFeature(frame, scene.mapping.accentFeature);
  const micro = pseudoNoise(scene.motion.seed, frame.timestampMs * 0.001, primary) *
    scene.motion.microFluctuation *
    0.12;

  paintReactiveBackdrop(context, size, scene, frame, automation, micro);

  if (scene.mode === "spectrogram") {
    drawSpectrogram(context, size, scene, frame, frequencyData, history, automation, micro);
    return;
  }

  if (scene.mode === "frequency-bars") {
    drawFrequencyBars(context, size, scene, frame, frequencyData, automation, micro);
  } else if (scene.mode === "radial-bloom") {
    drawRadialBloom(context, size, scene, frame, frequencyData, primary, secondary, accent, automation, micro);
  } else if (scene.mode === "particle-field") {
    drawParticleField(context, size, scene, frame, frequencyData, automation, micro);
  } else if (scene.mode === "waveform-ribbon") {
    drawWaveformRibbon(context, size, scene, frame, frequencyData, timeData, automation, micro);
  } else {
    drawTunnel(context, size, scene, frame, frequencyData, primary, secondary, automation, micro);
  }
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, rect.width || canvas.clientWidth || 1280);
  const height = Math.max(1, rect.height || canvas.clientHeight || 720);
  const nextWidth = Math.floor(width * dpr);
  const nextHeight = Math.floor(height * dpr);
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { height, width };
}

function paintReactiveBackdrop(
  context: CanvasRenderingContext2D,
  size: { height: number; width: number },
  scene: VisualizerScene,
  frame: AudioFeatureFrame,
  automation: ReturnType<typeof resolveAutomation>,
  micro: number,
) {
  const fadeAlpha = Math.max(0.035, 0.22 - automation.feedback * 0.18);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
  context.fillRect(0, 0, size.width, size.height);

  const cx = size.width * (0.5 + (frame.centroid - 0.5) * 0.12);
  const cy = size.height * (0.5 + (frame.mid - 0.5) * 0.08);
  const radius = Math.hypot(size.width, size.height) * (0.32 + automation.zoom * 0.1);
  const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(
    0,
    colorFor(scene.palette, 0.18 + frame.bass * 0.22 + frame.beat * 0.18, 0, automation.hueShift + micro),
  );
  gradient.addColorStop(
    0.42,
    colorFor(scene.palette, 0.05 + frame.air * 0.18, 3, frame.centroid + automation.hueShift),
  );
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.globalCompositeOperation = "lighter";
  context.fillStyle = gradient;
  context.fillRect(0, 0, size.width, size.height);
  context.restore();
}

function drawSpectrogram(
  context: CanvasRenderingContext2D,
  size: { height: number; width: number },
  scene: VisualizerScene,
  frame: AudioFeatureFrame,
  frequencyData: AudioByteArray,
  history: Float32Array[],
  automation: ReturnType<typeof resolveAutomation>,
  micro: number,
) {
  const bins = downsampleFrequency(frequencyData, 192);
  history.push(bins);
  const maxLayers = Math.min(
    36,
    Math.max(10, Math.ceil(scene.spectrogram.historySize / 48)),
  );
  while (history.length > maxLayers) {
    history.shift();
  }

  const cx = size.width / 2;
  const cy = size.height / 2;
  const minDimension = Math.min(size.width, size.height);
  const time = frame.timestampMs * 0.001;
  const symmetry = scene.spectrogram.mirror ? 8 : 5;

  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = 18 + frame.air * 42;
  context.shadowColor = colorFor(scene.palette, 0.78, 2, frame.centroid + micro);

  history.forEach((layer, layerIndex) => {
    const age = (history.length - layerIndex) / Math.max(1, history.length);
    const freshness = 1 - age;
    const radiusBase = minDimension *
      (0.12 + age * 0.34 + frame.bass * 0.08 + automation.zoom * 0.035);
    const gain = scene.spectrogram.gain * scene.mapping.sensitivity;
    const rotation = time *
      (0.06 + scene.motion.speed * 0.045 + automation.rotation * 0.025) *
      (scene.spectrogram.mirror ? -1 : 1);

    for (let repeat = 0; repeat < symmetry; repeat += 1) {
      context.save();
      context.rotate((repeat / symmetry) * Math.PI * 2 + rotation + layerIndex * 0.015);
      context.beginPath();
      for (let index = 0; index <= layer.length; index += 1) {
        const wrappedIndex = index % layer.length;
        const raw = layer[wrappedIndex] ?? 0;
        const energy = Math.min(1.4, Math.pow(raw * gain, 0.62));
        const angle = (index / layer.length) * Math.PI * 2 +
          scene.spectrogram.tilt * age +
          Math.sin(time * 0.7 + index * 0.071) * scene.motion.warp * 0.05;
        const radius = radiusBase +
          energy * minDimension * (0.18 + freshness * 0.16) +
          Math.sin(index * 0.11 + time * 1.7) * minDimension * scene.motion.warp * 0.012 +
          micro * minDimension * 0.08;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * (0.72 + frame.mid * 0.28);
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.closePath();
      context.strokeStyle = colorFor(
        scene.palette,
        (0.22 + freshness * 0.72 + frame.rms * 0.35) * automation.brightness,
        layerIndex + repeat,
        automation.hueShift + frame.centroid + age,
      );
      context.lineWidth = 0.35 + freshness * 2.8 + frame.flux * 2.2;
      context.stroke();
      context.restore();
    }
  });

  const spokeBins = downsampleFrequency(frequencyData, 80);
  for (let index = 0; index < spokeBins.length; index += 2) {
    const energy = Math.pow(spokeBins[index] ?? 0, 0.64) * scene.spectrogram.gain;
    if (energy < 0.035) {
      continue;
    }
    const angle = (index / spokeBins.length) * Math.PI * 2 +
      time * scene.motion.speed * 0.09;
    const inner = minDimension * (0.08 + frame.bass * 0.08);
    const outer = inner + energy * minDimension * 0.48 * automation.zoom;
    context.strokeStyle = colorFor(
      scene.palette,
      energy * automation.brightness,
      index,
      frame.centroid + automation.hueShift + micro,
    );
    context.lineWidth = 0.4 + energy * 3.2 * automation.lineWeight;
    context.beginPath();
    context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    context.stroke();
  }

  context.restore();
}

function drawFrequencyBars(
  context: CanvasRenderingContext2D,
  size: { height: number; width: number },
  scene: VisualizerScene,
  frame: AudioFeatureFrame,
  frequencyData: AudioByteArray,
  automation: ReturnType<typeof resolveAutomation>,
  micro: number,
) {
  const bins = downsampleFrequency(frequencyData, 128);
  const cx = size.width / 2;
  const cy = size.height / 2;
  const minDimension = Math.min(size.width, size.height);
  const inner = minDimension * (0.13 + frame.bass * 0.08);
  const crownScale = minDimension * 0.42 * automation.zoom;

  context.save();
  context.translate(cx, cy);
  context.rotate(frame.timestampMs * 0.00008 * scene.motion.speed + micro);
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  bins.forEach((value, index) => {
    const energy = Math.min(1.35, Math.pow(value * scene.spectrogram.gain, 0.68) *
      scene.mapping.sensitivity);
    const angle = (index / bins.length) * Math.PI * 2;
    const height = Math.max(3, energy * crownScale + frame.beat * minDimension * 0.08);
    const startRadius = inner + Math.sin(index * 0.29 + frame.centroid * 3) * scene.motion.warp * 18;
    const endRadius = startRadius + height + micro * 90;
    context.strokeStyle = colorFor(
      scene.palette,
      energy * automation.brightness + frame.onset * 0.25,
      index,
      automation.hueShift + frame.centroid,
    );
    context.lineWidth = 0.7 + energy * 4.8 * automation.lineWeight;
    context.beginPath();
    context.moveTo(Math.cos(angle) * startRadius, Math.sin(angle) * startRadius);
    context.lineTo(Math.cos(angle) * endRadius, Math.sin(angle) * endRadius);
    context.stroke();
  });
  context.restore();
}

function drawRadialBloom(
  context: CanvasRenderingContext2D,
  size: { height: number; width: number },
  scene: VisualizerScene,
  frame: AudioFeatureFrame,
  frequencyData: AudioByteArray,
  primary: number,
  secondary: number,
  accent: number,
  automation: ReturnType<typeof resolveAutomation>,
  micro: number,
) {
  const bins = downsampleFrequency(frequencyData, 160);
  const cx = size.width / 2;
  const cy = size.height / 2;
  const minDimension = Math.min(size.width, size.height);
  const baseRadius = Math.min(size.width, size.height) * (0.15 + primary * 0.22) * automation.zoom;
  context.save();
  context.translate(cx, cy);
  context.rotate((scene.motion.rotation + automation.rotation + micro) * frame.timestampMs * 0.00018);
  context.globalCompositeOperation = "lighter";
  context.shadowBlur = 14 + frame.beat * 36;
  context.shadowColor = colorFor(scene.palette, 0.88, 1, frame.centroid + automation.hueShift);
  bins.forEach((value, index) => {
    const angle = (index / bins.length) * Math.PI * 2;
    const radius = baseRadius +
      Math.pow(value * scene.spectrogram.gain, 0.68) * minDimension * 0.36 +
      Math.sin(index * 0.17 + frame.timestampMs * 0.001) * scene.motion.warp * 18;
    const inner = baseRadius * (0.55 + secondary * 0.25);
    context.strokeStyle = colorFor(scene.palette, value * automation.brightness + accent * 0.35, index, automation.hueShift);
    context.lineWidth = 0.8 + value * 4 * automation.lineWeight;
    context.beginPath();
    context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    context.stroke();
  });
  context.restore();
}

function drawParticleField(
  context: CanvasRenderingContext2D,
  size: { height: number; width: number },
  scene: VisualizerScene,
  frame: AudioFeatureFrame,
  frequencyData: AudioByteArray,
  automation: ReturnType<typeof resolveAutomation>,
  micro: number,
) {
  const bins = downsampleFrequency(frequencyData, 64);
  const count = Math.round(scene.particles.count * (0.45 + automation.particleCount * 0.75));
  const cx = size.width / 2;
  const cy = size.height / 2;
  const minDimension = Math.min(size.width, size.height);
  const time = frame.timestampMs * 0.001;
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < count; index += 1) {
    const band = bins[index % bins.length] ?? 0;
    const seed = scene.motion.seed + index * 101;
    const orbit = pseudoNoise(seed, 0.2, band);
    const angle = orbit * Math.PI * 2 +
      time * (0.08 + scene.motion.speed * 0.05) +
      band * scene.motion.warp * 2.8;
    const radiusFromCenter = minDimension *
      (0.08 + pseudoNoise(seed + 7, 0.4, frame.centroid) * 0.52) *
      (0.68 + automation.zoom * 0.32 + band * 0.22);
    const wobble = Math.sin(time * 1.7 + index * 0.31) *
      minDimension *
      scene.motion.microFluctuation *
      0.018;
    const x = cx + Math.cos(angle) * (radiusFromCenter + wobble);
    const y = cy + Math.sin(angle * (0.82 + frame.mid * 0.2)) * (radiusFromCenter + wobble);
    const radius = scene.particles.size * (0.3 + band * 2.8 + frame.beat * 0.9 + micro);
    context.fillStyle = colorFor(scene.palette, band * automation.brightness, index, automation.hueShift);
    context.beginPath();
    context.arc(x, y, Math.max(0.4, radius), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawWaveformRibbon(
  context: CanvasRenderingContext2D,
  size: { height: number; width: number },
  scene: VisualizerScene,
  frame: AudioFeatureFrame,
  frequencyData: AudioByteArray,
  timeData: AudioByteArray,
  automation: ReturnType<typeof resolveAutomation>,
  micro: number,
) {
  const bins = downsampleFrequency(frequencyData, 96);
  const wave = downsampleTimeData(timeData, 220);
  const midY = size.height / 2;
  const time = frame.timestampMs * 0.001;
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";
  for (let ribbon = 0; ribbon < 5; ribbon += 1) {
    const phase = ribbon * 0.37;
    const spread = (ribbon - 2) * size.height * 0.075 * (0.4 + frame.mid);
    context.beginPath();
    wave.forEach((value, index) => {
      const spectral = bins[index % bins.length] ?? 0;
      const x = (index / (wave.length - 1)) * size.width;
      const waveY = value * size.height * (0.18 + automation.zoom * 0.08);
      const spectralY = Math.sin(index * 0.11 + time * scene.motion.speed + phase) *
        spectral *
        size.height *
        0.22 *
        scene.spectrogram.gain;
      const y = midY + spread + waveY + spectralY + micro * 110;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.strokeStyle = colorFor(
      scene.palette,
      (frame.rms + ribbon * 0.1) * automation.brightness,
      ribbon,
      automation.hueShift + frame.centroid + phase,
    );
    context.lineWidth = 0.9 + frame.peak * (4 + ribbon) * automation.lineWeight;
    context.shadowBlur = 10 + frame.air * 30;
    context.shadowColor = colorFor(scene.palette, 0.7, ribbon + 2, automation.hueShift);
    context.stroke();
  }
  context.restore();
}

function drawTunnel(
  context: CanvasRenderingContext2D,
  size: { height: number; width: number },
  scene: VisualizerScene,
  frame: AudioFeatureFrame,
  frequencyData: AudioByteArray,
  primary: number,
  secondary: number,
  automation: ReturnType<typeof resolveAutomation>,
  micro: number,
) {
  const bins = downsampleFrequency(frequencyData, 72);
  const cx = size.width / 2;
  const cy = size.height / 2;
  const maxRadius = Math.hypot(size.width, size.height) * 0.58;
  const time = frame.timestampMs * 0.001;

  context.save();
  context.translate(cx, cy);
  context.globalCompositeOperation = "lighter";
  for (let ring = 0; ring < 22; ring += 1) {
    const t = ring / 22;
    const bin = bins[(ring * 3) % bins.length] ?? 0;
    const radius = (1 - t) * maxRadius * (0.18 + automation.zoom * 0.72) +
      primary * 150 +
      Math.pow(bin * scene.spectrogram.gain, 0.7) * 110;
    const sides = 5 + Math.round(secondary * 7);
    context.save();
    context.rotate(time * scene.motion.speed * 0.07 + ring * 0.08 + micro);
    context.strokeStyle = colorFor(
      scene.palette,
      (bin + primary * 0.35) * automation.brightness,
      ring,
      automation.hueShift + t,
    );
    context.lineWidth = 0.7 + bin * 5 * automation.lineWeight;
    context.beginPath();
    for (let point = 0; point <= sides; point += 1) {
      const angle = (point / sides) * Math.PI * 2 +
        ring * 0.18 +
        Math.sin(time + point) * scene.motion.warp * 0.08;
      const localRadius = radius *
        (1 + Math.sin(point * 1.7 + time * 1.4) * scene.motion.warp * 0.04);
      const x = Math.cos(angle) * localRadius;
      const y = Math.sin(angle) * localRadius * (0.76 + frame.centroid * 0.2);
      if (point === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.stroke();
    context.restore();
  }
  context.restore();
}

function downsampleFrequency(data: AudioByteArray, count: number) {
  const bins = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index / count) * data.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / count) * data.length));
    let total = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      total += data[sourceIndex] ?? 0;
    }
    bins[index] = total / Math.max(1, end - start) / 255;
  }
  return bins;
}

function downsampleTimeData(data: AudioByteArray, count: number) {
  const samples = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index / count) * data.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / count) * data.length));
    let total = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      total += ((data[sourceIndex] ?? 128) - 128) / 128;
    }
    samples[index] = total / Math.max(1, end - start);
  }
  return samples;
}

function resolveAutomation(scene: VisualizerScene, frame: AudioFeatureFrame) {
  const values = {
    brightness: 0.72,
    feedback: scene.particles.trails,
    grain: 0,
    hueShift: 0,
    lineWeight: 1,
    particleCount: 1,
    rotation: scene.motion.rotation,
    zoom: scene.motion.zoom,
  };

  for (const automation of scene.automation) {
    const raw = selectAudioFeature(frame, automation.feature);
    const value = automation.invert ? 1 - raw : raw;
    const amount = value * automation.depth;
    if (automation.target === "brightness") {
      values.brightness += amount;
    } else if (automation.target === "feedback") {
      values.feedback = Math.min(0.96, values.feedback + amount * 0.2);
    } else if (automation.target === "grain") {
      values.grain += amount;
    } else if (automation.target === "hueShift") {
      values.hueShift += amount;
    } else if (automation.target === "lineWeight") {
      values.lineWeight += amount;
    } else if (automation.target === "particleCount") {
      values.particleCount += amount;
    } else if (automation.target === "rotation") {
      values.rotation += amount;
    } else if (automation.target === "zoom") {
      values.zoom += amount;
    }
  }

  return values;
}

function colorFor(
  palette: VisualizerPalette,
  energy: number,
  index: number,
  hueShift: number,
) {
  if (palette === "mono") {
    const lightness = Math.round(20 + Math.min(1, energy) * 76);
    return `hsl(0 0% ${lightness}%)`;
  }
  const hues = PALETTE_HUES[palette];
  const hue = (hues[index % hues.length] + hueShift * 140) % 360;
  const lightness = Math.round(34 + Math.min(1, energy) * 48);
  const alpha = Math.max(0.12, Math.min(0.96, 0.2 + energy * 0.8));
  return `hsl(${hue} 92% ${lightness}% / ${alpha})`;
}

function pseudoNoise(seed: number, time: number, energy: number) {
  return Math.sin(seed * 12.9898 + time * 78.233 + energy * 37.719) * 0.5 + 0.5;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
