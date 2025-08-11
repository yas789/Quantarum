#!/usr/bin/env node
const { execFile } = require('child_process');

const payload = JSON.parse(process.argv[2] || '{}');
let { verb, args = {} } = payload;

// Accept: 'outlook.send', 'mail.send', 'send'
if (verb && !verb.startsWith('outlook.')) {
  if (verb === 'send' || verb === 'mail.send') verb = 'outlook.send';
}
if (verb !== 'outlook.send') return fail(10, 'UNKNOWN_VERB');

if (!args.to || !args.subject || args.body == null) {
  return fail(10, 'MISSING_ARGUMENTS', { required: ['to', 'subject', 'body'] });
}

const esc = (s) => JSON.stringify(String(s));
const script = `
tell application "Microsoft Outlook"
  set newMessage to make new outgoing message with properties {subject:${esc(args.subject)}, content:${esc(String(args.body) + "\n")}}
  make new recipient at newMessage with properties {email address:{address:${esc(args.to)}}}
  send newMessage
end tell`;

execFile('osascript', ['-e', script], (err) => {
  if (err) return fail(50, `Failed to send via Outlook: ${err.message}`);
  ok({ success: true, via: 'outlook.desktop' });
});

function ok(data){ console.log(JSON.stringify({ ok:true, data })); }
function fail(code,msg,details){ console.error(JSON.stringify({ ok:false, code, msg, ...(details&&{details}) })); process.exit(1); }
