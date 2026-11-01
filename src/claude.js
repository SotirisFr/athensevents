// Runs the Claude Code CLI (`claude -p`) with your own Claude login.
// No API key is needed: the CLI uses whatever account `claude` is signed in to.

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODEL = process.env.CLAUDE_MODEL || 'haiku';
const MAX_PARALLEL = Number(process.env.CLAUDE_PARALLEL || 3);
const TIMEOUT_MS = 180000;
const isWindows = process.platform === 'win32';

// Run from an empty folder so the CLI does not pick up any project files.
const WORKDIR = mkdtempSync(join(tmpdir(), 'athensevents-'));

let active = 0;
const waiting = [];
async function limit(fn) {
  if (active >= MAX_PARALLEL) await new Promise((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function parseJson(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const start = t.search(/[[{]/);
    const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error('Claude did not return JSON');
  }
}

/**
 * Sends `prompt` to Claude and returns the parsed JSON answer, validated
 * against `schema` where the platform allows passing it on the command line.
 */
export function askClaude(prompt, schema) {
  return limit(
    () =>
      new Promise((resolve, reject) => {
        const args = ['-p', '--model', MODEL, '--output-format', 'json', '--tools', '', '--no-session-persistence'];
        // On Windows the CLI is a .cmd shim that must run through the shell,
        // where a JSON argument would be mangled, so the schema goes in the prompt only.
        if (!isWindows) args.push('--json-schema', JSON.stringify(schema));
        const fullPrompt = isWindows
          ? `${prompt}\n\nAnswer with JSON only, matching this JSON Schema:\n${JSON.stringify(schema)}`
          : prompt;

        const cmd = isWindows ? ['claude', ...args.map((a) => (a === '' ? '""' : a))].join(' ') : 'claude';
        const child = spawn(cmd, isWindows ? [] : args, {
          cwd: WORKDIR,
          shell: isWindows,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let out = '';
        let err = '';
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('Claude timed out'));
        }, TIMEOUT_MS);
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (err += d));
        child.on('error', (e) => {
          clearTimeout(timer);
          reject(
            e.code === 'ENOENT'
              ? new Error('The `claude` command was not found. Install Claude Code and sign in first.')
              : e,
          );
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          try {
            const res = JSON.parse(out);
            if (res.is_error) throw new Error(res.result || 'Claude returned an error');
            resolve(res.structured_output ?? parseJson(res.result));
          } catch (e) {
            reject(new Error(`${e.message}${code ? ` (exit ${code}) ${err.slice(0, 300)}` : ''}`));
          }
        });
        child.stdin.end(fullPrompt);
      }),
  );
}
