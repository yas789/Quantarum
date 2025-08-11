#!/usr/bin/env node
// Stub adapter for web_chatgpt to satisfy capabilities; not implemented

const payload = JSON.parse(process.argv[2] || '{}');
const { verb } = payload;

const ok = (data) => console.log(JSON.stringify({ ok: true, data }));
const fail = (code, msg, details) => {
  console.error(JSON.stringify({ ok: false, code, msg, ...(details && { details }) }));
  process.exit(1);
};

if (!verb || !verb.startsWith('web_chatgpt.')) {
  return fail(10, 'UNKNOWN_VERB');
}

fail(51, 'NOT_IMPLEMENTED', { verb });

