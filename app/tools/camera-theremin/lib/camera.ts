import type {
  HandLandmarker,
  HandLandmarkerResult,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import {
  createHandMotionFrame,
  type HandMotionFrame,
  type MotionLandmark,
} from "@/app/tools/camera-theremin/lib/motion";

export type CameraTrackerStatus =
  | "idle"
  | "requesting-camera"
  | "loading-model"
  | "tracking"
  | "stopped";

export type CameraTrackerFrame = {
  frame: HandMotionFrame | null;
  timestampMs: number;
};

export type CameraMotionTracker = {
  stop: () => void;
};

type StartCameraMotionTrackerOptions = {
  facingMode?: "environment" | "user";
  onFrame: (frame: CameraTrackerFrame) => void;
  onStatus?: (status: CameraTrackerStatus) => void;
  video: HTMLVideoElement;
};

const MEDIAPIPE_VERSION = "0.10.35";
const VISION_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

export async function startCameraMotionTracker({
  facingMode = "user",
  onFrame,
  onStatus,
  video,
}: StartCameraMotionTrackerOptions): Promise<CameraMotionTracker> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera capture is not available in this browser.");
  }

  onStatus?.("requesting-camera");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode,
      frameRate: { ideal: 30, max: 60 },
      height: { ideal: 720 },
      width: { ideal: 960 },
    },
  });

  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await waitForVideoMetadata(video);
  await video.play();

  onStatus?.("loading-model");
  const handLandmarker = await createHandLandmarker();
  onStatus?.("tracking");

  let animationFrame = 0;
  let stopped = false;
  let lastVideoTime = -1;

  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    window.cancelAnimationFrame(animationFrame);
    for (const track of stream.getTracks()) {
      track.stop();
    }
    handLandmarker.close();
    video.pause();
    video.srcObject = null;
    onStatus?.("stopped");
  };

  function tick() {
    if (stopped) {
      return;
    }

    const timestampMs = performance.now();
    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.currentTime !== lastVideoTime
    ) {
      lastVideoTime = video.currentTime;
      onFrame({
        frame: createFrameFromResult(
          handLandmarker.detectForVideo(video, timestampMs),
        ),
        timestampMs,
      });
    }

    animationFrame = window.requestAnimationFrame(tick);
  }

  animationFrame = window.requestAnimationFrame(tick);

  return { stop };
}

export function createFrameFromResult(
  result: HandLandmarkerResult,
): HandMotionFrame | null {
  const landmarks = result.landmarks[0]?.map(toMotionLandmark) ?? [];
  const handedness = result.handedness[0]?.[0];

  return createHandMotionFrame({
    handedness: handedness?.categoryName ?? null,
    landmarks,
    score: handedness?.score ?? null,
  });
}

async function createHandLandmarker(): Promise<HandLandmarker> {
  const { FilesetResolver, HandLandmarker } = await import(
    "@mediapipe/tasks-vision"
  );
  const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_LANDMARKER_MODEL_URL,
    },
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
    numHands: 1,
    runningMode: "VIDEO",
  });
}

function toMotionLandmark(landmark: NormalizedLandmark): MotionLandmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
  };
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("error", handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Camera stream could not load."));
    };

    video.addEventListener("loadedmetadata", handleLoaded, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}
