#!/usr/bin/env node
const { execFile } = require('child_process');

const payload = JSON.parse(process.argv[2] || '{}');
let { verb, args = {} } = payload;

// Normalize verb id: accept 'send', 'mail.send', 'mail_local.send'
if (verb && !verb.startsWith('mail_local.')) {
  if (verb === 'send' || verb === 'mail.send') verb = 'mail_local.send';
}

if (verb !== 'mail_local.send') {
  return fail(10, 'UNKNOWN_VERB');
}

// Validate args according to manifest
if (!Array.isArray(args.to) || args.to.length === 0) {
  return fail(10, 'MISSING_ARGUMENTS', { missing: ['to'] });
}
if (!args.subject) {
  return fail(10, 'MISSING_ARGUMENTS', { missing: ['subject'] });
}
if (args.body == null) {
  return fail(10, 'MISSING_ARGUMENTS', { missing: ['body'] });
}

const toList = (args.to || []).map(String);
const ccList = (args.cc || []).map(String);
const bccList = (args.bcc || []).map(String);
const body = String(args.body || '') + '\n';
const subject = String(args.subject || '');

// AppleScript for Mail.app
const esc = (s) => JSON.stringify(s);

function recipientsBlock(kind, list) {
  if (!list || list.length === 0) return '';
  const lines = list.map(addr => `tell m to make new ${kind} recipient at end of ${kind} recipients with properties {address:${esc(addr)}}`).join('\n  ');
  return `\n  ${lines}`;
}

function attachmentsBlock(paths) {
  if (!paths || paths.length === 0) return '';
  const lines = paths.map(p => `tell m to make new attachment with properties {file name:(POSIX file ${esc(p)})} at after last paragraph`).join('\n  ');
  return `\n  ${lines}`;
}

const script = `
tell application "Mail"
  set m to make new outgoing message with properties {subject:${esc(subject)}, content:${esc(body)}, visible:false}
  ${recipientsBlock('to', toList)}
  ${recipientsBlock('cc', ccList)}
  ${recipientsBlock('bcc', bccList)}
  ${attachmentsBlock(args.attachments || [])}
  send m
end tell`;

execFile('osascript', ['-e', script], (err) => {
  if (err) {
    return fail(50, `Failed to send email: ${err.message}`);
  }
  ok({ success: true, via: 'mail.app' });
});

function ok(d) { console.log(JSON.stringify({ ok: true, data: d })); }
function fail(code, msg, details) {
  console.error(JSON.stringify({ ok: false, code, msg, ...(details && { details }) }));
  process.exit(1);
}

