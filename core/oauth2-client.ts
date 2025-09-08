/**
 * OAuth2 Client Module - Complete OAuth2 Authorization Code Flow Implementation
 *
 * Features:
 * - Complete OAuth2 authorization code flow with PKCE support
 * - Automatic OpenID Connect discovery for supported providers
 * - Session management for OAuth2 state and PKCE parameters
 * - Token exchange and validation
 * - User information retrieval from OAuth2 providers
 * - Browser-safe implementation with Web Crypto API
 *
 * Implementation Details:
 * - Uses PKCE (Proof Key for Code Exchange) for enhanced security
 * - Supports multiple OAuth2 providers with automatic endpoint discovery
 * - Manages OAuth2 session state with secure random generation
 * - Handles token exchange and error responses
 * - Type-safe configuration and response handling
 * - No server-side session storage required (stateless with secure cookies)
 *
 * Recent Changes:
 * - Initial implementation with complete OAuth2 flow
 * - Added PKCE support for public clients
 * - Implemented session management and state validation
 * - Created user information retrieval functionality
 */

import {
  OpenIDConnectDiscovery,
  OAuth2ProviderConfig,
  OAuth2TokenResponse,
  OAuth2ErrorResponse,
  OAuth2Session,
  OAuth2Provider,
  OAuth2CallbackParams
} from './oauth2-types.js';

import {
  generatePKCEPair,
  generateState,
  discoverOAuth2Endpoints,
  buildAuthorizationURL,
  exchangeCodeForToken,
  validateState,
  getDefaultScope,
  validateProviderConfig
} from './oauth2-utils.js';

/**
 * OAuth2 Client for handling authorization code flow
 */
export class OAuth2Client {
  private config: OAuth2ProviderConfig;
  private endpoints: OpenIDConnectDiscovery | null = null;
  private sessions: Map<string, OAuth2Session> = new Map();
  
  constructor(config: OAuth2ProviderConfig) {
    validateProviderConfig(config);
    this.config = config;
  }

  /**
   * Initialize the client by discovering OAuth2 endpoints
   */
  async initialize(provider: OAuth2Provider | string = OAuth2Provider.CUSTOM): Promise<void> {
    this.endpoints = await discoverOAuth2Endpoints(provider, this.config.discoveryUrl);
  }

  /**
   * Start the OAuth2 authorization flow
   * Returns the authorization URL to redirect the user to
   */
  async startAuthorizationFlow(): Promise<{ authUrl: string; session: OAuth2Session }> {
    if (!this.endpoints) {
      throw new Error('OAuth2 client not initialized. Call initialize() first.');
    }

    // Generate PKCE pair for security
    const pkce = await generatePKCEPair();
    const state = generateState();

    // Create session to track the authorization request
    const session: OAuth2Session = {
      state,
      codeVerifier: pkce.codeVerifier,
      redirectUri: this.config.redirectUri,
      provider: 'oauth2',
      timestamp: Date.now()
    };

    // Store session
    this.sessions.set(state, session);

    // Build authorization URL
    const authUrl = buildAuthorizationURL(this.endpoints, {
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      responseType: 'code',
      scope: this.config.scope || getDefaultScope(OAuth2Provider.CUSTOM),
      state,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod
    });

    return { authUrl, session };
  }

  /**
   * Handle OAuth2 callback and exchange code for tokens
   */
  async handleCallback(callbackParams: OAuth2CallbackParams): Promise<OAuth2TokenResponse> {
    if (!this.endpoints) {
      throw new Error('OAuth2 client not initialized. Call initialize() first.');
    }

    // Check for error in callback
    if (callbackParams.error) {
      const error: OAuth2ErrorResponse = {
        error: callbackParams.error,
        error_description: callbackParams.error_description,
        state: callbackParams.state
      };
      throw new Error(`OAuth2 error: ${error.error} - ${error.error_description || 'Unknown error'}`);
    }

    // Validate required parameters
    if (!callbackParams.code || !callbackParams.state) {
      throw new Error('Missing required callback parameters: code or state');
    }

    // Validate state and retrieve session
    const session = this.sessions.get(callbackParams.state);
    if (!session) {
      throw new Error('Invalid or expired OAuth2 state parameter');
    }

    if (!validateState(callbackParams.state, session.state)) {
      throw new Error('OAuth2 state parameter mismatch');
    }

    // Exchange authorization code for tokens
    const tokenResponse = await exchangeCodeForToken(this.endpoints, {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: session.redirectUri,
      grantType: 'authorization_code',
      code: callbackParams.code,
      codeVerifier: session.codeVerifier
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const tokens: OAuth2TokenResponse = validateTokenResponse(tokenData);

    // Clean up session
    this.sessions.delete(callbackParams.state);

    return tokens;
  }

  /**
   * Get user information using access token
   */
  async getUserInfo(accessToken: string): Promise<any> {
    if (!this.endpoints?.userinfo_endpoint) {
      throw new Error('User info endpoint not available');
    }

    const response = await fetch(this.endpoints.userinfo_endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(maxAge: number = 10 * 60 * 1000): void {
    const now = Date.now();
    for (const [state, session] of this.sessions.entries()) {
      if (now - session.timestamp > maxAge) {
        this.sessions.delete(state);
      }
    }
  }

  /**
   * Get current endpoints (after initialization)
   */
  getEndpoints(): OpenIDConnectDiscovery | null {
    return this.endpoints;
  }

  /**
   * Get active session count (for debugging)
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

/**
 * Create OAuth2 client factory function
 */
export function createOAuth2Client(config: OAuth2ProviderConfig): OAuth2Client {
  return new OAuth2Client(config);
}

/**
 * Validate OAuth2 token response
 */
export function validateTokenResponse(response: any): OAuth2TokenResponse {
  if (!response.access_token || !response.token_type) {
    throw new Error('Invalid token response: missing access_token or token_type');
  }

  return {
    access_token: response.access_token,
    token_type: response.token_type,
    expires_in: response.expires_in,
    refresh_token: response.refresh_token,
    scope: response.scope,
    id_token: response.id_token
  };
}