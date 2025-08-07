const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');
const config = require('./config');

/**
 * Simple keyword-based tool router that matches goals to relevant tools
 */
class ToolRouter {
  constructor(manifests) {
    this.manifests = manifests;
    this.verbKeywords = this._buildVerbKeywords();
    this.toolCoOccurrence = this._buildCoOccurrenceRules();
    this.toolpackCache = new Map();
  }

  /**
   * Build a map of keywords to verbs for matching
   */
  _buildVerbKeywords() {
    const verbKeywords = [];
    
    for (const [toolId, manifest] of Object.entries(this.manifests)) {
      for (const verb of manifest.verbs) {
        const keywords = [];
        
        // Add verb ID parts as keywords
        keywords.push(...verb.id.split('.').filter(Boolean));
        
        // Add description words if available
        if (verb.description) {
          keywords.push(...verb.description.toLowerCase().split(/\s+/));
        }
        
        // Add example call properties if available
        if (verb.examples) {
          for (const example of verb.examples) {
            if (example.name) keywords.push(...example.name.toLowerCase().split(/\s+/));
            if (example.description) keywords.push(...example.description.toLowerCase().split(/\s+/));
          }
        }
        
        // Add to our index
        verbKeywords.push({
          toolId,
          verbId: verb.id,
          keywords: [...new Set(keywords.filter(k => k.length > 2))], // Remove duplicates and short words
          trustTier: manifest.trust_tier,
          verb
        });
      }
    }
    
    return verbKeywords;
  }

  /**
   * Define which tools are commonly used together
   */
  _buildCoOccurrenceRules() {
    return {
      'fs.read': ['fs.search', 'clipboard.set'],
      'fs.search': ['fs.read'],
      'mail.send': ['fs.read', 'clipboard.get'],
      'web.search': ['web.open', 'web.read'],
      'web.chatgpt.chat.send': ['clipboard.set', 'fs.write']
    };
  }

  /**
   * Find relevant tools for a given goal
   */
  findToolsForGoal(goal, maxTools = 8) {
    const goalWords = goal.toLowerCase().split(/\s+/);
    const matchedVerbs = [];
    
    // Score each verb based on keyword matches
    for (const verbInfo of this.verbKeywords) {
      let score = 0;
      
      for (const keyword of verbInfo.keywords) {
        for (const word of goalWords) {
          if (word.length < 3) continue; // Skip short words
          
          if (keyword.includes(word) || word.includes(keyword)) {
            score++;
          }
        }
      }
      
      if (score > 0) {
        matchedVerbs.push({
          ...verbInfo,
          score
        });
      }
    }
    
    // Sort by score (highest first) and trust tier (A > B > C)
    matchedVerbs.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.trustTier.localeCompare(b.trustTier);
    });
    
    // Add co-occurring tools
    const selectedVerbs = new Set();
    const result = [];
    
    // First pass: add directly matched verbs
    for (const verb of matchedVerbs) {
      if (result.length >= maxTools) break;
      
      if (!selectedVerbs.has(verb.verbId)) {
        result.push(verb);
        selectedVerbs.add(verb.verbId);
      }
    }
    
    // Second pass: add co-occurring tools
    const coOccurring = [];
    for (const verb of result) {
      const related = this.toolCoOccurrence[verb.verbId] || [];
      
      for (const relatedVerbId of related) {
        if (!selectedVerbs.has(relatedVerbId)) {
          const relatedVerb = this.verbKeywords.find(v => v.verbId === relatedVerbId);
          if (relatedVerb) {
            coOccurring.push({
              ...relatedVerb,
              isCoOccurring: true
            });
            selectedVerbs.add(relatedVerbId);
          }
        }
      }
    }
    
    // Add co-occurring tools if we have space
    result.push(...coOccurring.filter((_, i) => result.length + i < maxTools));
    
    return result;
  }

  /**
   * Create a toolpack for a given goal
   */
  createToolpack(goal, maxTools = 8) {
    const toolpackId = uuidv4();
    const relevantTools = this.findToolsForGoal(goal, maxTools);
    
    // Format the response
    const toolpack = {
      toolpack_id: toolpackId,
      goal,
      tools: relevantTools.map(tool => ({
        tool_id: tool.toolId,
        verb: tool.verbId,
        description: tool.verb.description || '',
        args_schema: tool.verb.args,
        returns_schema: tool.verb.returns,
        trust_tier: tool.trustTier,
        confirm: !!tool.verb.confirm,
        examples: tool.verb.examples || []
      })),
      ttl_seconds: Math.floor(config.TOOLPACK_TTL / 1000)
    };
    
    // Cache the toolpack
    this.toolpackCache.set(toolpackId, {
      ...toolpack,
      expires: Date.now() + config.TOOLPACK_TTL
    });
    
    // Schedule cleanup
    setTimeout(() => {
      this.toolpackCache.delete(toolpackId);
    }, config.TOOLPACK_TTL);
    
    logger.info(`Created toolpack ${toolpackId} for goal: ${goal}`, {
      toolpackId,
      goal,
      toolCount: toolpack.tools.length
    });
    
    return toolpack;
  }

  /**
   * Validate if a tool/verb is allowed in a toolpack
   */
  validateToolpackAccess(toolpackId, toolId, verbId) {
    if (!toolpackId) return true; // No toolpack restriction
    
    const toolpack = this.toolpackCache.get(toolpackId);
    if (!toolpack) {
      return { valid: false, error: 'TOOLPACK_EXPIRED' };
    }
    
    const isAllowed = toolpack.tools.some(
      tool => tool.tool_id === toolId && tool.verb === verbId
    );
    
    if (!isAllowed) {
      return { 
        valid: false, 
        error: 'TOOL_NOT_IN_PACK',
        message: `Tool ${toolId}.${verbId} is not in the allowed toolpack`
      };
    }
    
    return { valid: true };
  }
}

module.exports = ToolRouter;
