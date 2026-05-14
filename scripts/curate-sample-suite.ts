import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { curatedSuiteSamples } from "@/lib/samples/curated-suite";

const CHECK_FLAG = "--check";
const DEFAULT_SOURCE_ROOT = "/Users/saarimzaman/Documents/Audio Samples";

type CopyResult = {
  sampleId: string;
  genre: string;
  role: string;
  sourcePath: string;
  targetPath: string;
  status: "copied" | "fresh" | "missing-source" | "missing-target" | "size-mismatch";
  sourceBytes?: number;
  targetBytes?: number;
};

async function main() {
  const sourceRoot = process.env.AUDIO_SAMPLES_ROOT ?? DEFAULT_SOURCE_ROOT;
  const projectRoot = process.cwd();
  const publicRoot = join(projectRoot, "public");
  const isCheckMode = process.argv.includes(CHECK_FLAG);

  const results = await Promise.all(
    curatedSuiteSamples.map(async (sample): Promise<CopyResult> => {
      const sourcePath = resolve(sourceRoot, sample.sourcePath);
      const targetPath = join(publicRoot, sample.href.replace(/^\//, ""));
      const [sourceStats, targetStats] = await Promise.all([
        stat(sourcePath).catch(() => null),
        stat(targetPath).catch(() => null),
      ]);

      if (!sourceStats) {
        return {
          sampleId: sample.id,
          genre: sample.genre,
          role: sample.role,
          sourcePath,
          targetPath,
          status: "missing-source",
        };
      }

      if (isCheckMode) {
        return {
          sampleId: sample.id,
          genre: sample.genre,
          role: sample.role,
          sourcePath,
          targetPath,
          status:
            targetStats && targetStats.size === sourceStats.size
              ? "fresh"
              : targetStats
                ? "size-mismatch"
                : "missing-target",
          sourceBytes: sourceStats.size,
          targetBytes: targetStats?.size,
        };
      }

      if (targetStats?.size === sourceStats.size) {
        return {
          sampleId: sample.id,
          genre: sample.genre,
          role: sample.role,
          sourcePath,
          targetPath,
          status: "fresh",
          sourceBytes: sourceStats.size,
          targetBytes: targetStats.size,
        };
      }

      await mkdir(dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);

      return {
        sampleId: sample.id,
        genre: sample.genre,
        role: sample.role,
        sourcePath,
        targetPath,
        status: "copied",
        sourceBytes: sourceStats.size,
        targetBytes: sourceStats.size,
      };
    }),
  );

  const failures = results.filter((result) =>
    ["missing-source", "missing-target", "size-mismatch"].includes(result.status),
  );

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `${failure.status}: ${failure.sampleId}\n  source: ${failure.sourcePath}\n  target: ${failure.targetPath}`,
      );
    }
    process.exit(1);
  }

  const copied = results.filter((result) => result.status === "copied").length;
  const totalBytes = results.reduce(
    (sum, result) => sum + (result.sourceBytes ?? 0),
    0,
  );
  const genreCounts = summarizeBy(results, (result) => result.genre);
  const roleCounts = summarizeBy(results, (result) => result.role);

  console.log(
    `${isCheckMode ? "Checked" : "Curated"} ${results.length} samples (${formatBytes(
      totalBytes,
    )}); copied=${copied}`,
  );
  console.log(`genres: ${formatSummary(genreCounts)}`);
  console.log(`roles: ${formatSummary(roleCounts)}`);
}

function summarizeBy(
  results: readonly CopyResult[],
  getKey: (result: CopyResult) => string,
) {
  return results.reduce<Record<string, number>>((counts, result) => {
    const key = getKey(result);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function formatSummary(counts: Record<string, number>) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
}

function formatBytes(bytes: number) {
  const megabytes = bytes / 1024 / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 1 : 2)} MB`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
