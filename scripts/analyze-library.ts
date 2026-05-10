import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeWavInNode } from "@/lib/samples/analysis/pipeline/decode";
import {
  PIPELINE_VERSION,
  runDspPipeline,
} from "@/lib/samples/analysis/pipeline/index";
import {
  SampleAnalysisSchema,
  SAMPLE_ANALYSIS_SCHEMA_VERSION,
  type SampleAnalysis,
} from "@/lib/samples/analysis/schema";
import { librarySamples } from "@/lib/samples/library";

type BakedCacheFile = {
  schema_version: number;
  pipeline_version: string;
  generated_git_sha: string;
  samples: Record<string, { hash: string; analysis: SampleAnalysis }>;
};

const CHECK_FLAG = "--check";

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDir, "..");
  const cachePath = join(projectRoot, "lib/samples/analysis-cache.json");
  const isCheckMode = process.argv.includes(CHECK_FLAG);
  const includeDescriptors =
    !isCheckMode && process.env.AI_GATEWAY_API_KEY
      ? true
      : false;

  if (!isCheckMode) {
    console.log(
      `Analyzing ${librarySamples.length} library samples (descriptors=${includeDescriptors})`,
    );
  }

  const samples: BakedCacheFile["samples"] = {};
  for (const sample of librarySamples) {
    const audioPath = join(projectRoot, "public", sample.href.replace(/^\//, ""));
    const buffer = await readFile(audioPath);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    const decoded = decodeWavInNode(arrayBuffer);
    const analysis = await runDspPipeline({
      arrayBuffer,
      channels: decoded.channels,
      sampleRate: decoded.sampleRate,
      durationSec: decoded.durationSec,
    });

    let finalized: SampleAnalysis = SampleAnalysisSchema.parse({
      ...analysis,
      analyzed_at: 0,
    });

    if (includeDescriptors) {
      try {
        const { describeSample } = await import("@/lib/ai/sample-descriptors");
        const descriptors = await describeSample({
          analysis: finalized,
          sourceName: sample.name,
        });
        finalized = SampleAnalysisSchema.parse({
          ...finalized,
          llm_descriptors: descriptors,
        });
      } catch (descriptorError) {
        console.warn(
          `  ! descriptors failed for ${sample.id}: ${
            descriptorError instanceof Error ? descriptorError.message : "unknown"
          }`,
        );
      }
    }

    samples[sample.id] = {
      hash: finalized.source.sha256,
      analysis: finalized,
    };

    if (!isCheckMode) {
      console.log(
        `  + ${sample.id}: bpm=${formatBpm(finalized)} key=${formatKey(finalized)} role=${finalized.role}`,
      );
    }
  }

  const payload: BakedCacheFile = {
    schema_version: SAMPLE_ANALYSIS_SCHEMA_VERSION,
    pipeline_version: PIPELINE_VERSION,
    generated_git_sha: readGitSha(projectRoot),
    samples,
  };
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  if (isCheckMode) {
    const existing = await readFile(cachePath, "utf8").catch(() => "");
    if (existing !== serialized) {
      console.error(
        "lib/samples/analysis-cache.json is out of sync. Run `pnpm analyze:library` and commit.",
      );
      process.exit(1);
    }
    console.log("analysis-cache.json is in sync.");
    return;
  }

  await writeFile(cachePath, serialized, "utf8");
  console.log(`Wrote ${Object.keys(samples).length} entries to ${cachePath}`);
}

function formatBpm(analysis: SampleAnalysis): string {
  return analysis.rhythm.bpm !== null
    ? `${analysis.rhythm.bpm.toFixed(1)}@${(analysis.rhythm.bpm_confidence * 100).toFixed(0)}%`
    : "—";
}

function formatKey(analysis: SampleAnalysis): string {
  if (!analysis.tonal.key) {
    return "—";
  }
  return `${analysis.tonal.key}${analysis.tonal.scale === "minor" ? "m" : ""}@${(analysis.tonal.key_strength * 100).toFixed(0)}%`;
}

function readGitSha(projectRoot: string): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
