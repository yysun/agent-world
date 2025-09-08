/**
 * OAuth2 and OpenID Connect Types Module
 *
 * Features:
 * - Type definitions for OAuth2 authorization code flow
 * - OpenID Connect discovery response types
 * - PKCE (Proof Key for Code Exchange) types
 * - Token response and error types
 * - Provider configuration interfaces
 *
 * Implementation Details:
 * - Browser-safe type definitions with no Node.js dependencies
 * - Comprehensive OAuth2 and OIDC specification compliance
 * - Support for multiple OAuth2 providers
 * - Type-safe configuration and response handling
 *
 * Recent Changes:
 * - Initial implementation with core OAuth2 and OIDC types
 * - Added PKCE support for enhanced security
 * - Created provider configuration interfaces
 */

/**
 * OpenID Connect Discovery Document
 * As defined in https://openid.net/specs/openid-connect-discovery-1_0.html
 */
export interface OpenIDConnectDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  response_modes_supported?: string[];
  grant_types_supported?: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

/**
 * OAuth2 Provider Configuration
 */
export interface OAuth2ProviderConfig {
  clientId: string;
  clientSecret?: string; // Optional for public clients using PKCE
  redirectUri: string;
  scope?: string;
  discoveryUrl?: string; // For OpenID Connect discovery
  authorizationEndpoint?: string; // Manual configuration
  tokenEndpoint?: string; // Manual configuration
  userinfoEndpoint?: string; // Manual configuration
}

/**
 * PKCE Code Challenge and Verifier
 */
export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256' | 'plain';
}

/**
 * OAuth2 Authorization Request Parameters
 */
export interface OAuth2AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  responseType: 'code';
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
}

/**
 * OAuth2 Token Request Parameters
 */
export interface OAuth2TokenRequest {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  code: string;
  grantType: 'authorization_code';
  codeVerifier?: string; // For PKCE
}

/**
 * OAuth2 Token Response
 */
export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string; // For OpenID Connect
}

/**
 * OAuth2 Error Response
 */
export interface OAuth2ErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
  state?: string;
}

/**
 * OAuth2 Authorization Callback Parameters
 */
export interface OAuth2CallbackParams {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

/**
 * OAuth2 Session Data
 */
export interface OAuth2Session {
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  provider: string;
  timestamp: number;
}

/**
 * Supported OAuth2 Providers
 */
export enum OAuth2Provider {
  GOOGLE = 'google',
  GITHUB = 'github',
  MICROSOFT = 'microsoft',
  DISCORD = 'discord',
  CUSTOM = 'custom'
}

/**
 * Well-known OpenID Connect Discovery URLs
 */
export const WELL_KNOWN_DISCOVERY_URLS: Record<OAuth2Provider, string> = {
  [OAuth2Provider.GOOGLE]: 'https://accounts.google.com/.well-known/openid_configuration',
  [OAuth2Provider.GITHUB]: '', // GitHub doesn't support OIDC discovery
  [OAuth2Provider.MICROSOFT]: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid_configuration',
  [OAuth2Provider.DISCORD]: '', // Discord doesn't support OIDC discovery
  [OAuth2Provider.CUSTOM]: '' // Custom provider requires manual configuration
};

/**
 * Fallback OAuth2 endpoints for providers without OIDC discovery
 */
export const FALLBACK_OAUTH2_ENDPOINTS: Record<string, Partial<OpenIDConnectDiscovery>> = {
  [OAuth2Provider.GITHUB]: {
    authorization_endpoint: 'https://github.com/login/oauth/authorize',
    token_endpoint: 'https://github.com/login/oauth/access_token',
    userinfo_endpoint: 'https://api.github.com/user',
    issuer: 'https://github.com',
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['none']
  },
  [OAuth2Provider.DISCORD]: {
    authorization_endpoint: 'https://discord.com/api/oauth2/authorize',
    token_endpoint: 'https://discord.com/api/oauth2/token',
    userinfo_endpoint: 'https://discord.com/api/users/@me',
    issuer: 'https://discord.com',
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['none']
  }
};