# Environment Variables for Agent World

## Overview
Agent World now uses external configuration injection for LLM providers, making the core module browser-safe. CLI and server components read environment variables and configure the core at startup.

## Required Environment Variables by Provider

### OpenAI
```bash
OPENAI_API_KEY=sk-your-openai-api-key
```

### Anthropic
```bash
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### Google (Gemini)
```bash
GOOGLE_API_KEY=your-google-api-key
```

### Azure OpenAI
```bash
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_ENDPOINT=https://your-resource.openai.azure.com
AZURE_DEPLOYMENT=your-deployment-name
AZURE_API_VERSION=2023-12-01-preview  # Optional, defaults to this version
```

### XAI (Grok)
```bash
XAI_API_KEY=your-xai-api-key
```

### OpenAI-Compatible Providers
```bash
OPENAI_COMPATIBLE_API_KEY=your-api-key
OPENAI_COMPATIBLE_BASE_URL=https://your-provider-url.com/v1
```

### Ollama
```bash
OLLAMA_BASE_URL=http://localhost:11434/api  # Optional, defaults to this URL
```

## Usage Examples

### CLI with Environment Variables
```bash
# Set environment variables
export OPENAI_API_KEY=sk-your-openai-api-key
export ANTHROPIC_API_KEY=your-anthropic-api-key

# Run CLI
npx tsx cli/index.ts --world myworld "Hello, world!"
```

### Server with Environment Variables
```bash
# Set environment variables
export OPENAI_API_KEY=sk-your-openai-api-key
export OLLAMA_BASE_URL=http://localhost:11434/api

# Start server
npx tsx server/index.ts
```

### Using .env File
Create a `.env` file in the project root:
```bash
OPENAI_API_KEY=sk-your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_ENDPOINT=https://your-resource.openai.azure.com
AZURE_DEPLOYMENT=your-deployment-name
GOOGLE_API_KEY=your-google-api-key
XAI_API_KEY=your-xai-api-key
OPENAI_COMPATIBLE_API_KEY=your-compatible-api-key
OPENAI_COMPATIBLE_BASE_URL=https://your-provider-url.com/v1
OLLAMA_BASE_URL=http://localhost:11434/api
```

Then load it before running:
```bash
# Install dotenv if needed
npm install dotenv

# Load .env file
node -r dotenv/config cli/index.js --world myworld "Hello!"
```

## Browser Usage
In browser environments, use the configuration injection API directly:

```javascript
import { configureLLMProvider, LLMProvider } from './core/llm-config.js';

// Configure providers before making LLM calls
configureLLMProvider(LLMProvider.OPENAI, {
  apiKey: 'your-api-key'
});

configureLLMProvider(LLMProvider.AZURE, {
  apiKey: 'your-azure-api-key',
  endpoint: 'https://your-resource.openai.azure.com',
  deployment: 'your-deployment-name'
});
```

## Migration from Previous Versions

### Agent Configuration Changes
Agent configurations no longer include API keys or provider-specific settings:

**Before (NOT browser-safe):**
```json
{
  "id": "agent1",
  "provider": "openai",
  "model": "gpt-4",
  "apiKey": "sk-your-api-key",
  "azureEndpoint": "https://your-resource.openai.azure.com",
  "azureDeployment": "gpt-4"
}
```

**After (browser-safe):**
```json
{
  "id": "agent1", 
  "provider": "openai",
  "model": "gpt-4"
}
```

All API keys and provider-specific settings now come from environment variables or configuration injection.

## Security Considerations

1. **Environment Variables**: Never commit API keys to version control
2. **Browser Usage**: API keys should be provided through secure configuration, not hardcoded
3. **Server Deployment**: Use secure environment variable management
4. **Development**: Use `.env` files that are excluded from version control

## Troubleshooting

### Missing Configuration Error
```
Error: No configuration found for openai provider. Please ensure the provider is configured before making LLM calls.
```

**Solution**: Set the required environment variables for the provider you're using.

### Provider Configuration Debug
Set log level to debug to see configuration status:
```bash
LOG_LEVEL=debug npx tsx cli/index.ts --world myworld "test"
```

This will show which providers are configured from environment variables.
