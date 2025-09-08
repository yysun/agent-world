import { NextRequest, NextResponse } from 'next/server';
import { 
  discoverOAuth2Endpoints, 
  OAuth2Provider,
  WELL_KNOWN_DISCOVERY_URLS,
  FALLBACK_OAUTH2_ENDPOINTS
} from '@agent-world/core';

/**
 * OAuth2 Discovery Endpoint
 * 
 * Provides OAuth2 provider discovery information and endpoint details.
 * Supports both OpenID Connect discovery and manual endpoint configuration.
 * 
 * Query Parameters:
 * - provider: OAuth2 provider (google, github, microsoft, discord, custom)
 * - discovery_url: Optional custom discovery URL for OIDC
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const provider = searchParams.get('provider') as OAuth2Provider;
    const customDiscoveryUrl = searchParams.get('discovery_url');
    
    // Validate provider parameter
    if (!provider) {
      return NextResponse.json(
        { error: 'Missing required parameter: provider' },
        { status: 400 }
      );
    }
    
    // If no provider specified, return list of supported providers
    if (provider === 'list') {
      return NextResponse.json({
        providers: Object.values(OAuth2Provider),
        discovery_urls: WELL_KNOWN_DISCOVERY_URLS,
        fallback_endpoints: FALLBACK_OAUTH2_ENDPOINTS
      });
    }
    
    try {
      // Discover OAuth2 endpoints
      const endpoints = await discoverOAuth2Endpoints(provider, customDiscoveryUrl);
      
      return NextResponse.json({
        provider,
        endpoints,
        discovery_url: customDiscoveryUrl || WELL_KNOWN_DISCOVERY_URLS[provider] || null,
        supports_pkce: endpoints.code_challenge_methods_supported?.includes('S256') ?? true
      });
      
    } catch (discoveryError) {
      console.error('OAuth2 discovery error:', discoveryError);
      return NextResponse.json(
        { 
          error: 'Discovery failed', 
          provider,
          details: discoveryError instanceof Error ? discoveryError.message : 'Unknown error'
        },
        { status: 400 }
      );
    }
    
  } catch (error) {
    console.error('OAuth2 discovery processing error:', error);
    return NextResponse.json(
      { 
        error: 'Discovery processing failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}