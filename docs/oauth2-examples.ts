/**
 * OAuth2 Usage Examples
 * 
 * This file demonstrates how to use the OAuth2 authorization code flow
 * with OpenID Connect discovery in different scenarios.
 */

// Example 1: Google OAuth2 with OIDC Discovery
const googleConfig = {
  clientId: 'your-google-client-id.apps.googleusercontent.com',
  redirectUri: 'https://your-app.com/api/oauth2/callback',
  scope: 'openid profile email'
};

// Example 2: GitHub OAuth2 with Fallback Endpoints
const githubConfig = {
  clientId: 'your-github-client-id',
  redirectUri: 'https://your-app.com/api/oauth2/callback',
  scope: 'user:email'
};

// Example 3: Custom OAuth2 Provider with Manual Configuration
const customConfig = {
  clientId: 'your-custom-client-id',
  clientSecret: 'your-client-secret', // Optional for public clients with PKCE
  redirectUri: 'https://your-app.com/api/oauth2/callback',
  scope: 'openid profile email',
  authorizationEndpoint: 'https://auth.example.com/oauth2/authorize',
  tokenEndpoint: 'https://auth.example.com/oauth2/token',
  userinfoEndpoint: 'https://auth.example.com/oauth2/userinfo'
};

// Example 4: Custom Provider with OpenID Connect Discovery
const customOIDCConfig = {
  clientId: 'your-oidc-client-id',
  redirectUri: 'https://your-app.com/api/oauth2/callback',
  discoveryUrl: 'https://auth.example.com/.well-known/openid_configuration'
};

/**
 * Example: Using the OAuth2 client programmatically
 */
async function exampleOAuth2Flow() {
  const { createOAuth2Client, OAuth2Provider } = await import('@agent-world/core');
  
  // Create client
  const client = createOAuth2Client(googleConfig);
  
  // Initialize with provider discovery
  await client.initialize(OAuth2Provider.GOOGLE);
  
  // Start authorization flow
  const { authUrl, session } = await client.startAuthorizationFlow();
  
  console.log('Redirect user to:', authUrl);
  console.log('Session state:', session.state);
  
  // Later, when handling the callback...
  const callbackParams = {
    code: 'authorization-code-from-callback',
    state: session.state
  };
  
  try {
    const tokens = await client.handleCallback(callbackParams);
    console.log('Access token:', tokens.access_token);
    
    // Get user info
    const userInfo = await client.getUserInfo(tokens.access_token);
    console.log('User info:', userInfo);
    
  } catch (error) {
    console.error('OAuth2 error:', error);
  }
}

/**
 * Example: Using the Next.js API routes
 */

// Step 1: Redirect to authorization endpoint
// GET /api/oauth2/authorize?provider=google&client_id=your-client-id&redirect_uri=https://your-app.com/api/oauth2/callback

// Step 2: Handle the callback (automatically done by the API route)
// GET /api/oauth2/callback?code=auth-code&state=state-value

// Step 3: Discovery endpoint for getting provider info
// GET /api/oauth2/discovery?provider=google

/**
 * Example: Frontend JavaScript usage
 */
function initializeOAuth2Login() {
  const loginButton = document.getElementById('oauth2-login');
  
  loginButton?.addEventListener('click', () => {
    const params = new URLSearchParams({
      provider: 'google',
      client_id: 'your-google-client-id.apps.googleusercontent.com',
      redirect_uri: window.location.origin + '/api/oauth2/callback'
    });
    
    // Redirect to authorization endpoint
    window.location.href = `/api/oauth2/authorize?${params.toString()}`;
  });
}

/**
 * Example: Environment variables for OAuth2 configuration
 */
/*
.env file:
OAUTH2_CLIENT_ID=your-oauth2-client-id
OAUTH2_CLIENT_SECRET=your-oauth2-client-secret
OAUTH2_REDIRECT_URI=https://your-app.com/api/oauth2/callback
*/

/**
 * Example: Supported OAuth2 providers
 */
const supportedProviders = {
  google: {
    discoveryUrl: 'https://accounts.google.com/.well-known/openid_configuration',
    defaultScope: 'openid profile email'
  },
  github: {
    // Uses fallback endpoints (GitHub doesn't support OIDC discovery)
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    defaultScope: 'user:email'
  },
  microsoft: {
    discoveryUrl: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid_configuration',
    defaultScope: 'openid profile email'
  },
  discord: {
    // Uses fallback endpoints
    authorizationEndpoint: 'https://discord.com/api/oauth2/authorize',
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    defaultScope: 'identify email'
  }
};

export {
  googleConfig,
  githubConfig,
  customConfig,
  customOIDCConfig,
  exampleOAuth2Flow,
  initializeOAuth2Login,
  supportedProviders
};