import { MAX_BPM, MIN_BPM } from "@/lib/music/context";

export type TransportLike = {
  bpm: { value: number };
  swing: number;
  swingSubdivision: string;
  start: () => void;
  stop: () => void;
  cancel: () => void;
};

export type TransportController = {
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  start: () => void;
  stop: () => void;
};

export function createTransportController(
  transport: TransportLike,
): TransportController {
  return {
    setBpm(bpm) {
      transport.bpm.value = clamp(bpm, MIN_BPM, MAX_BPM);
    },
    setSwing(swing) {
      transport.swing = clamp(swing, 0, 0.5);
      transport.swingSubdivision = "16n";
    },
    start() {
      transport.start();
    },
    stop() {
      transport.stop();
      transport.cancel();
    },
  };
}

export async function getToneTransportController(): Promise<TransportController> {
  const Tone = await import("tone");
  return createTransportController(Tone.getTransport() as unknown as TransportLike);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
