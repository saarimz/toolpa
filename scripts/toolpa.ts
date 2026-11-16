import { readFileSync, writeFileSync } from 'node:fs';
import { renderChain } from '../packages/audio/src/index.ts';

const [command, inputPath, outputPath] = process.argv.slice(2);
if (command !== 'render' || !inputPath || !outputPath) {
  process.stderr.write('usage: toolpa render <chain.json> <out.wav>\n');
  process.exit(1);
}

const chain = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;
const rendered = await renderChain({ chain, durationSeconds: 0.25, format: 'float32' });
writeFileSync(outputPath, rendered.wav);
process.stdout.write(`${rendered.hash}\n`);
