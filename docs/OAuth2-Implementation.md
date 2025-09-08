# OAuth2 Web Authorization Code Flow

This implementation provides a minimal OAuth2 web authorization code flow with automatic discovery of auth endpoints using OpenID Connect discovery.

## Features

- ✅ **OAuth2 Authorization Code Flow**: Complete implementation with PKCE support
- ✅ **OpenID Connect Discovery**: Automatic endpoint discovery for supported providers
- ✅ **PKCE Security**: Proof Key for Code Exchange for enhanced security
- ✅ **Multiple Providers**: Google, GitHub, Microsoft, Discord, and custom providers
- ✅ **Browser Safe**: Works in both browser and Node.js environments
- ✅ **Type Safe**: Full TypeScript support with comprehensive type definitions
- ✅ **Minimal**: Focused implementation with zero external OAuth2 dependencies

## Quick Start

### 1. Using Next.js API Routes (Recommended)

The simplest way to use OAuth2 is through the provided Next.js API routes:

```typescript
// Redirect to authorization endpoint
window.location.href = '/api/oauth2/authorize?' + new URLSearchParams({
  provider: 'google',
  client_id: 'your-client-id.apps.googleusercontent.com',
  redirect_uri: 'https://your-app.com/api/oauth2/callback'
});
```

### 2. Programmatic Usage

```typescript
import { createOAuth2Client, OAuth2Provider } from '@agent-world/core';

const client = createOAuth2Client({
  clientId: 'your-client-id',
  redirectUri: 'https://your-app.com/callback',
  scope: 'openid profile email'
});

// Initialize with provider discovery
await client.initialize(OAuth2Provider.GOOGLE);

// Start authorization flow
const { authUrl, session } = await client.startAuthorizationFlow();

// Redirect user to authUrl...

// Later, handle the callback
const tokens = await client.handleCallback({
  code: 'authorization-code',
  state: session.state
});

// Get user information
const userInfo = await client.getUserInfo(tokens.access_token);
```

## API Endpoints

### Authorization Endpoint
`GET /api/oauth2/authorize`

Initiates OAuth2 authorization flow.

**Parameters:**
- `provider` (required): OAuth2 provider (`google`, `github`, `microsoft`, `discord`, `custom`)
- `client_id` (required): OAuth2 client ID
- `redirect_uri` (required): Callback URL after authorization
- `scope` (optional): OAuth2 scope (defaults to provider-specific scope)
- `discovery_url` (optional): Custom discovery URL for OIDC

**Example:**
```
GET /api/oauth2/authorize?provider=google&client_id=your-client-id&redirect_uri=https://your-app.com/callback
```

### Callback Endpoint
`GET /api/oauth2/callback`

Handles OAuth2 authorization callback and exchanges code for tokens.

**Parameters:**
- `code`: Authorization code from OAuth2 provider
- `state`: State parameter for CSRF protection
- `error`: Error code if authorization failed
- `error_description`: Human-readable error description

**Response:**
```json
{
  "success": true,
  "tokens": {
    "access_token": "...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "scope": "openid profile email"
  },
  "user": {
    "id": "123456789",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### Discovery Endpoint
`GET /api/oauth2/discovery`

Provides OAuth2 provider discovery information.

**Parameters:**
- `provider` (required): OAuth2 provider or `list` for all providers
- `discovery_url` (optional): Custom discovery URL

**Example:**
```
GET /api/oauth2/discovery?provider=google
```

**Response:**
```json
{
  "provider": "google",
  "endpoints": {
    "issuer": "https://accounts.google.com",
    "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
    "token_endpoint": "https://oauth2.googleapis.com/token",
    "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo"
  },
  "supports_pkce": true
}
```

## Supported Providers

### Google
- **Discovery**: OpenID Connect discovery supported
- **Scope**: `openid profile email`
- **PKCE**: Supported

### GitHub
- **Discovery**: Uses fallback endpoints (no OIDC support)
- **Scope**: `user:email`
- **PKCE**: Supported

### Microsoft
- **Discovery**: OpenID Connect discovery supported
- **Scope**: `openid profile email`
- **PKCE**: Supported

### Discord
- **Discovery**: Uses fallback endpoints (no OIDC support)
- **Scope**: `identify email`
- **PKCE**: Supported

### Custom Providers
- **Discovery**: Configurable via `discovery_url` or manual endpoints
- **Scope**: Configurable
- **PKCE**: Supported

## Configuration

### Environment Variables

```bash
# Required for callback endpoint
OAUTH2_CLIENT_ID=your-oauth2-client-id
OAUTH2_CLIENT_SECRET=your-oauth2-client-secret  # Optional for PKCE-only flows
```

### Provider Configuration

```typescript
interface OAuth2ProviderConfig {
  clientId: string;
  clientSecret?: string;          // Optional for public clients with PKCE
  redirectUri: string;
  scope?: string;                 // Defaults to provider-specific scope
  discoveryUrl?: string;          // For OpenID Connect discovery
  authorizationEndpoint?: string; // Manual configuration
  tokenEndpoint?: string;         // Manual configuration
  userinfoEndpoint?: string;      // Manual configuration
}
```

## Security Features

### PKCE (Proof Key for Code Exchange)
- Automatically generates secure code verifier and challenge
- Uses SHA256 code challenge method
- Protects against authorization code interception attacks

### State Parameter
- Cryptographically secure state generation
- CSRF protection for authorization flow
- Automatic state validation

### Secure Session Management
- HTTP-only cookies for session storage
- Configurable expiration (default: 10 minutes)
- Automatic cleanup of expired sessions

## Error Handling

The implementation provides comprehensive error handling:

```typescript
// Configuration errors
throw new Error('OAuth2 provider configuration requires clientId');

// Discovery errors
throw new Error('Failed to fetch discovery document: 404 Not Found');

// Flow errors
throw new Error('OAuth2 state parameter mismatch');

// Token exchange errors
throw new Error('Token exchange failed: 400 Bad Request');
```

## Integration Examples

### React Component

```typescript
import React from 'react';

export function OAuth2Login() {
  const handleLogin = (provider: string) => {
    const params = new URLSearchParams({
      provider,
      client_id: process.env.NEXT_PUBLIC_OAUTH2_CLIENT_ID!,
      redirect_uri: window.location.origin + '/api/oauth2/callback'
    });
    
    window.location.href = `/api/oauth2/authorize?${params.toString()}`;
  };
  
  return (
    <div>
      <button onClick={() => handleLogin('google')}>
        Login with Google
      </button>
      <button onClick={() => handleLogin('github')}>
        Login with GitHub
      </button>
    </div>
  );
}
```

### Express.js Middleware

```typescript
import { createOAuth2Client } from '@agent-world/core';

export async function oauth2Middleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  
  try {
    // Validate token with OAuth2 provider
    const client = createOAuth2Client(config);
    await client.initialize(provider);
    const userInfo = await client.getUserInfo(token);
    
    req.user = userInfo;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid authorization token' });
  }
}
```

## Testing

Run the OAuth2 tests:

```bash
npm test -- tests/oauth2.test.ts
```

The test suite covers:
- PKCE generation and validation
- State parameter generation
- Provider configuration validation
- OAuth2 client creation
- Discovery endpoint fallbacks

## Browser Compatibility

- **Modern Browsers**: Full support with Web Crypto API
- **Node.js**: Full support with Node.js crypto module
- **Legacy Browsers**: Fallback implementation (not cryptographically secure)

## Contributing

When adding new OAuth2 providers:

1. Add provider to `OAuth2Provider` enum
2. Add discovery URL to `WELL_KNOWN_DISCOVERY_URLS` (if supported)
3. Add fallback endpoints to `FALLBACK_OAUTH2_ENDPOINTS` (if needed)
4. Add default scope to `getDefaultScope` function
5. Add tests for the new provider