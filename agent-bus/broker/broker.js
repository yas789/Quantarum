const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const app = express();
app.use(express.json());

// load manifests at startup
const manifests = {};
for (const tool of ["fs","outlook"]) {
  const p = path.join(__dirname, "..", "adapters", tool, "manifest.yaml");
  manifests[tool] = YAML.parse(fs.readFileSync(p, "utf8"));
}

// 1) Capabilities: agents discover tools here
app.get("/capabilities", (_req, res) => {
  res.json({
    schema_version: "0.1",
    tools: Object.entries(manifests).map(([tool_id, m]) => ({
      tool_id,
      version: m.version,
      verbs: m.verbs
    }))
  });
});

// 2) Invoke: run one verb
app.post("/invoke", (req, res) => {
  const { tool, verb, args, caller_id } = req.body || {};
  const m = manifests[tool];
  if (!m) return res.status(404).json({ ok:false, code:10, msg:"TOOL_NOT_FOUND" });
  const v = m.verbs.find(x => x.id === verb);
  if (!v) return res.status(400).json({ ok:false, code:10, msg:"VERB_NOT_FOUND" });

  // honor "confirm: true" from manifest
  if (v.confirm && req.header("x-confirm") !== "yes") {
    return res.status(403).json({ ok:false, code:12, msg:"CONFIRM_REQUIRED" });
  }

  const adapterPath = path.join(__dirname, "..", "adapters", tool, "cli.js");
  const payload = JSON.stringify({ 
    verb, 
    args, 
    token: process.env.GRAPH_TOKEN 
  });

  const child = spawn(adapterPath, [payload], { 
    stdio: ["ignore", "pipe", "pipe"] 
  });

  let out = "", err = "";
  child.stdout.on("data", d => out += d);
  child.stderr.on("data", d => err += d);

  child.on("close", (code) => {
    log({ tool, verb, caller_id, code, err });
    if (code === 0) return res.type("json").send(out);
    try { return res.status(500).json(JSON.parse(err)); }
    catch { return res.status(500).json({ ok:false, code:50, msg:"ADAPTER_ERROR" }); }
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Broker running at http://localhost:${PORT}`));

function log(obj){
  const line = JSON.stringify({ ts:new Date().toISOString(), ...obj }) + "\n";
  fs.mkdirSync(path.join(__dirname, "logs"), { recursive: true });
  fs.appendFileSync(path.join(__dirname, "logs", "bus.log"), line);
}
