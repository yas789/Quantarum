#!/usr/bin/env node
const fetch = require("node-fetch");
const GRAPH = "https://graph.microsoft.com/v1.0";

const payload = JSON.parse(process.argv[2] || "{}");
const { verb, args } = payload;
const token = process.env.GRAPH_TOKEN; // Get token from environment

(async () => {
  try {
    if (verb !== "mail.send") return fail(10, "UNKNOWN_VERB");
    if (!token) return fail(13, "MISSING_TOKEN");

    const resp = await fetch(`${GRAPH}/me/sendMail`, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${token}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        message: {
          subject: args.subject,
          body: { contentType: "Text", content: args.body },
          toRecipients: [{ emailAddress: { address: args.to } }]
        },
        saveToSentItems: true
      })
    });
    
    if (!resp.ok) {
      const text = await resp.text();
      return fail(50, `GRAPH_ERROR ${resp.status} ${text}`);
    }
    
    // sendMail returns 202 with no body; create a simple receipt
    return ok({ status: "sent", messageId: Date.now().toString() });
  } catch (e) {
    return fail(50, e.message || "ADAPTER_ERROR");
  }
})();

function ok(data){ console.log(JSON.stringify({ ok:true, data })); }
function fail(code,msg){ console.error(JSON.stringify({ ok:false, code, msg })); process.exit(code); }
