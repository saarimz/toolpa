import {
  type Pattern,
  type Track,
  createPattern,
  createStep,
  createTrack,
} from "@/lib/pattern/schema";

export function createIntelligenceSamplerPattern(
  sampleId: string,
  sampleName: string,
  sampleRole: Track["role"] = "unknown",
): Pattern {
  const steps = Array.from({ length: 16 }, (_, index) =>
    createStep({
      active: [0, 4, 8, 12].includes(index),
      velocity: index === 8 ? 0.88 : 1,
      slot: index % 8,
    }),
  );

  const tracks = Array.from({ length: 8 }, (_, slot) =>
    createTrack({
      id: `slice-${slot + 1}`,
      name: `slice ${slot + 1}`,
      sampleId,
      role: sampleRole,
      slot,
      steps: steps.map((step, stepIndex) => ({
        ...step,
        active: step.active && step.slot === slot,
        slot,
        velocity: stepIndex === 8 ? 0.88 : 1,
      })),
    }),
  );

  return createPattern({
    id: "intelligence-sampler-default",
    name: "intelligence sampler init",
    bpm: 140,
    bars: 1,
    stepsPerBar: 16,
    tracks,
    metadata: {
      toolSlug: "intelligence-sampler",
      sourceSampleId: sampleId,
      sourceSampleName: sampleName,
      createdBy: "manual",
      tags: ["sample", sampleRole],
    },
  });
}
