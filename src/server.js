// Starts the app on your computer and opens it in your browser.
// Nothing runs in the background: close this window and the app stops.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { search } from './search.js';

const PORT = Number(process.env.PORT || 3737);
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

let running = false;

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const num = (s) => (s === null || s === '' || s === undefined || isNaN(Number(s)) ? null : Number(s));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/search') {
    const q = {
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      min: num(url.searchParams.get('min')),
      max: num(url.searchParams.get('max')),
      includeUnknown: url.searchParams.get('unknown') === '1',
    };
    if (!isDate(q.from) || !isDate(q.to) || q.from > q.to) {
      res.writeHead(400).end('Μη έγκυρες ημερομηνίες');
      return;
    }
    if (running) {
      res.writeHead(409).end('Τρέχει ήδη μια αναζήτηση');
      return;
    }
    running = true;
    // Server-sent events: progress lines and events stream in as they are found.
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const emit = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
    try {
      const count = await search(q, emit);
      emit({ type: 'done', count });
    } catch (e) {
      emit({ type: 'error', text: e.message });
    } finally {
      running = false;
      res.end();
    }
    return;
  }

  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^[\w.-]+$/.test(file)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(join(PUBLIC, file));
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const address = `http://localhost:${PORT}`;
  console.log(`Athens Events: ${address}  (Ctrl+C για τερματισμό)`);
  if (process.env.NO_OPEN) return;
  const opener = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${opener} ${address}`, () => {});
});
