import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PROMPT_FIRST_LAYOUT_CONTRACT } from "@/components/prompt-first-section";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function expectOrdered(path: string, anchors: string[]) {
  const source = readSource(path);
  let previousIndex = -1;

  for (const anchor of anchors) {
    const index = source.indexOf(anchor, previousIndex + 1);
    expect(index, `${path} should include ${anchor}`).toBeGreaterThanOrEqual(0);
    expect(index, `${anchor} should render after the previous layout anchor`).toBeGreaterThan(
      previousIndex,
    );
    previousIndex = index;
  }
}

describe("prompt-first L1 and L2 layout", () => {
  it("documents prompt placement as a shared layout contract", () => {
    expect(PROMPT_FIRST_LAYOUT_CONTRACT.l1).toContain("immediately after");
    expect(PROMPT_FIRST_LAYOUT_CONTRACT.l1).toContain("before playback");
    expect(PROMPT_FIRST_LAYOUT_CONTRACT.l2).toContain("before family selection");
  });

  it("keeps installed sample tools ordered as source, prompt, editing, playback", () => {
    expectOrdered("app/tools/intelligence-sampler/client.tsx", [
      "<WaveformSourceControls />",
      "<GenerationPanel />",
      "<WaveformSlicer />",
      "<TransportBar />",
      "<StepGrid />",
    ]);

    expectOrdered("app/tools/grid-sampler/client.tsx", [
      "<GridSourceControls />",
      "<GridGenerationPanel />",
      "<GridCanvas />",
      "<GridStepGrid />",
      "<GridTransportBar />",
    ]);

    expectOrdered("app/tools/drum-machine/client.tsx", [
      "<DrumSourceControls />",
      "<DrumGenerationPanel />",
      "<DrumGrid />",
      "<DrumTransportBar />",
    ]);

    expectOrdered("app/tools/splice-lab/client.tsx", [
      "<SpliceSourcePanel />",
      "<SpliceGenerationPanel />",
      "<SpliceMappingControls />",
      "<SpliceGrid />",
      "<SpliceTransportBar />",
    ]);
  });

  it("keeps standalone installed tools prompt-first before playback and export controls", () => {
    expectOrdered("app/tools/time-stretch/client.tsx", [
      "<SamplePicker",
      "stretch prompt",
      "play render",
      "audioExport",
    ]);

    expectOrdered("app/tools/sample-analysis/client.tsx", [
      "<SamplePicker",
      "intent prompt",
      "play sample",
      "copy json",
    ]);

    expectOrdered("app/tools/camera-theremin/client.tsx", [
      "<PromptFirstSection",
      "apply prompt",
      "start camera",
      "arm synth",
    ]);

    expectOrdered("app/tools/evolving-fm-synth/client.tsx", [
      "<PromptFirstSection",
      "synth prompt",
      "play",
      "audioExport",
    ]);

    expectOrdered("app/tools/midi-generator/client.tsx", [
      "<PromptFirstSection",
      "generation prompt",
      "follow-up edit prompt",
      "preview",
      "ToolExportPanel",
      "<MidiPlaybackPanel",
    ]);
  });

  it("keeps generated tools and the L2 builder on the shared prompt-first primitive", () => {
    expectOrdered("app/tools/_builder/client.tsx", [
      "<PromptFirstSection",
      "description",
      "tool family",
      "builder run monitor",
    ]);

    expectOrdered("app/tools/sine-wave-synth/client.tsx", [
      "<PromptFirstSection",
      "scene prompt",
      "play",
      "audioExport",
    ]);

    expectOrdered("app/tools/harmonic-distrotion-effect/client.tsx", [
      "<PromptFirstSection",
      "effect prompt",
      "AudioOutputRecorder",
      "copy patch json",
    ]);
  });
});
