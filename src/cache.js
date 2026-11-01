// A small file cache, so an event page read and summarized once is not sent
// to Claude again for a few days.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache');
const FILE = join(DIR, 'events.json');
const TTL_MS = 3 * 24 * 3600 * 1000;

let data = {};
try {
  data = JSON.parse(readFileSync(FILE, 'utf8'));
} catch {
  data = {};
}

export function getCached(key) {
  const hit = data[key];
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  return undefined;
}

export function setCached(key, value) {
  data[key] = { at: Date.now(), value };
}

export function saveCache() {
  const now = Date.now();
  for (const k of Object.keys(data)) if (now - data[k].at >= TTL_MS) delete data[k];
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(data));
}
