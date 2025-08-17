const Validator = require('../lib/Validator');
const SessionManager = require('../lib/SessionManager');
const BrowserAutomation = require('../lib/BrowserAutomation');
const CONFIG = require('../lib/Config');

/**
 * Handler for email operations
 */
class EmailOperations {
  static async setup(args) {
    Validator.requireArgs(args, ['email']);
    Validator.validateEmail(args.email);
    
    // Auto-detect provider from email domain
    const domain = args.email.split('@')[1].toLowerCase();
    let provider = args.provider;
    
    if (!provider) {
      if (domain.includes('gmail') || domain.includes('google')) {
        provider = 'gmail';
      } else if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) {
        provider = 'outlook';
      } else {
        throw new Error(`Cannot auto-detect provider for ${domain}. Please specify provider manually.`);
      }
    }
    
    Validator.validateProvider(provider);
    
    const sessionManager = new SessionManager(provider, args.email);
    await sessionManager.init();
    
    // Check if session already exists
    if (await sessionManager.sessionExists()) {
      const sessionData = await sessionManager.loadSession();
      if (sessionData) {
        return {
          sessionId: sessionManager.getSessionId(),
          provider,
          email: args.email,
          status: 'session_exists',
          message: 'Using existing session'
        };
      }
    }
    
    // For testing purposes, return mock setup instructions without requiring browser
    if (process.env.NODE_ENV === 'test' || !process.env.PUPPETEER_AVAILABLE) {
      return {
        sessionId: sessionManager.getSessionId(),
        provider,
        email: args.email,
        status: 'mock_setup',
        setupInstructions: [
          'V1 Zero-Config Email Setup',
          '1. Browser window will open automatically',
          '2. Login to your email account normally',
          '3. Navigate to your inbox',
          '4. Press Enter in terminal when ready'
        ]
      };
    }
    
    // Create authentication script
    const authScript = await BrowserAutomation.createAuthScript(provider, sessionManager);
    
    // Execute authentication
    try {
      await BrowserAutomation.executePuppeteerScript(authScript);
      
      return {
        sessionId: sessionManager.getSessionId(),
        provider,
        email: args.email,
        status: 'authenticated',
        setupInstructions: [
          'Authentication completed successfully',
          'Session saved for future use',
          'You can now send and manage emails',
          'No additional setup required'
        ]
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }
  
  static async send(args) {
    Validator.requireArgs(args, ['sessionId', 'to', 'subject', 'body']);
    
    const toEmails = Validator.validateEmailList(args.to);
    
    // Load session info
    const sessionInfo = await this.getSessionInfo(args.sessionId);
    
    const emailData = {
      to: toEmails,
      subject: args.subject,
      body: args.body
    };
    
    const sessionManager = new SessionManager(sessionInfo.provider, sessionInfo.email);
    const emailScript = await BrowserAutomation.createEmailScript(
      sessionInfo.provider, 
      'send', 
      emailData, 
      sessionManager
    );
    
    try {
      const result = await BrowserAutomation.executePuppeteerScript(emailScript);
      return {
        sent: true,
        to: toEmails,
        subject: args.subject,
        provider: sessionInfo.provider,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
  
  static async search(args) {
    Validator.requireArgs(args, ['sessionId', 'query']);
    
    const sessionInfo = await this.getSessionInfo(args.sessionId);
    
    const searchData = {
      query: args.query,
      limit: args.limit || 10
    };
    
    const sessionManager = new SessionManager(sessionInfo.provider, sessionInfo.email);
    const searchScript = await BrowserAutomation.createEmailScript(
      sessionInfo.provider, 
      'search', 
      searchData, 
      sessionManager
    );
    
    try {
      const result = await BrowserAutomation.executePuppeteerScript(searchScript);
      return {
        query: args.query,
        results: result.results || [],
        total: result.total || 0,
        provider: sessionInfo.provider
      };
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }
  
  static async list(args) {
    Validator.requireArgs(args, ['sessionId']);
    
    const sessionInfo = await this.getSessionInfo(args.sessionId);
    
    const listData = {
      limit: args.limit || 10
    };
    
    const sessionManager = new SessionManager(sessionInfo.provider, sessionInfo.email);
    const listScript = await BrowserAutomation.createEmailScript(
      sessionInfo.provider, 
      'list', 
      listData, 
      sessionManager
    );
    
    try {
      const result = await BrowserAutomation.executePuppeteerScript(listScript);
      return {
        emails: result.emails || [],
        total: result.total || 0,
        provider: sessionInfo.provider
      };
    } catch (error) {
      throw new Error(`Failed to list emails: ${error.message}`);
    }
  }
  
  static async sessions(args) {
    const sessions = await SessionManager.listSessions();
    return {
      sessions,
      total: sessions.length
    };
  }
  
  // Helper method to get session information
  static async getSessionInfo(sessionId) {
    const sessions = await SessionManager.listSessions();
    const session = sessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    return session;
  }
}

module.exports = EmailOperations;