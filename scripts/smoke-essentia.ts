import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeWavInNode } from "@/lib/samples/analysis/pipeline/decode";
import {
  extractGlobal,
  extractRhythm,
  extractSpectral,
  extractTonal,
} from "@/lib/samples/analysis/essentia/extract";
import { shutdownEssentia } from "@/lib/samples/analysis/essentia/runner";

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDir, "..");
  const samplePath = join(
    projectRoot,
    "public/samples/element-one/140-stripped-drum-loop-03.wav",
  );
  const buffer = await readFile(samplePath).catch(async () => {
    return readFile(
      join(projectRoot, "public/samples/expanded-library/element-one/140-stripped-drum-loop-03.wav"),
    );
  });
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const decoded = decodeWavInNode(arrayBuffer);

  console.log("decoded:", {
    sr: decoded.sampleRate,
    ch: decoded.channels.length,
    dur: decoded.durationSec.toFixed(2),
  });

  console.log("global:", extractGlobal(decoded.channels));
  const { spectral, chromaMean } = extractSpectral(decoded.channels, decoded.sampleRate);
  console.log("spectral.centroid:", spectral.centroid_hz);
  console.log("spectral.flatness:", spectral.flatness);
  console.log("spectral.mfcc_mean[0..3]:", spectral.mfcc_mean.slice(0, 4));
  console.log("tonal:", extractTonal(decoded.channels, chromaMean));
  console.log("rhythm:", extractRhythm(decoded.channels, decoded.sampleRate));

  shutdownEssentia();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
