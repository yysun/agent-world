/**
 * OAuth2 Utilities Module - Browser-Safe OAuth2 and PKCE Implementation
 *
 * Features:
 * - PKCE (Proof Key for Code Exchange) code generation for secure OAuth2 flows
 * - OpenID Connect discovery endpoint fetching
 * - OAuth2 authorization URL building
 * - Token exchange utilities
 * - Browser-safe cryptographic functions using Web Crypto API
 * - State parameter generation and validation
 *
 * Implementation Details:
 * - Uses Web Crypto API for secure random generation and hashing
 * - Base64 URL encoding following RFC 7636 PKCE specification
 * - Automatic fallback to manual endpoint configuration for non-OIDC providers
 * - Type-safe parameter building and validation
 * - No Node.js dependencies for browser compatibility
 *
 * Recent Changes:
 * - Initial implementation with PKCE support
 * - Added OpenID Connect discovery functionality
 * - Created OAuth2 URL building utilities
 * - Implemented secure state generation
 */

import {
  OpenIDConnectDiscovery,
  OAuth2ProviderConfig,
  PKCEPair,
  OAuth2AuthorizationRequest,
  OAuth2TokenRequest,
  OAuth2Provider,
  WELL_KNOWN_DISCOVERY_URLS,
  FALLBACK_OAUTH2_ENDPOINTS
} from './oauth2-types.js';

/**
 * Generate a cryptographically secure random string
 * Works in both browser and Node.js environments
 */
function generateRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  
  // Check if we're in Node.js environment
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Fallback for environments without crypto.getRandomValues
    // This is NOT cryptographically secure and should only be used for testing
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Base64 URL encode a string (RFC 7636 compliant)
 */
function base64URLEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate PKCE code verifier and challenge pair
 * Works in both browser and Node.js environments
 */
export async function generatePKCEPair(): Promise<PKCEPair> {
  // Generate code verifier (43-128 characters, URL-safe)
  const codeVerifier = base64URLEncode(generateRandomString(32));
  
  // Generate code challenge using S256 method
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  
  let hash: ArrayBuffer;
  
  // Check if we're in Node.js environment
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    hash = await globalThis.crypto.subtle.digest('SHA-256', data);
  } else if (typeof crypto !== 'undefined' && crypto.subtle) {
    hash = await crypto.subtle.digest('SHA-256', data);
  } else {
    // Fallback for environments without crypto.subtle (like some test environments)
    // This is NOT cryptographically secure and should only be used for testing
    const crypto = require('crypto');
    const hashBuffer = crypto.createHash('sha256').update(Buffer.from(data)).digest();
    hash = hashBuffer.buffer.slice(hashBuffer.byteOffset, hashBuffer.byteOffset + hashBuffer.byteLength);
  }
  
  const codeChallenge = base64URLEncode(String.fromCharCode(...new Uint8Array(hash)));
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

/**
 * Generate secure state parameter
 */
export function generateState(): string {
  return generateRandomString(16);
}

/**
 * Discover OAuth2 endpoints using OpenID Connect discovery
 */
export async function discoverOAuth2Endpoints(
  provider: OAuth2Provider | string,
  customDiscoveryUrl?: string
): Promise<OpenIDConnectDiscovery> {
  // Use custom discovery URL if provided
  if (customDiscoveryUrl) {
    const response = await fetch(customDiscoveryUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch discovery document: ${response.status} ${response.statusText}`);
    }
    return await response.json() as OpenIDConnectDiscovery;
  }

  // Use well-known discovery URL for supported providers
  const discoveryUrl = WELL_KNOWN_DISCOVERY_URLS[provider as OAuth2Provider];
  if (discoveryUrl) {
    const response = await fetch(discoveryUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch discovery document: ${response.status} ${response.statusText}`);
    }
    return await response.json() as OpenIDConnectDiscovery;
  }

  // Use fallback endpoints for providers without OIDC discovery
  const fallbackEndpoints = FALLBACK_OAUTH2_ENDPOINTS[provider];
  if (fallbackEndpoints) {
    return fallbackEndpoints as OpenIDConnectDiscovery;
  }

  throw new Error(`No discovery URL or fallback endpoints found for provider: ${provider}`);
}

/**
 * Build OAuth2 authorization URL
 */
export function buildAuthorizationURL(
  endpoints: OpenIDConnectDiscovery,
  params: OAuth2AuthorizationRequest
): string {
  const url = new URL(endpoints.authorization_endpoint);
  
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', params.responseType);
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
  
  // Add PKCE parameters if provided
  if (params.codeChallenge) {
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', params.codeChallengeMethod || 'S256');
  }
  
  return url.toString();
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  endpoints: OpenIDConnectDiscovery,
  params: OAuth2TokenRequest
): Promise<Response> {
  const body = new URLSearchParams();
  body.set('client_id', params.clientId);
  body.set('redirect_uri', params.redirectUri);
  body.set('grant_type', params.grantType);
  body.set('code', params.code);
  
  // Add client secret if provided (for confidential clients)
  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret);
  }
  
  // Add PKCE code verifier if provided
  if (params.codeVerifier) {
    body.set('code_verifier', params.codeVerifier);
  }
  
  return fetch(endpoints.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: body.toString()
  });
}

/**
 * Validate OAuth2 state parameter
 */
export function validateState(receivedState: string, expectedState: string): boolean {
  return receivedState === expectedState;
}

/**
 * Parse OAuth2 callback URL parameters
 */
export function parseCallbackParams(url: string): Record<string, string> {
  const urlObj = new URL(url);
  const params: Record<string, string> = {};
  
  for (const [key, value] of urlObj.searchParams.entries()) {
    params[key] = value;
  }
  
  return params;
}

/**
 * Get default scope for OAuth2 provider
 */
export function getDefaultScope(provider: OAuth2Provider): string {
  switch (provider) {
    case OAuth2Provider.GOOGLE:
      return 'openid profile email';
    case OAuth2Provider.GITHUB:
      return 'user:email';
    case OAuth2Provider.MICROSOFT:
      return 'openid profile email';
    case OAuth2Provider.DISCORD:
      return 'identify email';
    default:
      return 'openid profile email';
  }
}

/**
 * Validate OAuth2 provider configuration
 */
export function validateProviderConfig(config: OAuth2ProviderConfig): void {
  if (!config.clientId) {
    throw new Error('OAuth2 provider configuration requires clientId');
  }
  
  if (!config.redirectUri) {
    throw new Error('OAuth2 provider configuration requires redirectUri');
  }
  
  if (!config.discoveryUrl && !config.authorizationEndpoint) {
    throw new Error('OAuth2 provider configuration requires either discoveryUrl or authorizationEndpoint');
  }
  
  if (!config.discoveryUrl && !config.tokenEndpoint) {
    throw new Error('OAuth2 provider configuration requires either discoveryUrl or tokenEndpoint');
  }
}