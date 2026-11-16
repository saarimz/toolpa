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
const js = built.outputFiles[0].text;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const port = Number(process.env.TRACE_PROBE_PORT ?? 43119);

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/probe.js')) {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    res.end(js);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`trace probe http://127.0.0.1:${port}/\n`);
});
