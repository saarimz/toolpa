import { describe, expect, it } from "vitest";

import { AgentManifestSchema } from "@/lib/agents/contract";

describe("AgentManifestSchema", () => {
  it("defaults inputs and autonomy", () => {
    expect(
      AgentManifestSchema.parse({
        name: "tool",
        slug: "tool",
        level: 1,
        description: "test",
        route: "/tools/tool",
        outputs: { pattern: true, audio: false },
      }),
    ).toMatchObject({
      autonomy: "manual",
      origin: "installed",
      status: "enabled",
      instrument: {
        type: "sample",
        workflow: "sample-pattern",
        document: "pattern",
        usesSamples: true,
        usesSynthesis: false,
      },
      inputs: {
        samples: [],
        bpm: true,
        globalBpm: false,
        globalKey: false,
        scaleSearch: false,
        prompt: true,
        description: false,
        referenceAgent: false,
        audioSources: [],
      },
      musicContext: {
        globalBpm: false,
        globalKey: false,
        scaleSearch: false,
      },
      outputs: {
        pattern: true,
        synthScene: false,
        midi: false,
        visualScene: false,
        audio: false,
        recording: false,
        files: false,
        manifest: false,
      },
    });
  });

  it("accepts L2 builder manifests", () => {
    expect(
      AgentManifestSchema.parse({
        name: "tool-builder",
        slug: "_builder",
        level: 2,
        origin: "installed",
        description: "Builds L1 tools",
        route: "/build",
        instrument: {
          type: "builder",
          workflow: "tool-builder",
          document: "files",
          usesSamples: false,
          usesSynthesis: false,
        },
        inputs: { description: true, referenceAgent: true },
        outputs: { files: true, manifest: true },
        autonomy: "driven",
      }),
    ).toMatchObject({
      level: 2,
      origin: "installed",
      instrument: {
        type: "builder",
        workflow: "tool-builder",
        document: "files",
        usesSamples: false,
        usesSynthesis: false,
      },
      inputs: { description: true, referenceAgent: true },
      musicContext: { globalBpm: false, globalKey: false, scaleSearch: false },
      outputs: {
        pattern: false,
        synthScene: false,
        midi: false,
        visualScene: false,
        audio: false,
        recording: false,
        files: true,
        manifest: true,
      },
    });
  });

  it("rejects builder levels outside the L1/L2 product model", () => {
    expect(() =>
      AgentManifestSchema.parse({
        name: "agent-builder",
        slug: "agent-builder",
        level: 3,
        description: "Builds higher-level agents",
        route: "/build/agent",
      }),
    ).toThrow();
  });

  it("accepts generated manifest origin tags", () => {
    expect(
      AgentManifestSchema.parse({
        name: "generated tool",
        slug: "generated-tool",
        level: 1,
        origin: "generated",
        description: "AI-generated tool",
        route: "/tools/generated-tool",
        outputs: { pattern: true, audio: true },
      }).origin,
    ).toBe("generated");
  });

  it("rejects non-route paths and invalid slugs", () => {
    expect(() =>
      AgentManifestSchema.parse({
        name: "tool",
        slug: "Bad Slug",
        level: 1,
        description: "test",
        route: "tools/tool",
        outputs: { pattern: true, audio: false },
      }),
    ).toThrow();
  });

  it("accepts every bundled sample role in tool manifests", () => {
    expect(
      AgentManifestSchema.parse({
        name: "tool",
        slug: "tool",
        level: 1,
        description: "test",
        route: "/tools/tool",
        inputs: {
          samples: ["break", "loop", "oneshot", "melodic", "pad", "fx"],
        },
        outputs: { pattern: true, audio: false },
      }).inputs.samples,
    ).toEqual(["break", "loop", "oneshot", "melodic", "pad", "fx"]);
  });

  it("models global BPM/key context consumption for L1 synths and samplers", () => {
    expect(
      AgentManifestSchema.parse({
        name: "synth",
        slug: "synth",
        level: 1,
        description: "synth",
        route: "/tools/synth",
        instrument: {
          type: "synth",
          workflow: "synth-scene",
          document: "synth-scene",
          usesSamples: false,
          usesSynthesis: true,
        },
        inputs: { globalBpm: true, globalKey: true, scaleSearch: true },
        musicContext: { globalBpm: true, globalKey: true, scaleSearch: true },
        capabilities: ["recordOutput"],
        outputs: { synthScene: true, midi: true, audio: true, recording: true },
      }),
    ).toMatchObject({
      instrument: {
        type: "synth",
        workflow: "synth-scene",
        document: "synth-scene",
        usesSamples: false,
        usesSynthesis: true,
      },
      musicContext: { globalBpm: true, globalKey: true, scaleSearch: true },
      outputs: { pattern: false, synthScene: true, midi: true, recording: true },
      capabilities: ["recordOutput"],
    });
  });

  it("accepts dedicated MIDI clip L1 manifests", () => {
    expect(
      AgentManifestSchema.parse({
        name: "midi generator",
        slug: "midi-generator",
        level: 1,
        description: "Prompt-generated MIDI clip arranger.",
        route: "/tools/midi-generator",
        instrument: {
          type: "midi",
          workflow: "midi-generator",
          document: "midi-clip",
          usesSamples: false,
          usesSynthesis: true,
        },
        capabilities: ["generateMidi", "editMidi", "play", "exportMidi", "recordOutput"],
        inputs: { globalBpm: true, globalKey: true, scaleSearch: true },
        musicContext: { globalBpm: true, globalKey: true, scaleSearch: true },
        outputs: { midi: true, audio: true, recording: true },
        exports: {
          document: "midi-clip",
          audio: {
            strategy: "live-recording",
            formats: ["wav"],
            maxDefaultDurationSec: 120,
            requiresUserGestureForPreview: true,
          },
          midi: {
            strategy: "standard-midi-file",
            format: "smf-1",
            ticksPerQuarter: 480,
            preservesTracks: true,
            supportsPitchBend: true,
            supportsCc: true,
          },
        },
      }),
    ).toMatchObject({
      instrument: {
        type: "midi",
        document: "midi-clip",
      },
      outputs: {
        midi: true,
        visualScene: false,
        audio: true,
        recording: true,
      },
      exports: {
        document: "midi-clip",
        midi: {
          format: "smf-1",
          strategy: "standard-midi-file",
        },
      },
    });
  });

  it("accepts audio-reactive visualizer manifests", () => {
    expect(
      AgentManifestSchema.parse({
        name: "audio visualizer",
        slug: "audio-visualizer",
        level: 1,
        description: "Prompt-generated audio reactive visuals.",
        route: "/tools/audio-visualizer",
        instrument: {
          type: "visualizer",
          workflow: "audio-reactive-visual-scene",
          document: "visual-scene",
          usesSamples: true,
          usesSynthesis: true,
        },
        capabilities: ["promptToVisualScene", "liveAudioInput", "microphoneInput", "audioFileInput", "fullscreenVisuals"],
        inputs: {
          audioSources: ["live-audio", "audio-file", "microphone"],
          globalBpm: true,
          globalKey: false,
          scaleSearch: false,
        },
        musicContext: { globalBpm: true, globalKey: false, scaleSearch: false },
        outputs: { visualScene: true, audio: true },
        exports: {
          document: "visual-scene",
          audio: {
            strategy: "source-audio",
            formats: ["wav"],
            maxDefaultDurationSec: 600,
            requiresUserGestureForPreview: true,
          },
        },
      }),
    ).toMatchObject({
      instrument: {
        type: "visualizer",
        document: "visual-scene",
      },
      inputs: {
        audioSources: ["live-audio", "audio-file", "microphone"],
      },
      outputs: {
        visualScene: true,
      },
    });
  });

  it("accepts manifest-declared FX slots for installed pattern tools", () => {
    const fx = AgentManifestSchema.parse({
      name: "drum machine",
      slug: "drum-machine",
      level: 1,
      description: "sequencer",
      route: "/tools/drum-machine",
      capabilities: ["sequence", "fxSlots", "recordOutput"],
      outputs: { pattern: true, audio: true, recording: true },
      fx: {
        enabled: true,
        slots: ["A", "B"],
        allowedEffects: ["none", "repeat", "chorus", "delay", "reverb"],
        defaultPattern: {
          schemaVersion: 1,
          slots: [
            { id: "A", effect: "repeat", wet: 0.42 },
            { id: "B", effect: "none", wet: 0.35 },
          ],
        },
      },
    }).fx;

    expect(fx).toMatchObject({
      enabled: true,
      slots: ["A", "B"],
    });
    if (!fx) {
      throw new Error("manifest FX contract was not parsed");
    }
    expect(fx.defaultPattern?.slots).toHaveLength(4);
    expect(fx.defaultPattern?.slots[0]).toMatchObject({
      id: "A",
      effect: "repeat",
      params: { delayTime: "16n", feedback: 0.62 },
      wet: 0.42,
    });
    expect(fx.defaultPattern?.slots[1]).toMatchObject({
      id: "B",
      effect: "none",
      wet: 0.35,
    });
  });
});
