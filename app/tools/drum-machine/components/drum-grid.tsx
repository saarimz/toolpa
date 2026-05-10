"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { SamplePicker } from "@/components/sample-picker";
import { DrumStepCounts } from "@/app/tools/drum-machine/lib/polyrhythm";
import { useDrumMachineStore } from "@/app/tools/drum-machine/store";
import { cn } from "@/lib/utils";

export function DrumGrid() {
  const pattern = useDrumMachineStore((state) => state.pattern);
  const sampleId = useDrumMachineStore((state) => state.sampleId);
  const sampleName = useDrumMachineStore((state) => state.sampleName);
  const selectedStep = useDrumMachineStore((state) => state.selectedStep);
  const cycleLength = useDrumMachineStore((state) => state.cycleLength());
  const setSample = useDrumMachineStore((state) => state.setSample);
  const toggleStep = useDrumMachineStore((state) => state.toggleStep);
  const updateTrack = useDrumMachineStore((state) => state.updateTrack);
  const setTrackStepCount = useDrumMachineStore((state) => state.setTrackStepCount);
  const setSelectedStep = useDrumMachineStore((state) => state.setSelectedStep);
  const updateStep = useDrumMachineStore((state) => state.updateStep);
  const selected = useMemo(() => {
    if (!selectedStep) {
      return null;
    }
    const track = pattern.tracks.find((candidate) => candidate.id === selectedStep.trackId);
    const step = track?.steps[selectedStep.stepIndex];
    return track && step ? { track, step, index: selectedStep.stepIndex } : null;
  }, [pattern.tracks, selectedStep]);

  return (
    <section className="grid grid-cols-1 border-b border-zinc-800 lg:grid-cols-[1fr_280px]">
      <div className="overflow-x-auto p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SamplePicker
            id="drum-sample"
            value={sampleId}
            label="source"
            roles={["break", "loop", "oneshot", "fx"]}
            onSelect={(sample) => {
              setSample(sample.id, sample.name, sample.role);
            }}
          />
          <span className="text-xs text-zinc-600">{sampleName}</span>
          <span className="text-xs text-zinc-500">cycle {cycleLength} steps</span>
        </div>
        <div className="min-w-[920px] space-y-2">
          {pattern.tracks.map((track) => (
            <div key={track.id} className="grid grid-cols-[300px_1fr] items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-16 truncate text-xs text-zinc-500">{track.name}</span>
                <select
                  value={track.steps.length}
                  onChange={(event) =>
                    setTrackStepCount(track.id, Number(event.target.value))
                  }
                  className="h-8 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
                >
                  {DrumStepCounts.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`${track.name} sample slice`}
                  value={track.slot ?? 0}
                  onChange={(event) => updateTrack(track.id, { slot: Number(event.target.value) })}
                  className="h-8 rounded-sm border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
                >
                  {Array.from({ length: 8 }, (_, slot) => (
                    <option key={slot} value={slot}>
                      s{slot + 1}
                    </option>
                  ))}
                </select>
                <Button
                  className="h-8 px-2"
                  variant={track.mute ? "danger" : "ghost"}
                  onClick={() => updateTrack(track.id, { mute: !track.mute })}
                >
                  m
                </Button>
                <Button
                  className="h-8 px-2"
                  variant={track.solo ? "solid" : "ghost"}
                  onClick={() => updateTrack(track.id, { solo: !track.solo })}
                >
                  s
                </Button>
                <label className="flex items-center gap-1 text-[10px] text-zinc-600">
                  pit
                  <input
                    className="w-12 accent-cyan-300"
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={track.steps[0]?.pitchSemitones ?? 0}
                    onChange={(event) =>
                      updateTrack(track.id, { pitchSemitones: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="flex items-center gap-1 text-[10px] text-zinc-600">
                  dec
                  <input
                    className="w-12 accent-cyan-300"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={track.steps[0]?.decay ?? 0.75}
                    onChange={(event) =>
                      updateTrack(track.id, { decay: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${track.steps.length}, minmax(0, 1fr))`,
                }}
              >
                {track.steps.map((step, stepIndex) => {
                  const isSelected =
                    selectedStep?.trackId === track.id && selectedStep.stepIndex === stepIndex;

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
                        "h-8 border text-[10px] transition",
                        stepIndex % 4 === 0 ? "border-zinc-600" : "border-zinc-800",
                        step.active
                          ? "bg-cyan-300 text-zinc-950"
                          : "bg-zinc-950 text-zinc-700 hover:bg-zinc-900",
                        isSelected && "outline outline-1 outline-cyan-200",
                      )}
                    >
                      {step.active ? "x" : ""}
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
            <Slider
              label="velocity"
              value={selected.step.velocity}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateStep(selected.track.id, selected.index, { velocity: value })}
            />
            <Slider
              label="probability"
              value={selected.step.probability}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updateStep(selected.track.id, selected.index, { probability: value })
              }
            />
            <Slider
              label="pitch"
              value={selected.step.pitchSemitones}
              min={-12}
              max={12}
              step={1}
              onChange={(value) =>
                updateStep(selected.track.id, selected.index, { pitchSemitones: value })
              }
            />
            <Slider
              label="decay"
              value={selected.step.decay ?? 0.75}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateStep(selected.track.id, selected.index, { decay: value })}
            />
          </div>
        ) : (
          <p className="text-xs leading-5 text-zinc-600">right-click a step to edit variation.</p>
        )}
      </aside>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <input
        className="mt-2 w-full accent-cyan-300"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="text-zinc-300">{value.toFixed(2)}</span>
    </label>
  );
}
