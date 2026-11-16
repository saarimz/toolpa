import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const requireFrom = [
  createRequire(path.resolve('packages/audio/package.json')),
  createRequire(path.resolve('packages/samples/package.json')),
  createRequire(path.resolve('package.json')),
];

function resolveExternal(specifier: string): string | undefined {
  for (const require of requireFrom) {
    try {
      const resolved = require.resolve(specifier);
      if (!resolved.includes(`${path.sep}node_modules${path.sep}`)) continue;
      const esm = resolved.endsWith('.cjs') ? resolved.slice(0, -4) + '.js' : resolved;
      const file = esm.endsWith('.js') && existsSync(esm) ? esm : resolved;
      return pathToFileURL(file).href;
    } catch {
      // Try the next package root. pnpm only links a dependency where it is declared.
    }
  }
  return undefined;
}

function run(args: string[], env: Record<string, string> = {}): number {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env: { ...process.env, ...env } });
  return result.status ?? 1;
}

mkdirSync('tmp', { recursive: true });
rmSync('tmp/non-gating.json', { force: true });
const reportOnly = process.argv.includes('--report-only');
const unitStatus = reportOnly
  ? 0
  : run(['exec', 'vitest', 'run', '--reporter=default', '--reporter=json', '--outputFile', 'tmp/vitest.json']);
const browserStatus = reportOnly ? 0 : run(['exec', 'playwright', 'test'], { SLICE_GATE: '1' });

await esbuild.build({
  entryPoints: ['scripts/report.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'tmp/slice-report.mjs',
  logLevel: 'warning',
  plugins: [
    {
      name: 'pnpm-packages',
      setup(build) {
        build.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('node:')) return undefined;
          const resolved = resolveExternal(args.path);
          if (!resolved) return undefined;
          return { path: resolved, external: true };
        });
      },
    },
  ],
});
const report = spawnSync('node', ['tmp/slice-report.mjs'], { stdio: 'inherit' });
const reportStatus = report.status ?? 1;
const failed = unitStatus !== 0 || browserStatus !== 0 || reportStatus !== 0;
console.log(failed ? 'slice gate: failed' : 'slice gate: green');
process.exit(failed ? 1 : 0);
