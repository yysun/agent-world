# LLM Chat Message Schema Consistency Requirement

## Issue
The current `memory.json` files use a custom schema that doesn't match the standard LLM chat message format. This creates unnecessary mapping and potential inconsistencies between stored conversation history and what gets sent to LLM providers.

## Current Implementation
The memory.json files currently store messages in a custom format that may differ from the standard LLM chat message schema used by providers like OpenAI, Anthropic, Google, etc.

## Required Change
**The memory.json should use the LLM chat message schema instead of mapping to a new schema**

## Benefits
- **Consistency**: Direct compatibility with LLM provider APIs
- **Simplicity**: No need for schema transformation/mapping
- **Reliability**: Reduces potential for data loss or format errors during conversion
- **Maintainability**: Easier to debug and maintain when formats match
- **Performance**: Eliminates unnecessary data transformation overhead

## Implementation Requirements
1. Update agent memory storage to use standard LLM chat message format
2. Ensure compatibility with all supported LLM providers (OpenAI, Anthropic, Google, XAI, Ollama)
3. Migrate existing memory.json files to new format if needed
4. Update memory loading/saving functions to handle the standard schema
5. Verify that conversation context passes through to LLMs without transformation

## Standard LLM Chat Message Schema
The standard schema typically includes:
- `role`: "system" | "user" | "assistant" | "function" | etc.
- `content`: string or structured content
- `name`: optional sender identification
- `timestamp`: optional timestamp (if supported by provider)

## Files Affected
- `src/world.ts` - Memory management functions
- `src/agent.ts` - Message processing and context loading
- `data/worlds/*/agents/*/memory.json` - Stored conversation files
- Any functions that read/write agent memory

## Priority
High - This affects data consistency and system reliability across the entire conversation management system.
