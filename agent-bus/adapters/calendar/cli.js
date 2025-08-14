#!/usr/bin/env node
// Thin wrapper that maps generic calendar verbs to the local Calendar.app adapter
const { spawn } = require('child_process');
const path = require('path');

const payload = JSON.parse(process.argv[2] || '{}');
let { verb, args = {} } = payload;

// Normalize accepted verb ids
const normalizeVerb = (v) => {
  if (!v) return '';
  if (v.startsWith('calendar.')) return v;
  // Allow shorthand: create/invite
  if (v === 'create' || v === 'invite') return `calendar.${v}`;
  return v;
};

const mapToLocal = (v) => v.replace(/^calendar\./, 'calendar_local.');

(async () => {
  try {
    const normalized = normalizeVerb(verb);
    if (!normalized || !/^calendar\.(create|invite)$/.test(normalized)) {
      console.error(JSON.stringify({ ok: false, code: 10, msg: 'UNKNOWN_VERB' }));
      process.exit(1);
    }

    const localVerb = mapToLocal(normalized);
    const localAdapter = path.join(__dirname, '..', 'calendar_local', 'cli.js');

    const child = spawn('node', [localAdapter, JSON.stringify({ verb: localVerb, args })], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        // Pass through structured error if present
        try {
          const err = stderr ? JSON.parse(stderr) : { ok: false, code: 50, msg: 'ADAPTER_ERROR' };
          console.error(JSON.stringify(err));
        } catch (_) {
          console.error(JSON.stringify({ ok: false, code: 50, msg: 'ADAPTER_ERROR', details: stderr.trim() }));
        }
        process.exit(1);
      }
      process.stdout.write(stdout);
    });

    child.on('error', (e) => {
      console.error(JSON.stringify({ ok: false, code: 50, msg: 'ADAPTER_ERROR', details: e.message }));
      process.exit(1);
    });
  } catch (e) {
    console.error(JSON.stringify({ ok: false, code: 50, msg: 'ADAPTER_ERROR', details: e.message }));
    process.exit(1);
  }
})();

