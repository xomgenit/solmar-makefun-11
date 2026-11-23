// SOLMAR's dev server (Node 22, stdlib only): serves game/ on localhost so the
// game can be played and play-tested without a build step.
//
//   node serve.ts            -> http://localhost:8080
//   node serve.ts --port 8123 -> http://localhost:8123
//
// Plain static files only: it reads from game/, refuses anything outside it,
// and sends the MIME types a browser game needs. A dev convenience, not a
// production server.

import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_ROOT = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

function pickPort(): number {
  const args = process.argv.slice(2);
  const at = args.indexOf('--port');
  if (at === -1) return 8080;
  const value = Number(args[at + 1]);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8080;
}

function safePath(rawPath: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (path.endsWith('/')) path += 'index.html';
  const resolved = resolve(join(GAME_ROOT, path));
  if (resolved !== GAME_ROOT && !resolved.startsWith(GAME_ROOT + sep)) return null;
  return resolved;
}

const port = pickPort();
createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = safePath(url.pathname);
  if (file === null) {
    res.writeHead(400).end('bad request');
    return;
  }
  let bytes: Buffer;
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    bytes = readFileSync(file);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': bytes.length,
    'cache-control': 'no-store',
  });
  res.end(bytes);
}).listen(port, '127.0.0.1', () => {
  console.log(`SOLMAR game/ is on http://localhost:${port}`);
});
