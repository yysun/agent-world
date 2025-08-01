# Requirements: Public API Curation for Core Module

## Overview
The current `core/index.ts` exports everything from core, but it should only export what should be used by clients. Internal implementation details should remain private to keep the API clean and prevent breaking changes.

## Analysis of Current Usage

### Client Categories
1. **CLI** (`cli/commands.ts`) - Command-line interface
2. **Server API** (`server/api.ts`) - REST API server  
3. **Web Frontend** (`next/src/`) - Next.js frontend
4. **Tests** (`tests/`) - Test suites (internal, can access private APIs)
5. **Documentation Examples** - Code samples in docs

### Current Exports Analysis

#### Management Functions (26 total)
**World Operations (7):**
- ✅ `createWorld` - Used by CLI, Server API
- ✅ `getWorld` - Used by Server API  
- ✅ `updateWorld` - Used by CLI
- ✅ `deleteWorld` - Used by CLI
- ✅ `listWorlds` - Used by CLI, Server API
- ✅ `getWorldConfig` - Used by CLI, Server API
- ✅ `exportWorldToMarkdown` - Used by CLI, Server API

**Agent Operations (12):**
- ✅ `createAgent` - Used via World instance methods (CLI creates via world.createAgent)
- ✅ `getAgent` - Used by CLI
- ✅ `updateAgent` - Used by CLI  
- ✅ `deleteAgent` - Used by CLI
- ✅ `listAgents` - Used by CLI, Server API
- ✅ `clearAgentMemory` - Used by CLI `/clear` command and Server API for agent updates
- ❓ `updateAgentMemory` - Used by Server API for memory append endpoint
- ❓ `loadAgentsIntoWorld` - Used internally
- ❓ `syncWorldAgents` - Used internally
- ❓ `createAgentsBatch` - Used internally
- ❓ `registerAgentRuntime` - Used internally
- ❓ `getAgentConfig` - Used internally

**Chat Operations (7):**
- ❓ `createChat` - Legacy, CLI uses createChatData
- ✅ `createChatData` - Used by CLI
- ❓ `getChat` - Legacy, CLI uses getChatData  
- ✅ `getChatData` - Used by CLI
- ❓ `createWorldChat` - Used internally
- ✅ `restoreWorldChat` - Used by CLI, Server API
- ❓ `summarizeChat` - Used by CLI `/summarize-chat` command and Server API endpoint

#### Event System (8 total)
- ✅ `publishMessage` - Used by CLI, Server API
- ❓ `subscribeToMessages` - Used via subscription system (not directly imported)
- ❓ `subscribeToSSE` - Not used directly (subscription system handles this internally)
- ❓ `publishSSE` - Not used directly (subscription system handles this internally)
- ❓ `subscribeAgentToMessages` - Used internally
- ❓ `processAgentMessage` - Used internally
- ❓ `shouldAgentRespond` - Used internally
- ❓ `enableChatDataAutosave` - Used internally
- ❓ `disableChatDataAutosave` - Used internally
- ✅ `enableStreaming` - Used by Server API
- ✅ `disableStreaming` - Used by Server API

#### Core Types (24 total)
**Base Types (3):**
- ✅ `World` - Used by CLI, Server API
- ✅ `Agent` - Used by CLI, Server API  
- ✅ `AgentMessage` - Used by CLI

**Parameter Types (6):**
- ❓ `CreateAgentParams` - Used internally
- ❓ `UpdateAgentParams` - Used internally
- ❓ `CreateWorldParams` - Used internally  
- ❓ `UpdateWorldParams` - Used internally
- ❓ `CreateChatParams` - Used internally
- ❓ `UpdateChatParams` - Used internally

**Chat Types (4):**
- ✅ `WorldChat` - Used by tests, may be needed for advanced use cases
- ✅ `ChatData` - Used by CLI
- ❓ `ChatInfo` - Used internally - merged with `ChatData`
- ❓ `AgentInfo` - Used internally
- ❓ `AgentData` - Used internally
- ❓ `AgentStorage` - Used internally

**Storage Types (2):**
- ❓ `StorageManager` - Used internally
- ❓ `StorageAPI` - Used internally

**Event Types (3):**
- ❓ `EventPayloadMap` - Used internally
- ❓ `TypedEvent` - Used internally
- ❓ `WorldEventPayload` - Used internally

**Other Types (6):**
- ✅ `WorldInfo` - Used by CLI
- ❓ `WorldData` - Used internally
- ✅ `LoggerConfig` - Used by CLI, Server
- ✅ `LogLevel` - Used by CLI, Server
- ✅ `LLMProvider` - Used by CLI, Server API

#### Utilities (6 total)
- ✅ `logger` - Used by CLI, Server
- ✅ `createCategoryLogger` - Used by CLI, Server API
- ❓ `getCategoryLogLevel` - Used internally
- ❓ `initializeLogger` - Used by Server (but could be internal)
- ✅ `generateId` - Used by clients for ID generation
- ✅ `toKebabCase` - Used by clients for naming

#### Storage & Advanced (4 total)
- ❓ `createStorageWrappers` - Used internally
- ❓ `createStorageWithWrappers` - Used internally  
- ❓ `createStorageFromEnv` - Used internally
- ✅ `subscription` exports - Used by Server API

## Requirements

### Must Be Public API (Core Client Functions)
**World Management:**
- `createWorld`, `getWorld`, `updateWorld`, `deleteWorld`, `listWorlds`
- `getWorldConfig`, `exportWorldToMarkdown`

**Agent Management:**
- `listAgents`, `getAgent`, `updateAgent`, `deleteAgent`
- `updateAgentMemory`, `clearAgentMemory` (needed for memory management APIs)
- Note: `createAgent` happens via world instances, not directly

**Chat Management:**
- `createChatData`, `getChatData`, `restoreWorldChat`, `summarizeChat`

**Event System:**
- `publishMessage`, `enableStreaming`, `disableStreaming`

**Core Types:**
- `World`, `Agent`, `AgentMessage`, `ChatData`, `WorldInfo`
- `LLMProvider`, `LoggerConfig`, `LogLevel`

**Utilities:**
- `logger`, `createCategoryLogger`, `generateId`, `toKebabCase`

**Subscription System:**
- All exports from `subscription.js` (used by Server API)

### Should Be Private (Internal Implementation)
**Internal Agent Functions:**
- `createAgent`, `loadAgentsIntoWorld`
- `syncWorldAgents`, `createAgentsBatch`, `registerAgentRuntime`, `getAgentConfig`

**Internal Chat Functions:**
- `createChat`, `getChat`, `createWorldChat` (legacy or internal)

**Internal Event Functions:**
- `subscribeAgentToMessages`, `processAgentMessage`, `shouldAgentRespond`
- `enableChatDataAutosave`, `disableChatDataAutosave`
- `subscribeToMessages`, `subscribeToSSE`, `publishSSE` (used via subscription system)

**Internal Types:**
- All parameter types (`CreateAgentParams`, `UpdateAgentParams`, etc.)
- Storage types (`StorageManager`, `StorageAPI`)
- Event types (`EventPayloadMap`, `TypedEvent`, `WorldEventPayload`)
- Internal data types (`AgentInfo`, `AgentData`, `WorldData`, `ChatInfo`, `AgentStorage`)

**Storage Factory:**
- `createStorageWrappers`, `createStorageWithWrappers`, `createStorageFromEnv`

**Internal Utilities:**
- `getCategoryLogLevel`, `initializeLogger`

### Special Considerations
1. **WorldChat Type**: May be needed for advanced users who want to work with chat snapshots directly
2. **Tests**: Can import from internal modules directly, don't need public API
3. **Future Expansion**: Leave room for promoting internal functions to public if needed
4. **Breaking Changes**: Moving from public to private is a breaking change, so be conservative
5. **Memory Management**: `updateAgentMemory` and `clearAgentMemory` are needed for Server API memory endpoints
6. **Chat Summarization**: `summarizeChat` is used by both CLI and Server API for manual summarization
7. **SSE Events**: `subscribeToSSE` and `publishSSE` are handled internally by subscription system, not directly imported

## Success Criteria
1. Public API only exports functions/types actually used by clients
2. Internal implementation details are hidden
3. CLI, Server API, and documentation examples continue to work
4. API surface is clean and maintainable
5. Clear separation between public and private APIs
