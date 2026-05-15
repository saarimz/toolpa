import {
  createDefaultVisualizerScene,
  VisualizerSceneSchema,
  type VisualizerScene,
} from "@/lib/visualizers/schema";
import {
  createSilentFeatureFrame,
  selectAudioFeature,
  type AudioFeatureFrame,
} from "@/lib/visualizers/audio-features";

export const defaultDocument = createDefaultVisualizerScene(
  "fullscreen spectral bloom with lattice trails, bass pulses, and micro fluctuations",
);

export type VisualFrameRenderSummary = {
  brightness: number;
  hueShift: number;
  mode: VisualizerScene["mode"];
  particleScale: number;
  primaryDriver: number;
  zoom: number;
};

export function renderVisualFrame(
  document: VisualizerScene = defaultDocument,
  frame: AudioFeatureFrame = createSilentFeatureFrame(),
): VisualFrameRenderSummary {
  const scene = VisualizerSceneSchema.parse(document);
  const primaryDriver = selectAudioFeature(frame, scene.mapping.primaryFeature);
  const secondaryDriver = selectAudioFeature(frame, scene.mapping.secondaryFeature);
  const beatDriver = Math.max(frame.beat, frame.onset);
  const micro = Math.sin(scene.motion.seed + frame.timestampMs * 0.017) *
    scene.motion.microFluctuation *
    0.08;

  return {
    brightness: clamp01(0.25 + primaryDriver * scene.mapping.sensitivity + beatDriver * 0.35 + micro),
    hueShift: clamp01(secondaryDriver + frame.centroid * 0.5),
    mode: scene.mode,
    particleScale: clamp01(0.2 + frame.flux * 0.65 + beatDriver * 0.35),
    primaryDriver,
    zoom: clamp01(0.25 + scene.motion.zoom / 4 + frame.bass * 0.35 + micro),
  };
}

export const renderId = "audio-visualizer:visual-scene";

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
