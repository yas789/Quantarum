const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const CONFIG = require('./Config');

/**
 * Manages email session storage and retrieval
 */
class SessionManager {
  constructor(provider, email) {
    this.provider = provider;
    this.email = email;
    this.cacheDir = CONFIG.CACHE_DIR;
    
    // Generate session ID from email and provider
    const sessionInput = `${email}_${provider}`;
    this.sessionId = crypto.createHash('md5').update(sessionInput).digest('hex');
    this.sessionPath = path.join(this.cacheDir, `${this.sessionId}_cookies.json`);
  }
  
  async init() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
  
  async saveSession(cookies) {
    try {
      await this.init();
      const sessionData = {
        cookies,
        provider: this.provider,
        email: this.email,
        timestamp: Date.now()
      };
      
      await fs.writeFile(this.sessionPath, JSON.stringify(sessionData, null, 2));
      return this.sessionId;
    } catch (error) {
      throw new Error(`Failed to save session: ${error.message}`);
    }
  }
  
  async loadSession() {
    try {
      const sessionData = JSON.parse(await fs.readFile(this.sessionPath, 'utf8'));
      
      // Check if session is expired
      const age = Date.now() - sessionData.timestamp;
      if (age > CONFIG.SESSION_TIMEOUT) {
        await this.deleteSession();
        return null;
      }
      
      return sessionData;
    } catch (error) {
      return null;
    }
  }
  
  async deleteSession() {
    try {
      await fs.unlink(this.sessionPath);
    } catch (error) {
      // Session file might not exist
    }
  }
  
  async sessionExists() {
    try {
      await fs.access(this.sessionPath);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  getSessionId() {
    return this.sessionId;
  }
  
  static async listSessions() {
    try {
      const files = await fs.readdir(CONFIG.CACHE_DIR);
      const sessions = [];
      
      for (const file of files) {
        if (file.endsWith('_cookies.json')) {
          try {
            const sessionPath = path.join(CONFIG.CACHE_DIR, file);
            const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
            sessions.push({
              sessionId: file.replace('_cookies.json', ''),
              provider: sessionData.provider,
              email: sessionData.email,
              created: new Date(sessionData.timestamp).toISOString()
            });
          } catch (error) {
            // Skip invalid session files
          }
        }
      }
      
      return sessions;
    } catch (error) {
      return [];
    }
  }
}

module.exports = SessionManager;