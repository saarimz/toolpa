import { describe, expect, it } from "vitest";

import { AgentManifestSchema } from "@/lib/agents/contract";
import { instantiateToolSkeleton } from "@/lib/agents/templates/instantiate";

describe("instantiateToolSkeleton", () => {
  it("renders a complete L1 tool skeleton under the tool root", () => {
    const instance = instantiateToolSkeleton({
      slug: "vocal-stutter",
      name: "Vocal Stutter",
      description: "Turns a vocal sample into a chopped stutter instrument.",
      capabilities: ["generatePattern", "uploadSample"],
      sampleRoles: ["oneshot", "loop"],
    });

    expect(AgentManifestSchema.parse(instance.manifest)).toMatchObject({
      slug: "vocal-stutter",
      level: 1,
      origin: "generated",
      instrument: {
        type: "sample",
        workflow: "sample-pattern",
        document: "pattern",
        usesSamples: true,
        usesSynthesis: false,
      },
      outputs: { pattern: true, synthScene: false, audio: true, recording: true },
      musicContext: { globalBpm: true, globalKey: true, scaleSearch: true },
    });
    expect([...instance.files.keys()]).toEqual([
      "app/tools/vocal-stutter/manifest.ts",
      "app/tools/vocal-stutter/page.tsx",
      "app/tools/vocal-stutter/client.tsx",
      "app/tools/vocal-stutter/lib/prompt.ts",
      "app/tools/vocal-stutter/__tests__/manifest.test.ts",
      "app/tools/vocal-stutter/client.test.tsx",
      "app/tools/vocal-stutter/lib/prompt.test.ts",
    ]);
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "SamplePicker",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      'getSamplePlaybackHost("vocal-stutter")',
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "void playbackHost.stopPattern();",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "usePromptParamState",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "PatternLiveTrace",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "usePatternStepAgency",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "getPatternStepAgencyClassName",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "PatternStepAgencyBadge",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "AbortController",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "renderPatternToWav",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.tsx")).toContain(
      "copyPatternJson",
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.test.tsx")).toContain(
      'vi.mock("@/components/sample-picker"',
    );
    expect(instance.files.get("app/tools/vocal-stutter/client.test.tsx")).toContain(
      'vi.mock("@/lib/audio/sample-playback"',
    );
    expect(
      [...instance.files.values()].every((content) => !/\{\{[a-zA-Z]/.test(content)),
    ).toBe(true);
  });

  it("rejects invalid generated slugs through the shared manifest schema", () => {
    expect(() =>
      instantiateToolSkeleton({
        slug: "../escape",
        name: "Bad",
        description: "Bad",
      }),
    ).toThrow();
  });

  it("renders a generated synth-scene skeleton for L2 synth requests", () => {
    const instance = instantiateToolSkeleton({
      slug: "simple-synth",
      name: "Simple Synth",
      description: "A prompt-driven FM synth instrument.",
      instrumentType: "synth",
    });

    expect(AgentManifestSchema.parse(instance.manifest)).toMatchObject({
      slug: "simple-synth",
      instrument: {
        type: "synth",
        workflow: "synth-scene",
        document: "synth-scene",
        usesSamples: false,
        usesSynthesis: true,
      },
      outputs: { pattern: false, synthScene: true, midi: true, audio: true, recording: true },
      musicContext: { globalBpm: true, globalKey: true, scaleSearch: true },
    });
    expect(instance.files.get("app/tools/simple-synth/client.tsx")).toContain(
      "fetchSynthSceneFromGateway",
    );
    expect(instance.files.get("app/tools/simple-synth/client.tsx")).toContain(
      "renderSynthSceneToWav",
    );
    expect(instance.files.get("app/tools/simple-synth/client.tsx")).toContain(
      "downloadSynthSceneMidi",
    );
    expect(instance.files.get("app/tools/simple-synth/client.tsx")).toContain(
      "download midi",
    );
    expect(instance.files.get("app/tools/simple-synth/client.tsx")).toContain(
      "generating synth scene",
    );
    expect(instance.files.get("app/tools/simple-synth/lib/prompt.ts")).toContain(
      "SynthScene",
    );
  });

  it("renders a generated audio-stream effect skeleton for L2 effect requests", () => {
    const instance = instantiateToolSkeleton({
      slug: "simple-effect",
      name: "Simple Effect",
      description: "A prompt-driven browser audio effect.",
      instrumentType: "effect",
    });

    expect(AgentManifestSchema.parse(instance.manifest)).toMatchObject({
      slug: "simple-effect",
      instrument: {
        type: "effect",
        workflow: "audio-stream-effect",
        document: "audio-stream",
        usesSamples: false,
        usesSynthesis: false,
      },
      outputs: { pattern: false, synthScene: false, audio: true, recording: true },
      musicContext: { globalBpm: true, globalKey: false, scaleSearch: false },
    });
    expect(instance.files.get("app/tools/simple-effect/client.tsx")).toContain(
      "createToneEffectRuntime",
    );
    expect(instance.files.get("app/tools/simple-effect/client.tsx")).toContain(
      "generating effect patch",
    );
    expect(instance.files.get("app/tools/simple-effect/lib/prompt.ts")).toContain(
      "audio-stream",
    );
  });

  it("renders a sample-informed synth-scene skeleton for L2 hybrid requests", () => {
    const instance = instantiateToolSkeleton({
      slug: "simple-hybrid",
      name: "Simple Hybrid",
      description: "A prompt-driven sample and synth hybrid.",
      instrumentType: "hybrid",
    });

    expect(AgentManifestSchema.parse(instance.manifest)).toMatchObject({
      slug: "simple-hybrid",
      instrument: {
        type: "hybrid",
        workflow: "sample-informed-synth-scene",
        document: "synth-scene",
        usesSamples: true,
        usesSynthesis: true,
      },
      outputs: { pattern: false, synthScene: true, midi: true, audio: true, recording: true },
      musicContext: { globalBpm: true, globalKey: true, scaleSearch: true },
    });
    expect(instance.files.get("app/tools/simple-hybrid/client.tsx")).toContain(
      "sample-informed boundary",
    );
    expect(instance.files.get("app/tools/simple-hybrid/client.tsx")).toContain(
      "SamplePicker",
    );
    expect(instance.files.get("app/tools/simple-hybrid/client.tsx")).toContain(
      "downloadSynthSceneMidi",
    );
    expect(instance.files.get("app/tools/simple-hybrid/client.test.tsx")).toContain(
      'vi.mock("@/components/sample-picker"',
    );
    expect(instance.files.get("app/tools/simple-hybrid/lib/prompt.ts")).toContain(
      "do not pretend full sample resynthesis exists",
    );
  });
});
