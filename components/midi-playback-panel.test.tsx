import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createPatternMidiPlayback,
  createSynthSceneMidiPlayback,
  MidiPlaybackPanel,
} from "@/components/midi-playback-panel";
import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import { createPattern, createStep, createTrack } from "@/lib/pattern/schema";

describe("MidiPlaybackPanel", () => {
  it("renders a piano-roll style MIDI lane with note bars and playhead stats", () => {
    render(
      <MidiPlaybackPanel
        bpm={120}
        currentBeat={1}
        isPlaying
        notes={[
          {
            durationBeats: 1,
            laneLabel: "lead",
            midi: 60,
            sourceLabel: "lead voice",
            startBeat: 0,
            velocity: 0.9,
          },
        ]}
        totalBeats={4}
      />,
    );

    expect(screen.getByRole("region", { name: "MIDI playback" })).toBeInTheDocument();
    expect(screen.getByText("lead")).toBeInTheDocument();
    expect(screen.getByText("C4")).toBeInTheDocument();
    expect(screen.getByText("1 bar")).toBeInTheDocument();
    expect(screen.getByLabelText("lead voice 1")).toBeInTheDocument();
  });

  it("adapts sample patterns into distinct MIDI lanes", () => {
    const pattern = createPattern({
      bars: 1,
      stepsPerBar: 4,
      tracks: [
        createTrack({
          id: "kick",
          name: "kick",
          sampleId: "sample",
          steps: [
            createStep({ active: true }),
            createStep({ active: false }),
            createStep({ active: true, pitchSemitones: 2 }),
            createStep({ active: false }),
          ],
        }),
      ],
    });

    const playback = createPatternMidiPlayback(pattern);

    expect(playback.totalBeats).toBe(4);
    expect(playback.notes).toHaveLength(2);
    expect(playback.notes.map((note) => note.midi)).toEqual([36, 38]);
    expect(playback.notes[0]).toMatchObject({
      durationBeats: 1,
      laneLabel: "kick",
      sourceLabel: "kick",
      startBeat: 0,
    });
  });

  it("adapts SynthScene notes from the MIDI export path", () => {
    const scene = createDefaultSynthScene("slow glass pad in C minor");
    const playback = createSynthSceneMidiPlayback(scene);

    expect(playback.bpm).toBe(scene.bpm);
    expect(playback.totalBeats).toBe(scene.bars * 4);
    expect(playback.notes.length).toBeGreaterThan(0);
    expect(playback.notes[0]).toEqual(
      expect.objectContaining({
        durationBeats: expect.any(Number),
        midi: expect.any(Number),
        startBeat: expect.any(Number),
      }),
    );
  });

  it("keeps SynthScene MIDI playback lanes aligned to voices", () => {
    const baseScene = createDefaultSynthScene("two octave lead voice");
    const voice = baseScene.voices[0]!;
    const scene = {
      ...baseScene,
      voices: baseScene.voices.map((candidate, voiceIndex) =>
        voiceIndex === 0
          ? {
              ...candidate,
              label: "aligned voice",
              mute: false,
              role: "lead" as const,
              steps: candidate.steps.map((step, stepIndex) => ({
                ...step,
                active: stepIndex < 2,
                midi: stepIndex === 0 ? 48 : 72,
              })),
            }
          : {
              ...candidate,
              mute: true,
            },
      ),
    };

    const playback = createSynthSceneMidiPlayback(scene);

    expect(playback.notes).toHaveLength(2);
    expect(new Set(playback.notes.map((note) => note.laneId))).toEqual(
      new Set([`voice:${voice.id}`]),
    );
    expect(playback.notes.map((note) => note.sourceLabel)).toEqual([
      "aligned voice C3",
      "aligned voice C5",
    ]);

    render(<MidiPlaybackPanel {...playback} />);

    expect(screen.getByText("aligned voice")).toBeInTheDocument();
    expect(screen.getByText("lead")).toBeInTheDocument();
    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(screen.getByText("1 lanes")).toBeInTheDocument();
  });
});
