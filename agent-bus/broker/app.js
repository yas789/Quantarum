const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const { logger, logRequest } = require('./logger');
const { loadManifests, getAllVerbs } = require('./manifestLoader');
const ToolRouter = require('./toolRouter');

class Broker {
  constructor() {
    this.app = express();
    this.manifests = {};
    this.verbCache = new Map(); // Cache for verb lookups
    this.toolRouter = null;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Log all requests
    this.app.use(logRequest);
    
    // Add request ID
    this.app.use((req, res, next) => {
      req.id = uuidv4();
      next();
    });
    
    // Error handling
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        requestId: req.id
      });
      
      res.status(500).json({
        ok: false,
        code: 50,
        msg: 'INTERNAL_ERROR',
        request_id: req.id
      });
    });
  }

  async loadTools() {
    try {
      const manifestsDir = path.join(__dirname, '..', 'manifests');
      const { manifests, errors } = await loadManifests(manifestsDir);
      
      this.manifests = manifests;
      this.toolRouter = new ToolRouter(manifests);
      
      // Build verb cache for faster lookups
      this.verbCache.clear();
      for (const [toolId, manifest] of Object.entries(manifests)) {
        for (const verb of manifest.verbs) {
          this.verbCache.set(verb.id, { toolId, verb });
        }
      }
      
      logger.info(`Loaded ${Object.keys(manifests).length} tool manifests with ${this.verbCache.size} verbs`);
      return { manifests, errors };
      
    } catch (error) {
      logger.error('Failed to load tools', { error: error.message });
      throw error;
    }
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', version: config.VERSION });
    });

    // Get capabilities
    this.app.get('/capabilities', (req, res) => {
      const tools = [];
      
      for (const [toolId, manifest] of Object.entries(this.manifests)) {
        tools.push({
          tool_id: toolId,
          version: manifest.version,
          trust_tier: manifest.trust_tier,
          description: manifest.description || '',
          verbs: manifest.verbs.map(verb => ({
            id: verb.id,
            description: verb.description || '',
            args_schema: verb.args,
            returns_schema: verb.returns,
            confirm: !!verb.confirm,
            examples: verb.examples || []
          }))
        });
      }
      
      res.json({
        schema_version: '1.0',
        tools
      });
    });

    // Outlook desktop mode: no auth endpoints needed

    // Plan tool usage
    this.app.post('/plan', async (req, res, next) => {
      try {
        const { goal, max_tools = 8 } = req.body;
        
        if (!goal) {
          return res.status(400).json({
            ok: false,
            code: 10,
            msg: 'INVALID_ARGS',
            details: 'Missing required field: goal'
          });
        }
        
        const toolpack = this.toolRouter.createToolpack(goal, max_tools);
        res.json({
          ok: true,
          data: toolpack
        });
        
      } catch (error) {
        next(error);
      }
    });

    // Invoke a tool
    this.app.post('/invoke', async (req, res, next) => {
      const startTime = Date.now();
      const { tool, verb, args = {}, caller_id, toolpack_id } = req.body;
      const requestId = req.id;
      
      try {
        // Input validation
        if (!tool || !verb) {
          return res.status(400).json({
            ok: false,
            code: 10,
            msg: 'INVALID_ARGS',
            details: 'Missing required fields: tool, verb'
          });
        }
        
        // Determine the full verb id (accept shorthand like 'read')
        const requestedVerbId = this.verbCache.has(verb) ? verb : `${tool}.${verb}`;

        // Check toolpack access if toolpack_id is provided
        if (toolpack_id) {
          const { valid, error, message } = this.toolRouter.validateToolpackAccess(
            toolpack_id,
            tool,
            requestedVerbId
          );
          
          if (!valid) {
            return res.status(403).json({
              ok: false,
              code: 11, // NO_SCOPE
              msg: error,
              details: message
            });
          }
        }
        
        // Find the tool and verb
        const verbInfo = this.verbCache.get(requestedVerbId);
        if (!verbInfo || verbInfo.toolId !== tool) {
          return res.status(404).json({
            ok: false,
            code: 10,
            msg: 'UNKNOWN_VERB',
            details: `Unknown tool/verb: ${tool}.${verb}`
          });
        }
        
        const { verb: verbDef } = verbInfo;
        
        // Check for required confirmation
        if (verbDef.confirm && req.get('x-confirm') !== 'yes') {
          return res.status(403).json({
            ok: false,
            code: 12,
            msg: 'CONFIRM_REQUIRED',
            details: `Confirmation required for ${tool}.${verb}`
          });
        }
        
        // Execute the tool
        const result = await this.executeTool(tool, requestedVerbId, args);
        const duration = Date.now() - startTime;
        
        // Log the invocation
        logger.logInvocation(
          tool,
          verb,
          args,
          { ...result, duration },
          null,
          caller_id
        );
        
        res.json({
          ok: true,
          data: result.data,
          meta: {
            tool,
            verb: requestedVerbId,
            duration_ms: duration,
            request_id: requestId
          }
        });
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Log the error
        logger.logInvocation(
          tool,
          verb,
          args,
          { duration },
          error,
          caller_id
        );
        
        next(error);
      }
    });
  }

  async executeTool(tool, verb, args, envExtra = {}) {
    const adapterPath = path.join(__dirname, '..', 'adapters', tool, 'cli.js');
    
    try {
      // Check if the adapter exists
      await fs.access(adapterPath);
      
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ verb, args });
        const child = spawn('node', [adapterPath, payload], {
          env: { ...process.env, PATH: process.env.PATH, ...envExtra },
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (code) => {
          try {
            if (code !== 0) {
              const error = stderr ? JSON.parse(stderr) : {
                ok: false,
                code: 50,
                msg: 'ADAPTER_ERROR',
                details: `Process exited with code ${code}`
              };
              return reject(new Error(error.msg || 'ADAPTER_ERROR'));
            }
            
            const result = JSON.parse(stdout);
            if (!result.ok) {
              const err = new Error(result.msg || 'ADAPTER_ERROR');
              err.code = result.code || 50;
              return reject(err);
            }
            
            resolve(result);
            
          } catch (error) {
            reject(new Error(`Failed to parse adapter output: ${error.message}`));
          }
        });
        
        child.on('error', (error) => {
          reject(new Error(`Failed to start adapter: ${error.message}`));
        });
      });
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Adapter not found for tool: ${tool}`);
      }
      throw error;
    }
  }

  async start(port = config.PORT) {
    try {
      // Load tools and manifests
      await this.loadTools();
      
      // Start the server
      return new Promise((resolve) => {
        this.server = this.app.listen(port, () => {
          logger.info(`Server running on http://localhost:${port}`);
          resolve(this.server);
        });
      });
      
    } catch (error) {
      logger.error('Failed to start server', { error: error.message });
      process.exit(1);
    }
  }

  async stop() {
    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
      logger.info('Server stopped');
    }
  }
}

// Export a singleton instance
const broker = new Broker();
module.exports = broker;
