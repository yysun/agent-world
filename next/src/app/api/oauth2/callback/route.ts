import { NextRequest, NextResponse } from 'next/server';
import { 
  createOAuth2Client, 
  OAuth2Provider, 
  type OAuth2ProviderConfig,
  type OAuth2CallbackParams,
  type OAuth2Session
} from '@agent-world/core';

/**
 * OAuth2 Callback Endpoint
 * 
 * Handles the OAuth2 authorization callback, exchanges the authorization code
 * for access tokens, and returns user information.
 * 
 * Query Parameters:
 * - code: Authorization code from OAuth2 provider
 * - state: State parameter for CSRF protection
 * - error: Error code if authorization failed
 * - error_description: Human-readable error description
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Extract callback parameters
    const callbackParams: OAuth2CallbackParams = {
      code: searchParams.get('code') || undefined,
      state: searchParams.get('state') || undefined,
      error: searchParams.get('error') || undefined,
      error_description: searchParams.get('error_description') || undefined
    };
    
    // Get session from cookie
    const sessionCookie = request.cookies.get('oauth2_session');
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Missing OAuth2 session. Please restart the authorization flow.' },
        { status: 400 }
      );
    }
    
    let session: OAuth2Session;
    try {
      session = JSON.parse(sessionCookie.value);
    } catch {
      return NextResponse.json(
        { error: 'Invalid OAuth2 session. Please restart the authorization flow.' },
        { status: 400 }
      );
    }
    
    // Validate session age (10 minutes max)
    const sessionAge = Date.now() - session.timestamp;
    if (sessionAge > 10 * 60 * 1000) {
      return NextResponse.json(
        { error: 'OAuth2 session expired. Please restart the authorization flow.' },
        { status: 400 }
      );
    }
    
    // Create OAuth2 client configuration from session
    const config: OAuth2ProviderConfig = {
      clientId: '', // We'll need to store this in session or get from env
      redirectUri: session.redirectUri,
      discoveryUrl: undefined // We'll need to determine this from session
    };
    
    // Get client configuration from environment or session
    // For this minimal implementation, we'll use environment variables
    const provider = OAuth2Provider.GOOGLE; // Default for demo
    const clientId = process.env.OAUTH2_CLIENT_ID;
    const clientSecret = process.env.OAUTH2_CLIENT_SECRET;
    
    if (!clientId) {
      return NextResponse.json(
        { error: 'OAuth2 client not configured. Set OAUTH2_CLIENT_ID environment variable.' },
        { status: 500 }
      );
    }
    
    config.clientId = clientId;
    config.clientSecret = clientSecret;
    
    // Initialize OAuth2 client
    const oauth2Client = createOAuth2Client(config);
    await oauth2Client.initialize(provider);
    
    try {
      // Handle the callback and exchange code for tokens
      const tokens = await oauth2Client.handleCallback(callbackParams);
      
      // Get user information
      let userInfo = null;
      try {
        userInfo = await oauth2Client.getUserInfo(tokens.access_token);
      } catch (userInfoError) {
        console.warn('Failed to fetch user info:', userInfoError);
        // Continue without user info if the endpoint fails
      }
      
      // Clear session cookie
      const response = NextResponse.json({
        success: true,
        tokens: {
          access_token: tokens.access_token,
          token_type: tokens.token_type,
          expires_in: tokens.expires_in,
          scope: tokens.scope
        },
        user: userInfo
      });
      
      response.cookies.set('oauth2_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0, // Delete cookie
        path: '/'
      });
      
      return response;
      
    } catch (callbackError) {
      console.error('OAuth2 callback error:', callbackError);
      
      // Clear session cookie on error
      const response = NextResponse.json(
        { 
          error: 'Token exchange failed', 
          details: callbackError instanceof Error ? callbackError.message : 'Unknown error' 
        },
        { status: 400 }
      );
      
      response.cookies.set('oauth2_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0, // Delete cookie
        path: '/'
      });
      
      return response;
    }
    
  } catch (error) {
    console.error('OAuth2 callback processing error:', error);
    return NextResponse.json(
      { 
        error: 'Callback processing failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}