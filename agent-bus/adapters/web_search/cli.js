#!/usr/bin/env node

// Wrapper adapter exposing web search without dots in tool id
// Reuses logic from adapters/web/search/cli.js

const path = require('path');
const { spawn } = require('child_process');

const payload = JSON.parse(process.argv[2] || '{}');
let { verb, args = {} } = payload;

// Normalize verbs: accept 'search' or prefixed forms
// Map to the underlying adapter's expected verbs 'web.search' / 'web.suggest'
function mapVerb(v) {
  if (!v) return v;
  if (v === 'search' || v === 'web_search.search') return 'web.search';
  if (v === 'suggest' || v === 'web_search.suggest') return 'web.suggest';
  if (v === 'web.search' || v === 'web.suggest') return v;
  return v; // pass-through
}

const underlyingVerb = mapVerb(verb);

const ok = (data) => console.log(JSON.stringify({ ok: true, data }));
const fail = (code, msg, details) => {
  console.error(JSON.stringify({ ok: false, code, msg, ...(details && { details }) }));
  process.exit(1);
};

if (underlyingVerb !== 'web.search' && underlyingVerb !== 'web.suggest') {
  fail(10, 'UNKNOWN_VERB');
}

const underlyingPath = path.join(__dirname, '..', 'web', 'search', 'cli.js');

const child = spawn('node', [underlyingPath, JSON.stringify({ verb: underlyingVerb, args })], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env
});

let out = '';
let err = '';
child.stdout.on('data', d => out += d);
child.stderr.on('data', d => err += d);
child.on('close', (code) => {
  if (code === 0) return process.stdout.write(out);
  try { return process.stderr.write(err); }
  catch { return fail(50, 'ADAPTER_ERROR'); }
});

