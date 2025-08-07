#!/usr/bin/env node
const { execFile } = require("child_process");

const payload = JSON.parse(process.argv[2] || "{}");
const { verb, args } = payload;

if (verb !== "mail.send") {
  fail(10, "UNKNOWN_VERB");
}

// Escape special characters for AppleScript
function escapeString(str) {
  return str.replace(/[\\"]/g, '\\$&');
}

const script = `
tell application "Mail"
  set m to make new outgoing message with properties {subject:${JSON.stringify(args.subject || '')}, content:${JSON.stringify((args.body || '') + '\n')}, visible:false}
  tell m to make new to recipient at end of to recipients with properties {address:${JSON.stringify(args.to || '')}}
  send m
end tell`;

execFile("osascript", ["-e", script], (err) => {
  if (err) {
    console.error('Error executing AppleScript:', err);
    return fail(50, `Failed to send email: ${err.message}`);
  }
  ok({ status: "sent", via: "apple-mail" });
});

function ok(d) { 
  console.log(JSON.stringify({ ok: true, data: d }));
}

function fail(code, msg) { 
  console.error(JSON.stringify({ ok: false, code, msg })); 
  process.exit(code);
}
