import {
  createDefaultVisualizerScene,
  VisualizerSceneSchema,
  type VisualizerFeature,
  type VisualizerMode,
  type VisualizerPalette,
  type VisualizerScene,
} from "@/lib/visualizers/schema";

export function buildAudioVisualizerSystemPrompt() {
  return [
    "You are the Audio Reactive Visualizer L1 visual-scene agent inside toolpa.",
    "Return one valid VisualizerScene JSON object only.",
    "The scene must be audio-reactive, not random: map FFT bands, waveform RMS, spectral centroid, spectral flux, onset, and beat pulse into bounded visual patterns and parameters.",
    "Use built-in live-audio, microphone, and uploaded audio-file sources as live AnalyserNode inputs.",
    "Keep controls bounded for performance projection and fullscreen use.",
  ].join("\n");
}

export function buildAudioVisualizerPrompt({
  prompt,
  scene,
}: {
  prompt: string;
  scene: VisualizerScene;
}) {
  return [
    "tool: audio-visualizer",
    `visual request: ${prompt || "make an audio-reactive performance visualizer"}`,
    `current visual scene: ${JSON.stringify(scene)}`,
    "Preserve a valid visual-scene document and keep audio features visible in metadata.rationale.",
  ].join("\n");
}

export function createVisualizerSceneFromPrompt(
  prompt: string,
  currentScene: VisualizerScene = createDefaultVisualizerScene(prompt),
): VisualizerScene {
  const text = prompt.toLowerCase();
  const mode = inferMode(text, currentScene.mode);
  const palette = inferPalette(text, currentScene.palette);
  const primaryFeature = inferPrimaryFeature(text, currentScene.mapping.primaryFeature);
  const intensity = inferIntensity(text);
  const microFluctuation = /\b(micro|jitter|twitch|fluctuat|alive|organic|human)\b/.test(text)
    ? Math.max(currentScene.motion.microFluctuation, 0.28)
    : currentScene.motion.microFluctuation;

  return VisualizerSceneSchema.parse({
    ...currentScene,
    mode,
    palette,
    prompt,
    source: inferSource(text, currentScene.source),
    mapping: {
      ...currentScene.mapping,
      primaryFeature,
      secondaryFeature: inferSecondaryFeature(text, currentScene.mapping.secondaryFeature),
      accentFeature: /\b(beat|kick|onset|hit|transient|pulse)\b/.test(text)
        ? "onset"
        : currentScene.mapping.accentFeature,
      sensitivity: clamp(currentScene.mapping.sensitivity * intensity.sensitivity, 0.1, 4),
      reactivity: clamp(currentScene.mapping.reactivity + intensity.reactivity, 0, 1),
    },
    motion: {
      ...currentScene.motion,
      speed: clamp(currentScene.motion.speed * intensity.speed, 0, 4),
      rotation: /\b(still|minimal|static)\b/.test(text)
        ? 0
        : clamp(currentScene.motion.rotation + intensity.rotation, -2, 2),
      warp: clamp(currentScene.motion.warp + intensity.warp, 0, 1),
      microFluctuation,
      seed: stablePromptSeed(prompt, currentScene.motion.seed),
    },
    particles: {
      ...currentScene.particles,
      count: /\b(dense|crowd|stars|particles|dust|field)\b/.test(text)
        ? Math.max(currentScene.particles.count, 420)
        : currentScene.particles.count,
      trails: /\b(trail|smear|afterimage|persistence|feedback)\b/.test(text)
        ? Math.max(currentScene.particles.trails, 0.82)
        : currentScene.particles.trails,
    },
    spectrogram: {
      ...currentScene.spectrogram,
      mirror: /\b(mirror|symmetry|symmetrical|kaleidoscope)\b/.test(text),
      gain: clamp(currentScene.spectrogram.gain * intensity.sensitivity, 0.25, 4),
    },
    metadata: {
      rationale: [
        `Mode ${mode} with ${palette} palette.`,
        `Primary driver ${primaryFeature}; secondary driver ${inferSecondaryFeature(text, currentScene.mapping.secondaryFeature)}.`,
        "FFT bands, waveform RMS, spectral centroid, flux, onset, and beat pulse remain the visual control inputs.",
      ].join(" "),
      tags: ["audio-reactive", mode, palette],
    },
  });
}

function inferSource(text: string, fallback: VisualizerScene["source"]): VisualizerScene["source"] {
  if (/\b(mic|microphone)\b/.test(text)) {
    return "microphone";
  }
  if (/\b(file|upload|recorded|sample|track|song|stem|loop)\b/.test(text)) {
    return "audio-file";
  }
  if (/\b(voice|room|ambient|input)\b/.test(text)) {
    return "microphone";
  }
  if (/\b(live|generated|generate|synth|oscillator|tone|drone|self-playing)\b/.test(text)) {
    return "live-audio";
  }
  return fallback;
}

function inferMode(text: string, fallback: VisualizerMode): VisualizerMode {
  if (/\b(spectrogram|sonogram|waterfall|frequency history|spectral bloom|spectral fabric|kaleidoscope|lattice)\b/.test(text)) {
    return "spectrogram";
  }
  if (/\b(bar|eq|equalizer|meter)\b/.test(text)) {
    return "frequency-bars";
  }
  if (/\b(radial|ring|circle|mandala|orbital)\b/.test(text)) {
    return "radial-bloom";
  }
  if (/\b(particle|dust|stars|field|constellation)\b/.test(text)) {
    return "particle-field";
  }
  if (/\b(waveform|oscilloscope|ribbon|scope)\b/.test(text)) {
    return "waveform-ribbon";
  }
  if (/\b(tunnel|vortex|corridor|warp)\b/.test(text)) {
    return "tunnel";
  }
  return fallback;
}

function inferPalette(text: string, fallback: VisualizerPalette): VisualizerPalette {
  if (/\b(mono|white|black|gray|grey|minimal)\b/.test(text)) {
    return "mono";
  }
  if (/\b(neon|laser|club|cyber)\b/.test(text)) {
    return "neon";
  }
  if (/\b(ember|fire|warm|red|orange)\b/.test(text)) {
    return "ember";
  }
  if (/\b(ultraviolet|violet|purple|uv)\b/.test(text)) {
    return "ultraviolet";
  }
  if (/\b(sea|glass|aqua|cyan|green)\b/.test(text)) {
    return "sea-glass";
  }
  if (/\b(prism|rainbow|iridescent|spectrum)\b/.test(text)) {
    return "prism";
  }
  return fallback;
}

function inferPrimaryFeature(text: string, fallback: VisualizerFeature): VisualizerFeature {
  if (/\b(sub|bass|kick|low end|low-end)\b/.test(text)) {
    return "bass";
  }
  if (/\b(vocal|voice|lead|midrange|body)\b/.test(text)) {
    return "mid";
  }
  if (/\b(hat|hats|cymbal|air|sparkle|high)\b/.test(text)) {
    return "air";
  }
  if (/\b(bright|centroid|timbre|color)\b/.test(text)) {
    return "centroid";
  }
  if (/\b(transient|onset|hit|impact|beat)\b/.test(text)) {
    return "onset";
  }
  if (/\b(flux|change|movement|variation)\b/.test(text)) {
    return "flux";
  }
  return fallback;
}

function inferSecondaryFeature(text: string, fallback: VisualizerFeature): VisualizerFeature {
  if (/\b(bright|centroid|timbre|color|tone)\b/.test(text)) {
    return "centroid";
  }
  if (/\b(energy|loud|volume|rms)\b/.test(text)) {
    return "rms";
  }
  if (/\b(beat|pulse|kick)\b/.test(text)) {
    return "beat";
  }
  return fallback;
}

function inferIntensity(text: string) {
  if (/\b(calm|slow|minimal|subtle|ambient|soft)\b/.test(text)) {
    return { reactivity: -0.18, rotation: -0.08, sensitivity: 0.82, speed: 0.72, warp: -0.08 };
  }
  if (/\b(aggressive|intense|fast|rave|chaotic|explosive|hard)\b/.test(text)) {
    return { reactivity: 0.16, rotation: 0.12, sensitivity: 1.32, speed: 1.35, warp: 0.18 };
  }
  return { reactivity: 0, rotation: 0, sensitivity: 1, speed: 1, warp: 0 };
}

function stablePromptSeed(prompt: string, fallback: number) {
  if (!prompt.trim()) {
    return fallback;
  }
  let hash = 2166136261;
  for (const char of prompt) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.max(1, Math.abs(hash) % 999_999);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
