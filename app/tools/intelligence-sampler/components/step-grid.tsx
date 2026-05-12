"use client";

import { useMemo } from "react";

import {
  getPatternStepAgency,
  getPatternStepAgencyClassName,
  PatternStepAgencyBadge,
  usePatternStepAgency,
} from "@/components/pattern-step-agency";
import { cn } from "@/lib/utils";
import { useIntelligenceSamplerStore } from "@/app/tools/intelligence-sampler/store";
import { getScaleDefinition } from "@/lib/music/scale-catalog";
import { useGlobalMusicContextStore } from "@/lib/music/use-global-music-context";

export function StepGrid() {
  const pattern = useIntelligenceSamplerStore((state) => state.pattern);
  const selectedStep = useIntelligenceSamplerStore((state) => state.selectedStep);
  const toggleStep = useIntelligenceSamplerStore((state) => state.toggleStep);
  const updateTrack = useIntelligenceSamplerStore((state) => state.updateTrack);
  const updateStep = useIntelligenceSamplerStore((state) => state.updateStep);
  const setSelectedStep = useIntelligenceSamplerStore((state) => state.setSelectedStep);
  const musicalContext = useGlobalMusicContextStore((state) => state.context);
  const currentScale = getScaleDefinition(musicalContext.key.scaleId);
  const agencyEvents = usePatternStepAgency(pattern.id);

  const selected = useMemo(() => {
    if (!selectedStep) {
      return null;
    }

    const track = pattern.tracks.find((candidate) => candidate.id === selectedStep.trackId);
    const step = track?.steps[selectedStep.stepIndex];
    return track && step ? { track, step, index: selectedStep.stepIndex } : null;
  }, [pattern.tracks, selectedStep]);

  return (
    <section className="grid min-h-0 flex-1 grid-cols-1 border-b border-zinc-800 lg:grid-cols-[1fr_280px]">
      <div className="overflow-x-auto p-4">
        <div className="min-w-[920px] space-y-2">
          {pattern.tracks.map((track) => (
            <div key={track.id} className="grid grid-cols-[80px_1fr] items-center gap-3">
              <div className="truncate text-xs text-zinc-500">{track.name}</div>
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${pattern.stepsPerBar * pattern.bars}, minmax(0, 1fr))`,
                }}
              >
                {track.steps.map((step, stepIndex) => {
                  const beat = stepIndex % 4 === 0;
                  const isSelected =
                    selectedStep?.trackId === track.id && selectedStep.stepIndex === stepIndex;
                  const agencyEvent = getPatternStepAgency(agencyEvents, {
                    patternId: pattern.id,
                    slot: step.slot ?? track.slot,
                    stepIndex,
                    trackId: track.id,
                  });

                  return (
                    <button
                      key={`${track.id}-${stepIndex}`}
                      type="button"
                      title={`${track.name} step ${stepIndex + 1}`}
                      onClick={() => toggleStep(track.id, stepIndex)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setSelectedStep({ trackId: track.id, stepIndex });
                      }}
                      className={cn(
                        "relative h-8 overflow-hidden border text-[10px] transition",
                        beat ? "border-zinc-600" : "border-zinc-800",
                        step.active
                          ? "bg-zinc-100 text-zinc-950"
                          : "bg-zinc-950 text-zinc-700 hover:bg-zinc-900",
                        isSelected && "outline outline-1 outline-zinc-100",
                        getPatternStepAgencyClassName(agencyEvent),
                      )}
                    >
                      <PatternStepAgencyBadge event={agencyEvent} />
                      {step.active ? step.slot ?? track.slot ?? 0 : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <aside className="border-t border-zinc-800 p-4 lg:border-l lg:border-t-0">
        <div className="mb-3 text-xs text-zinc-500">step editor</div>
        {selected ? (
          <div className="space-y-4">
            <div className="text-sm text-zinc-200">
              {selected.track.name} / {selected.index + 1}
            </div>
            <label className="block text-xs text-zinc-500">
              track choke group
              <select
                className="mt-2 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                value={selected.track.chokeGroup ?? ""}
                onChange={(event) =>
                  updateTrack(selected.track.id, {
                    chokeGroup: event.target.value || undefined,
                  })
                }
              >
                <option value="">none</option>
                <option value="main">main</option>
                <option value="hats">hats</option>
                <option value="fills">fills</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              velocity
              <input
                className="mt-2 w-full accent-zinc-200"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selected.step.velocity}
                onChange={(event) =>
                  updateStep(selected.track.id, selected.index, {
                    velocity: Number(event.target.value),
                  })
                }
              />
              <span className="text-zinc-300">{selected.step.velocity.toFixed(2)}</span>
            </label>
            <label className="block text-xs text-zinc-500">
              probability
              <input
                className="mt-2 w-full accent-zinc-200"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={selected.step.probability}
                onChange={(event) =>
                  updateStep(selected.track.id, selected.index, {
                    probability: Number(event.target.value),
                  })
                }
              />
              <span className="text-zinc-300">{selected.step.probability.toFixed(2)}</span>
            </label>
            <label className="block text-xs text-zinc-500">
              microShift
              <input
                className="mt-2 w-full accent-zinc-200"
                type="range"
                min={-0.5}
                max={0.5}
                step={0.01}
                value={selected.step.microShift}
                onChange={(event) =>
                  updateStep(selected.track.id, selected.index, {
                    microShift: Number(event.target.value),
                  })
                }
              />
              <span className="text-zinc-300">{selected.step.microShift.toFixed(2)}</span>
            </label>
            <label className="block text-xs text-zinc-500">
              step choke group
              <select
                className="mt-2 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                value={selected.step.chokeGroup ?? ""}
                onChange={(event) =>
                  updateStep(selected.track.id, selected.index, {
                    chokeGroup: event.target.value || undefined,
                  })
                }
              >
                <option value="">none</option>
                <option value="main">main</option>
                <option value="hats">hats</option>
                <option value="fills">fills</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              pitch cents
              <input
                className="mt-2 w-full accent-zinc-200"
                type="range"
                min={-1200}
                max={1200}
                step={1}
                value={selected.step.pitchCents ?? selected.step.pitchSemitones * 100}
                onChange={(event) =>
                  updateStep(selected.track.id, selected.index, {
                    pitchCents: Number(event.target.value),
                    tuningRef: undefined,
                  })
                }
              />
              <span className="text-zinc-300">
                {Math.round(selected.step.pitchCents ?? selected.step.pitchSemitones * 100)}c
              </span>
            </label>
            <label className="block text-xs text-zinc-500">
              scale degree ({musicalContext.key.tonic} {currentScale?.name})
              <input
                className="mt-2 h-9 w-full rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                type="number"
                min={-24}
                max={24}
                value={selected.step.tuningRef?.degree ?? ""}
                onChange={(event) =>
                  updateStep(selected.track.id, selected.index, {
                    pitchCents: undefined,
                    tuningRef:
                      event.target.value === ""
                        ? undefined
                        : {
                            scaleId: musicalContext.key.scaleId,
                            degree: Number(event.target.value),
                          },
                  })
                }
              />
            </label>
          </div>
        ) : (
          <p className="text-xs leading-5 text-zinc-600">
            click or right-click a grid cell to edit velocity, probability, and microtiming.
          </p>
        )}
      </aside>
    </section>
  );
}
