# Implementation Plan: Browser-Safe LLM Manager

## Overview
Create a browser-safe LLM manager by separating configuration concerns and removing all `process.env` dependencies from the core module.

## Implementation Steps

### Phase 1: Core Configuration Module
- [x] **Step 1.1**: Create `core/llm-config.ts` browser-safe configuration module
  - [x] Define TypeScript interfaces for all provider configurations
  - [x] Create global configuration store with provider-specific sections
  - [x] Implement configuration injection functions with type safety
  - [x] Add validation functions for required provider settings
  - [x] Create clear error messages for missing configuration

- [x] **Step 1.2**: Define configuration interfaces for all providers
  - [x] OpenAI configuration interface (apiKey)
  - [x] Anthropic configuration interface (apiKey)
  - [x] Google configuration interface (apiKey)
  - [x] Azure configuration interface (apiKey, endpoint, deployment)
  - [x] XAI configuration interface (apiKey)
  - [x] OpenAI-Compatible configuration interface (apiKey, baseUrl)
  - [x] Ollama configuration interface (baseUrl)

### Phase 2: Update LLM Manager
- [x] **Step 2.1**: Modify `core/llm-manager.ts` to use configuration module
  - [x] Import and use llm-config module instead of process.env
  - [x] Update `loadLLMProvider` function to get settings from configuration
  - [x] Remove all `process.env` access throughout the file
  - [x] Add configuration validation before LLM calls
  - [x] Update error handling for missing configuration

- [x] **Step 2.2**: Test LLM manager with configuration injection
  - [x] Verify all providers work with injected configuration
  - [x] Test error handling for missing configuration
  - [x] Ensure no Node.js dependencies remain

### Phase 3: Update Agent Configuration
- [x] **Step 3.1**: Modify agent types in `core/types.ts`
  - [x] Remove `apiKey` field from Agent interface
  - [x] Remove `azureEndpoint` field from Agent interface
  - [x] Remove `azureDeployment` field from Agent interface
  - [x] Remove `baseUrl` field from Agent interface
  - [x] Remove `ollamaBaseUrl` field from Agent interface
  - [x] Keep only: provider, model, temperature, maxTokens

- [x] **Step 3.2**: Update existing agent configurations
  - [x] Update agent JSON files to remove sensitive fields
  - [x] Verify agent loading still works with simplified configuration
  - [x] Test agent creation and modification

### Phase 4: Update CLI Module
- [x] **Step 4.1**: Modify `cli/index.ts` to read environment variables
  - [x] Add function to read all required environment variables
  - [x] Create provider configuration objects from env vars
  - [x] Call llm-config injection function at startup
  - [x] Add error handling for missing environment variables

- [x] **Step 4.2**: Environment variable mapping
  - [x] Map OPENAI_API_KEY to OpenAI configuration
  - [x] Map ANTHROPIC_API_KEY to Anthropic configuration
  - [x] Map GOOGLE_API_KEY to Google configuration
  - [x] Map AZURE_OPENAI_API_KEY, AZURE_ENDPOINT, AZURE_DEPLOYMENT to Azure configuration
  - [x] Map XAI_API_KEY to XAI configuration
  - [x] Map OPENAI_COMPATIBLE_API_KEY, OPENAI_COMPATIBLE_BASE_URL to OpenAI-Compatible configuration
  - [x] Map OLLAMA_BASE_URL to Ollama configuration

### Phase 5: Update Server Module
- [x] **Step 5.1**: Modify `server/index.ts` to read environment variables
  - [x] Add function to read all required environment variables
  - [x] Create provider configuration objects from env vars
  - [x] Call llm-config injection function at startup
  - [x] Add error handling for missing environment variables

- [x] **Step 5.2**: Ensure consistent configuration with CLI
  - [x] Use same environment variable names as CLI
  - [x] Use same configuration injection pattern
  - [x] Test server startup with configuration injection

### Phase 6: Testing and Validation
- [x] **Step 6.1**: Unit tests for configuration module
  - [x] Test configuration injection functions
  - [x] Test validation functions
  - [x] Test error handling for missing configuration
  - [x] Test browser compatibility (no Node.js dependencies)

- [x] **Step 6.2**: Integration tests
  - [x] Test CLI with environment variable configuration
  - [x] Test server with environment variable configuration
  - [x] Test LLM calls with all providers using injected configuration
  - [x] Test error scenarios (missing API keys, invalid configuration)

- [x] **Step 6.3**: Browser compatibility validation
  - [x] Verify core module can be imported in browser environment
  - [x] Test configuration injection in browser context
  - [x] Ensure no process.env access anywhere in core
  - [x] Test bundling for browser deployment

### Phase 7: Documentation and Cleanup
- [x] **Step 7.1**: Update documentation
  - [x] Update README with new configuration requirements
  - [x] Document environment variables needed for CLI and server
  - [x] Update agent configuration documentation
  - [x] Add migration guide for existing configurations

- [x] **Step 7.2**: Code cleanup
  - [x] Remove unused imports and dependencies
  - [x] Update comment blocks in modified files
  - [x] Ensure consistent error messages
  - [x] Verify TypeScript types are correct

## Success Criteria
- [x] Core module works in browser environment without errors
- [x] All LLM providers function with injected configuration
- [x] No `process.env` access anywhere in core module
- [x] Clear error messages for missing configuration
- [x] CLI and server successfully configure core at startup
- [x] Agent configurations only contain provider/model information
- [x] All existing functionality preserved with new architecture

## Risk Mitigation
- **Breaking Changes**: Acceptable per requirements, no backward compatibility needed
- **Environment Variables**: Comprehensive mapping and validation prevents missing configuration
- **Browser Compatibility**: Separate configuration module ensures clean browser deployment
- **Testing**: Comprehensive test suite validates all scenarios and environments

## Dependencies
- TypeScript for type safety
- Existing AI SDK providers
- CLI and server environment variable access
- Agent configuration file format updates
