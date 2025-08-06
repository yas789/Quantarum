#!/usr/bin/env node
const fs = require("fs").promises;
const path = require("path");

// read one JSON arg
const payload = JSON.parse(process.argv[2] || "{}");
const { verb, args } = payload;

(async () => {
  try {
    if (verb === "fs.mkdir") {
      await fs.mkdir(args.path, { recursive: true });
      return ok({ path: args.path });
    }
    if (verb === "fs.read") {
      const content = await fs.readFile(args.path, "utf8");
      return ok({ content });
    }
    if (verb === "fs.write") {
      await fs.mkdir(path.dirname(args.path), { recursive: true });
      await fs.writeFile(args.path, args.content, "utf8");
      return ok({ bytes: Buffer.byteLength(args.content) });
    }
    return fail(10, "UNKNOWN_VERB");
  } catch (e) {
    return fail(50, e.message || "ADAPTER_ERROR");
  }
})();

function ok(data){ console.log(JSON.stringify({ ok:true, data })); }
function fail(code,msg){ console.error(JSON.stringify({ ok:false, code, msg })); process.exit(code); }
