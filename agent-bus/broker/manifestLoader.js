const fs = require('fs').promises;
const path = require('path');
const YAML = require('yaml');
const Ajv = require('ajv');
const { logger } = require('./logger');

const ajv = new Ajv({ allErrors: true, strict: false });

// Schema for validating tool manifests
const manifestSchema = {
  type: 'object',
  required: ['tool_id', 'version', 'trust_tier', 'verbs'],
  properties: {
    tool_id: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    trust_tier: { type: 'string', enum: ['A', 'B', 'C'] },
    description: { type: 'string' },
    verbs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'args', 'returns'],
        properties: {
          id: { type: 'string', pattern: '^[a-z]+\\.[a-z][a-z0-9_]*$' },
          description: { type: 'string' },
          args: { type: 'object' },
          returns: { type: 'object' },
          confirm: { type: 'boolean', default: false },
          examples: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                call: { type: 'object' },
                expect: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }
};

const validateManifest = ajv.compile(manifestSchema);

/**
 * Load and validate all tool manifests
 */
async function loadManifests(manifestsDir) {
  const manifests = {};
  const errors = [];
  
  try {
    const toolDirs = await fs.readdir(manifestsDir, { withFileTypes: true });
    
    for (const dirent of toolDirs) {
      if (!dirent.isDirectory()) continue;
      
      const toolId = dirent.name;
      const manifestPath = path.join(manifestsDir, toolId, 'manifest.yaml');
      
      try {
        // Read and parse the manifest
        const manifestContent = await fs.readFile(manifestPath, 'utf8');
        const manifest = YAML.parse(manifestContent);
        
        // Validate against schema
        const valid = validateManifest(manifest);
        if (!valid) {
          errors.push({
            tool: toolId,
            error: 'Invalid manifest schema',
            details: validateManifest.errors
          });
          continue;
        }
        
        // Ensure tool_id matches directory name
        if (manifest.tool_id !== toolId) {
          errors.push({
            tool: toolId,
            error: `tool_id '${manifest.tool_id}' does not match directory name`
          });
          continue;
        }
        
        // Validate verb IDs match the tool_id
        for (const verb of manifest.verbs) {
          const [toolPrefix] = verb.id.split('.');
          if (toolPrefix !== toolId) {
            errors.push({
              tool: toolId,
              verb: verb.id,
              error: `Verb ID must start with tool_id (${toolId}.)`
            });
          }
        }
        
        manifests[toolId] = manifest;
        logger.info(`Loaded manifest for tool: ${toolId}@${manifest.version}`);
        
      } catch (error) {
        errors.push({
          tool: toolId,
          error: 'Failed to load manifest',
          details: error.message
        });
      }
    }
    
    // Log any errors
    if (errors.length > 0) {
      logger.warn(`Encountered ${errors.length} errors loading manifests`, { errors });
    }
    
    return { manifests, errors };
    
  } catch (error) {
    logger.error('Failed to load manifests', { error: error.message });
    throw error;
  }
}

/**
 * Get a flattened list of all verbs across all tools
 */
function getAllVerbs(manifests) {
  const verbs = [];
  
  for (const toolId in manifests) {
    const manifest = manifests[toolId];
    
    for (const verb of manifest.verbs) {
      verbs.push({
        id: verb.id,
        tool_id: toolId,
        ...verb,
        trust_tier: manifest.trust_tier,
        description: verb.description || ''
      });
    }
  }
  
  return verbs;
}

module.exports = {
  loadManifests,
  getAllVerbs,
  manifestSchema
};
