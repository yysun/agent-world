# Requirements: Browser-Safe LLM Manager

## Problem Statement
The current LLM manager (`core/llm-manager.ts`) is not browser-safe because it directly accesses `process.env` environment variables, which is a Node.js-specific API that doesn't exist in browser environments.

## What Needs to Be Fixed
1. **Environment Variable Access**: The `loadLLMProvider` function uses `process.env` to read API keys and configuration
2. **Browser Compatibility**: Need to ensure the module can run in both Node.js and browser environments
3. **Configuration Management**: Provide alternative ways to supply API keys and configuration in browser contexts

## Current Issues
- Line 364 and other locations access `process.env.OPENAI_API_KEY`, `process.env.ANTHROPIC_API_KEY`, etc.
- Direct Node.js dependency prevents browser usage
- No fallback mechanism for browser environments

## Requirements (What, Not How)

### Functional Requirements
1. **Configuration Module**: Create separate browser-safe configuration module for LLM provider settings
2. **Startup Configuration**: Configuration injection happens once at application startup
3. **Agent Configuration Simplification**: Agent configuration should only specify provider type and model
4. **External Configuration**: CLI and server components read environment variables and inject all provider settings into core
5. **Provider Settings Injection**: All provider-specific settings (API keys, Azure endpoints, base URLs) injected externally
6. **Clear Error Messages**: Missing configuration should produce clear error messages indicating setup issues

### Non-Functional Requirements
1. **Breaking Changes Accepted**: No backward compatibility requirements for this change
2. **Security**: Core module should never directly access process.env
3. **Type Safety**: Maintain TypeScript type safety for configuration injection
4. **Browser Safety**: Core module must work in browser environments without Node.js dependencies

### Validation Criteria
1. Module can be imported and used in browser environments without errors
2. All LLM providers work when API keys are injected via configuration mechanism
3. No `process.env` access anywhere in core module
4. Appropriate error messages when required API keys are missing
5. CLI and server successfully read environment variables and inject into core

## Architecture Changes Required
1. **New Configuration Module**: Create separate `core/llm-config.ts` module for provider configuration management
2. **Core Module Updates**: Remove all `process.env` access, use configuration module for provider settings
3. **CLI Module**: Read environment variables and configure core at startup
4. **Server Module**: Read environment variables and configure core at startup
5. **Agent Configuration**: Only store provider type and model, remove all sensitive and provider-specific fields

## Configuration Injection Scope
**All provider settings to be injected externally:**
- API keys (OpenAI, Anthropic, Google, XAI, etc.)
- Azure-specific settings (endpoint, API version, deployment)
- Base URLs (OpenAI-compatible, Ollama)
- Any other provider-specific configuration

## Out of Scope
- Backward compatibility with existing API key storage in agent config
- Browser-specific storage mechanisms for API keys
- Authentication flows for browser environments

## Dependencies
- New configuration module must be browser-safe (no Node.js dependencies)
- Agent configuration structure must be updated to remove all provider-specific fields
- CLI and server modules must implement environment variable reading and startup configuration
- LLM manager must be updated to use configuration module instead of direct env access
- Browser build system must handle the new configuration module
