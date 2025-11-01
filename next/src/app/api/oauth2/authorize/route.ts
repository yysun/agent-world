import { NextRequest, NextResponse } from 'next/server';
import { 
  createOAuth2Client, 
  OAuth2Provider, 
  type OAuth2ProviderConfig 
} from '@agent-world/core';

/**
 * OAuth2 Authorization Endpoint
 * 
 * Initiates the OAuth2 authorization code flow by redirecting the user
 * to the provider's authorization endpoint with PKCE parameters.
 * 
 * Query Parameters:
 * - provider: OAuth2 provider (google, github, microsoft, discord, custom)
 * - client_id: OAuth2 client ID
 * - redirect_uri: Callback URL after authorization
 * - scope: Optional OAuth2 scope (defaults to provider-specific scope)
 * - discovery_url: Optional custom discovery URL for OIDC
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract required parameters
    const provider = searchParams.get('provider') as OAuth2Provider;
    const clientId = searchParams.get('client_id');
    const redirectUri = searchParams.get('redirect_uri');
    
    // Extract optional parameters
    const scope = searchParams.get('scope');
    const discoveryUrl = searchParams.get('discovery_url');
    
    // Validate required parameters
    if (!provider) {
      return NextResponse.json(
        { error: 'Missing required parameter: provider' },
        { status: 400 }
      );
    }
    
    if (!clientId) {
      return NextResponse.json(
        { error: 'Missing required parameter: client_id' },
        { status: 400 }
      );
    }
    
    if (!redirectUri) {
      return NextResponse.json(
        { error: 'Missing required parameter: redirect_uri' },
        { status: 400 }
      );
    }
    
    // Validate redirect URI
    try {
      new URL(redirectUri);
    } catch {
      return NextResponse.json(
        { error: 'Invalid redirect_uri format' },
        { status: 400 }
      );
    }
    
    // Create OAuth2 client configuration
    const config: OAuth2ProviderConfig = {
      clientId,
      redirectUri,
      scope,
      discoveryUrl
    };
    
    // Initialize OAuth2 client
    const oauth2Client = createOAuth2Client(config);
    await oauth2Client.initialize(provider);
    
    // Start authorization flow
    const { authUrl, session } = await oauth2Client.startAuthorizationFlow();
    
    // Store session in secure HTTP-only cookie
    const response = NextResponse.redirect(authUrl);
    response.cookies.set('oauth2_session', JSON.stringify(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60, // 10 minutes
      path: '/'
    });
    
    return response;
    
  } catch (error) {
    console.error('OAuth2 authorization error:', error);
    return NextResponse.json(
      { 
        error: 'Authorization failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}