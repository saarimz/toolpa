import type {
  Category,
  FaceLandmarker,
  FaceLandmarkerResult,
  FilesetResolver,
  GestureRecognizer,
  GestureRecognizerResult,
  HandLandmarker,
  HandLandmarkerResult,
  NormalizedLandmark,
  PoseLandmarker,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

import {
  createHandMotionFrame,
  createMotionPointFrame,
  createThereminHandsFrame,
  createThereminMotionFrame,
  type HandMotionFrame,
  type MotionConnection,
  type MotionLandmark,
  type ThereminHandsFrame,
  type TrackingMode,
} from "@/app/tools/camera-theremin/lib/motion";

export type CameraTrackerStatus =
  | "idle"
  | "requesting-camera"
  | "loading-model"
  | "tracking"
  | "stopped";

export type CameraTrackerFrame = {
  frame: ThereminHandsFrame | null;
  timestampMs: number;
  trackingMode: TrackingMode;
};

export type CameraMotionTracker = {
  stop: () => void;
};

type StartCameraMotionTrackerOptions = {
  facingMode?: "environment" | "user";
  onFrame: (frame: CameraTrackerFrame) => void;
  onStatus?: (status: CameraTrackerStatus) => void;
  trackingMode?: TrackingMode;
  video: HTMLVideoElement;
};

type VideoFrameDetector = {
  close: () => void;
  detectFrame: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => ThereminHandsFrame | null;
};

type FilesetResolverClass = typeof FilesetResolver;
type VisionFileset = Awaited<
  ReturnType<FilesetResolverClass["forVisionTasks"]>
>;

const MEDIAPIPE_VERSION = "0.10.35";
const VISION_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const HAND_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
const GESTURE_RECOGNIZER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task";
const FACE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const POSE_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const ignoredMediaPipeConsoleMessages = [
  "Created TensorFlow Lite XNNPACK delegate for CPU.",
] as const;

const handConnectionPairs = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
] as const satisfies readonly MotionConnection[];

const faceConnectionPairs = [
  [33, 133],
  [362, 263],
  [61, 13],
  [13, 291],
  [291, 14],
  [14, 61],
  [10, 1],
  [1, 152],
  [234, 454],
] as const satisfies readonly MotionConnection[];

const eyeConnectionPairs = [
  [33, 133],
  [159, 145],
  [362, 263],
  [386, 374],
  [468, 469],
  [473, 474],
] as const satisfies readonly MotionConnection[];

const poseConnectionPairs = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
] as const satisfies readonly MotionConnection[];

let visionFilesetPromise: Promise<VisionFileset> | null = null;

export async function startCameraMotionTracker({
  facingMode = "user",
  onFrame,
  onStatus,
  trackingMode = "hands",
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
  const detector = await createFrameDetector(trackingMode);
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
    detector.close();
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
        frame: detector.detectFrame(video, timestampMs),
        timestampMs,
        trackingMode,
      });
    }

    animationFrame = window.requestAnimationFrame(tick);
  }

  animationFrame = window.requestAnimationFrame(tick);

  return { stop };
}

export function createFrameFromResult(
  result: HandLandmarkerResult,
): ThereminHandsFrame | null {
  return createFrameFromHandLandmarkerResult(result);
}

export function createFrameFromHandLandmarkerResult(
  result: HandLandmarkerResult,
): ThereminHandsFrame | null {
  const hands = result.landmarks
    .map((landmarks, index) =>
      createHandMotionFrame({
        connections: handConnectionPairs,
        handedness: result.handedness[index]?.[0]?.categoryName ?? null,
        landmarks: landmarks.map(toMotionLandmark),
        score: result.handedness[index]?.[0]?.score ?? null,
        source: "hands",
      }),
    )
    .filter(isHandMotionFrame);

  return createThereminHandsFrame(hands, "hands");
}

export function createFrameFromGestureRecognizerResult(
  result: GestureRecognizerResult,
): ThereminHandsFrame | null {
  const hands = result.landmarks
    .map((landmarks, index) => {
      const gesture = result.gestures[index]?.[0] ?? null;
      const frame = createHandMotionFrame({
        connections: handConnectionPairs,
        gesture: gesture?.categoryName ?? null,
        handedness: result.handedness[index]?.[0]?.categoryName ?? null,
        label: formatGestureLabel(gesture),
        landmarks: landmarks.map(toMotionLandmark),
        score: Math.max(
          result.handedness[index]?.[0]?.score ?? 0,
          gesture?.score ?? 0,
        ),
        source: "gestures",
      });

      return frame
        ? {
            ...frame,
            pinch: mapGestureToPinch(gesture, frame.pinch),
          }
        : null;
    })
    .filter(isHandMotionFrame);

  return createThereminHandsFrame(hands, "gestures");
}

export function createFrameFromFaceLandmarkerResult(
  result: FaceLandmarkerResult,
  trackingMode: Extract<TrackingMode, "eyes" | "face"> = "face",
): ThereminHandsFrame | null {
  const landmarks = result.faceLandmarks[0]?.map(toMotionLandmark) ?? null;
  if (!landmarks) {
    return null;
  }

  return trackingMode === "eyes"
    ? createEyesFrame(result, landmarks)
    : createFaceFrame(result, landmarks);
}

export function createFrameFromPoseLandmarkerResult(
  result: PoseLandmarkerResult,
): ThereminHandsFrame | null {
  const pose = result.landmarks[0]?.map(toMotionLandmark) ?? null;
  if (!pose) {
    return null;
  }

  const rightWrist = pose[16] ?? pose[0];
  const leftWrist = pose[15] ?? pose[0];
  if (!rightWrist || !leftWrist) {
    return null;
  }

  const shoulderSpread = landmarkDistance(pose[11], pose[12]) ?? 0.12;

  return createThereminMotionFrame({
    source: "body",
    points: [
      createMotionPointFrame({
        connections: poseConnectionPairs,
        label: "right wrist",
        landmarks: pose,
        pinch: shoulderSpread,
        role: "pitch",
        source: "body",
        x: rightWrist.x,
        y: rightWrist.y,
        z: rightWrist.z ?? 0,
      }),
      createMotionPointFrame({
        connections: poseConnectionPairs,
        label: "left wrist",
        landmarks: pose,
        pinch: shoulderSpread,
        role: "volume",
        source: "body",
        x: leftWrist.x,
        y: leftWrist.y,
        z: leftWrist.z ?? 0,
      }),
    ],
  });
}

async function createFrameDetector(
  trackingMode: TrackingMode,
): Promise<VideoFrameDetector> {
  const mediaPipe = await import("@mediapipe/tasks-vision");
  const vision = await getVisionFileset(mediaPipe.FilesetResolver);

  if (trackingMode === "gestures") {
    return createGestureDetector(mediaPipe.GestureRecognizer, vision);
  }
  if (trackingMode === "face" || trackingMode === "eyes") {
    return createFaceDetector(mediaPipe.FaceLandmarker, vision, trackingMode);
  }
  if (trackingMode === "body") {
    return createPoseDetector(mediaPipe.PoseLandmarker, vision);
  }

  return createHandDetector(mediaPipe.HandLandmarker, vision);
}

async function createHandDetector(
  HandLandmarkerClass: typeof HandLandmarker,
  vision: VisionFileset,
): Promise<VideoFrameDetector> {
  const handLandmarker = await HandLandmarkerClass.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_LANDMARKER_MODEL_URL,
    },
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
    numHands: 2,
    runningMode: "VIDEO",
  });

  return {
    close: () => handLandmarker.close(),
    detectFrame: (video, timestampMs) =>
      runWithMediaPipeConsoleNoiseSuppressed(() =>
        createFrameFromHandLandmarkerResult(
          handLandmarker.detectForVideo(video, timestampMs),
        ),
      ),
  };
}

async function createGestureDetector(
  GestureRecognizerClass: typeof GestureRecognizer,
  vision: VisionFileset,
): Promise<VideoFrameDetector> {
  const gestureRecognizer = await GestureRecognizerClass.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath: GESTURE_RECOGNIZER_MODEL_URL,
      },
      cannedGesturesClassifierOptions: {
        scoreThreshold: 0.35,
      },
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.45,
      numHands: 2,
      runningMode: "VIDEO",
    },
  );

  return {
    close: () => gestureRecognizer.close(),
    detectFrame: (video, timestampMs) =>
      runWithMediaPipeConsoleNoiseSuppressed(() =>
        createFrameFromGestureRecognizerResult(
          gestureRecognizer.recognizeForVideo(video, timestampMs),
        ),
      ),
  };
}

async function createFaceDetector(
  FaceLandmarkerClass: typeof FaceLandmarker,
  vision: VisionFileset,
  trackingMode: Extract<TrackingMode, "eyes" | "face">,
): Promise<VideoFrameDetector> {
  const faceLandmarker = await FaceLandmarkerClass.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
    },
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.45,
    numFaces: 1,
    outputFaceBlendshapes: true,
    runningMode: "VIDEO",
  });

  return {
    close: () => faceLandmarker.close(),
    detectFrame: (video, timestampMs) =>
      runWithMediaPipeConsoleNoiseSuppressed(() =>
        createFrameFromFaceLandmarkerResult(
          faceLandmarker.detectForVideo(video, timestampMs),
          trackingMode,
        ),
      ),
  };
}

async function createPoseDetector(
  PoseLandmarkerClass: typeof PoseLandmarker,
  vision: VisionFileset,
): Promise<VideoFrameDetector> {
  const poseLandmarker = await PoseLandmarkerClass.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_LANDMARKER_MODEL_URL,
    },
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
    numPoses: 1,
    runningMode: "VIDEO",
  });

  return {
    close: () => poseLandmarker.close(),
    detectFrame: (video, timestampMs) =>
      runWithMediaPipeConsoleNoiseSuppressed(() =>
        createFrameFromPoseLandmarkerResult(
          poseLandmarker.detectForVideo(video, timestampMs),
        ),
      ),
  };
}

async function getVisionFileset(
  FilesetResolverClass: FilesetResolverClass,
): Promise<VisionFileset> {
  visionFilesetPromise ??=
    FilesetResolverClass.forVisionTasks(VISION_WASM_URL);

  return visionFilesetPromise;
}

type ConsoleMethod = (...data: unknown[]) => void;

export function runWithMediaPipeConsoleNoiseSuppressed<T>(run: () => T): T {
  const originalError = console.error;
  const originalInfo = console.info;
  const originalWarn = console.warn;

  console.error = createMediaPipeConsoleFilter(originalError);
  console.info = createMediaPipeConsoleFilter(originalInfo);
  console.warn = createMediaPipeConsoleFilter(originalWarn);

  try {
    return run();
  } finally {
    console.error = originalError;
    console.info = originalInfo;
    console.warn = originalWarn;
  }
}

function createMediaPipeConsoleFilter(original: ConsoleMethod): ConsoleMethod {
  return (...data) => {
    if (shouldSuppressMediaPipeConsoleMessage(data)) {
      return;
    }

    original.call(console, ...data);
  };
}

function shouldSuppressMediaPipeConsoleMessage(data: readonly unknown[]) {
  return data.some(
    (entry) =>
      typeof entry === "string" &&
      ignoredMediaPipeConsoleMessages.some((message) => entry.includes(message)),
  );
}

function createFaceFrame(
  result: FaceLandmarkerResult,
  landmarks: MotionLandmark[],
) {
  const nose = landmarks[1] ?? averageLandmarks(landmarks, [10, 152]);
  if (!nose) {
    return null;
  }

  const mouthOpen = getMouthOpen(result, landmarks);
  const smile = clamp01(
    (getBlendshapeScore(result, "mouthSmileLeft") +
      getBlendshapeScore(result, "mouthSmileRight")) *
      1.4,
  );
  const expression = Math.max(smile, mouthOpen);

  return createThereminMotionFrame({
    source: "face",
    points: [
      createMotionPointFrame({
        connections: faceConnectionPairs,
        label: "head",
        landmarks,
        pinch: 0.15,
        role: "pitch",
        source: "face",
        x: nose.x,
        y: nose.y,
        z: nose.z ?? 0,
      }),
      createMotionPointFrame({
        connections: faceConnectionPairs,
        label: "mouth",
        landmarks,
        pinch: 0.035 + mouthOpen * 0.26,
        role: "volume",
        source: "face",
        x: expression,
        y: 1 - mouthOpen,
        z: nose.z ?? 0,
      }),
    ],
  });
}

function createEyesFrame(
  result: FaceLandmarkerResult,
  landmarks: MotionLandmark[],
) {
  const irisCenter =
    averageLandmarks(landmarks, [468, 473]) ??
    averageLandmarks(landmarks, [33, 133, 362, 263]);
  if (!irisCenter) {
    return null;
  }

  const eyeOpen = getEyeOpen(result, landmarks);

  return createThereminMotionFrame({
    source: "eyes",
    points: [
      createMotionPointFrame({
        connections: eyeConnectionPairs,
        label: "gaze",
        landmarks,
        pinch: 0.16,
        role: "pitch",
        source: "eyes",
        x: irisCenter.x,
        y: irisCenter.y,
        z: irisCenter.z ?? 0,
      }),
      createMotionPointFrame({
        connections: eyeConnectionPairs,
        label: "blink",
        landmarks,
        pinch: 0.035 + eyeOpen * 0.26,
        role: "volume",
        source: "eyes",
        x: irisCenter.x,
        y: 1 - eyeOpen,
        z: irisCenter.z ?? 0,
      }),
    ],
  });
}

function getMouthOpen(
  result: FaceLandmarkerResult,
  landmarks: MotionLandmark[],
) {
  const blendshapeOpen = getBlendshapeScore(result, "jawOpen");
  const landmarkOpen = landmarkDistance(landmarks[13], landmarks[14]) ?? 0;

  return clamp01(Math.max(blendshapeOpen, landmarkOpen * 8));
}

function getEyeOpen(
  result: FaceLandmarkerResult,
  landmarks: MotionLandmark[],
) {
  const blink = Math.max(
    getBlendshapeScore(result, "eyeBlinkLeft"),
    getBlendshapeScore(result, "eyeBlinkRight"),
  );
  const leftAspect = getEyeAspect(landmarks[33], landmarks[133], landmarks[159], landmarks[145]);
  const rightAspect = getEyeAspect(
    landmarks[362],
    landmarks[263],
    landmarks[386],
    landmarks[374],
  );
  const aspectOpen = Math.max(leftAspect, rightAspect);

  return clamp01(Math.max(1 - blink, aspectOpen));
}

function getEyeAspect(
  outer: MotionLandmark | undefined,
  inner: MotionLandmark | undefined,
  top: MotionLandmark | undefined,
  bottom: MotionLandmark | undefined,
) {
  const width = landmarkDistance(outer, inner) ?? 0;
  const height = landmarkDistance(top, bottom) ?? 0;

  if (width <= 0) {
    return 0;
  }

  return clamp01((height / width) * 5.4);
}

function getBlendshapeScore(
  result: FaceLandmarkerResult,
  categoryName: string,
) {
  return (
    result.faceBlendshapes[0]?.categories.find(
      (category) => category.categoryName === categoryName,
    )?.score ?? 0
  );
}

function mapGestureToPinch(
  gesture: Category | null,
  fallbackPinch: number,
) {
  if (!gesture || gesture.score < 0.35) {
    return fallbackPinch;
  }

  if (gesture.categoryName === "Closed_Fist") {
    return 0.02;
  }
  if (gesture.categoryName === "Thumb_Down") {
    return 0.045;
  }
  if (gesture.categoryName === "Open_Palm") {
    return 0.26;
  }
  if (gesture.categoryName === "Victory" || gesture.categoryName === "ILoveYou") {
    return 0.22;
  }
  if (gesture.categoryName === "Thumb_Up") {
    return 0.19;
  }
  if (gesture.categoryName === "Pointing_Up") {
    return 0.14;
  }

  return fallbackPinch;
}

function formatGestureLabel(gesture: Category | null) {
  if (!gesture || gesture.categoryName === "None") {
    return undefined;
  }

  return gesture.categoryName.replaceAll("_", " ").toLowerCase();
}

function isHandMotionFrame(
  frame: HandMotionFrame | null,
): frame is HandMotionFrame {
  return frame !== null;
}

function averageLandmarks(
  landmarks: MotionLandmark[],
  indexes: readonly number[],
) {
  const points = indexes
    .map((index) => landmarks[index])
    .filter(isMotionLandmark);
  if (points.length === 0) {
    return null;
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z:
      points.reduce((sum, point) => sum + (point.z ?? 0), 0) /
      points.length,
  } satisfies MotionLandmark;
}

function isMotionLandmark(
  landmark: MotionLandmark | undefined,
): landmark is MotionLandmark {
  return landmark !== undefined;
}

function landmarkDistance(
  left: MotionLandmark | undefined,
  right: MotionLandmark | undefined,
) {
  if (!left || !right) {
    return null;
  }

  return Math.sqrt(
    (left.x - right.x) ** 2 +
      (left.y - right.y) ** 2 +
      ((left.z ?? 0) - (right.z ?? 0)) ** 2,
  );
}

function toMotionLandmark(landmark: NormalizedLandmark): MotionLandmark {
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
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
