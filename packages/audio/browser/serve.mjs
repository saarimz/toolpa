import esbuild from 'esbuild';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const built = await esbuild.build({
  entryPoints: [path.join(dir, 'probe.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  write: false,
});
const worker = await esbuild.build({
  entryPoints: [path.join(dir, 'worker.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
});
const instrumentBuilt = await esbuild.build({
  entryPoints: [path.join(dir, 'instrument.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  write: false,
});
const js = built.outputFiles[0].text;
const workerJs = worker.outputFiles[0].text;
const instrumentJs = instrumentBuilt.outputFiles[0].text;
const performanceBuilt = await esbuild.build({
  entryPoints: [path.join(dir, 'performance.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  write: false,
});
const performanceJs = performanceBuilt.outputFiles[0].text;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const instrumentHtml = fs.readFileSync(path.join(dir, 'instrument.html'), 'utf8');
const performanceHtml = fs.readFileSync(path.join(dir, 'performance.html'), 'utf8');
const port = Number(process.env.LIVE_PROBE_PORT ?? 43117);

const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.startsWith('/probe.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(js);
      return;
    }
    if (url.startsWith('/worker.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(workerJs);
      return;
    }
    if (url.startsWith('/performance.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(performanceJs);
      return;
    }
    if (url.startsWith('/instrument.js')) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(instrumentJs);
      return;
    }
    if (url.startsWith('/performance')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(performanceHtml);
      return;
    }
    if (url.startsWith('/instrument')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(instrumentHtml);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
});
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    process.stdout.write(`live probe already bound on 127.0.0.1:${port}\n`);
    setInterval(() => {}, 60_000);
    return;
  }
  throw error;
});
server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`live probe http://127.0.0.1:${port}/\n`);
});
