#!/usr/bin/env node

// Entry point for the agent-bus server

const broker = require('./app');
const config = require('./config');
const { logger } = require('./logger');

// Handle process termination
async function shutdown() {
  logger.info('Shutting down...');
  
  try {
    await broker.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

// Handle signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

// Start the server
(async () => {
  try {
    await broker.start(config.PORT);
    logger.info('Agent Bus is ready');
  } catch (error) {
    logger.error('Failed to start Agent Bus', { error: error.message });
    process.exit(1);
  }
})();

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

// 2) Auth endpoints
app.get("/auth/outlook/device", async (req, res) => {
  try {
    const authResponse = await initiateDeviceCodeLogin();
    res.json({
      ok: true,
      message: 'Please check your console for the device code and visit the URL to authenticate.',
      code: authResponse.userCode,
      verificationUri: authResponse.verificationUri
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 3) Check auth status
app.get("/auth/outlook/status", async (req, res) => {
  try {
    const token = await getToken();
    res.json({ authenticated: !!token });
  } catch (error) {
    res.json({ authenticated: false, error: error.message });
  }
});

// 4) Invoke: run one verb
app.post("/invoke", async (req, res) => {
  console.log('Received request:', JSON.stringify(req.body, null, 2));
  const { tool, verb, args, caller_id } = req.body || {};
  const m = manifests[tool];
  if (!m) return res.status(404).json({ ok:false, code:10, msg:"TOOL_NOT_FOUND" });
  const v = m.verbs.find(x => x.id === verb);
  if (!v) return res.status(400).json({ ok:false, code:10, msg:"VERB_NOT_FOUND" });

  // Check for Outlook authentication
  if (tool === 'outlook') {
    const token = await getToken();
    if (!token) {
      return res.status(401).json({ 
        ok: false, 
        code: 401, 
        needs_login: "outlook", 
        login_url: "http://localhost:4000/auth/outlook/device" 
      });
    }
    // Add token to the environment for the adapter
    process.env.GRAPH_TOKEN = token;
  }

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
