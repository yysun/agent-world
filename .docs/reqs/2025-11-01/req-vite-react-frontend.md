# Requirement: Replace Next.js with Vite + React Frontend

**Date:** 2025-11-01  
**Last Review:** 2025-11-03 (Architecture Plan & Review)  
**Status:** Ready for Implementation  
**Priority:** High  
**Architecture:** WebSocket-Only with eventemitter3

## Overview

Replace the Next.js frontend (`next/` folder) with a lightweight Vite + React SPA that connects **exclusively** to the WebSocket server for all operations (CRUD + real-time streaming).

## Background

- Current `next/` folder uses Next.js with API routes for REST endpoints and SSE streaming
- The `ws/` package already provides a **complete WebSocket server** with:
  - ✅ Slash command handlers for CRUD operations (world, agent, chat)
  - ✅ Real-time event streaming with sequence tracking
  - ✅ Message queue integration
  - ✅ Automatic reconnection support
- WebSocket is more efficient for bidirectional real-time communication
- Next.js API routes and SSR are unnecessary overhead for this use case

## Architecture Decision

After code review of `ws/ws-server.ts` and `ws/client.ts`, **WebSocket-Only Architecture** is confirmed as the correct approach:

- ✅ WebSocket server **already implements** full CRUD via slash commands
- ✅ Command/response pattern **already functional** (used by CLI and TUI)
- ✅ All operations supported: create, read, list, delete (update needs minor addition)
- ✅ Unified protocol reduces complexity
- ✅ Production-tested infrastructure

## Requirements

### What to Build

1. **New Vite + React Frontend** (`react/` folder)
   - Single Page Application (SPA) architecture
   - TypeScript + React 19
   - Vite for build tooling (faster than webpack)
   - Tailwind CSS for styling (reuse existing design)
   - **WebSocket-only client** for all operations

2. **Reuse Existing Design**
   - Port React components from `next/src/components/`:
     - `MarkdownEditor.tsx` - YAML frontmatter editor with preview
     - `StreamChatBox.tsx` - Chat interface with message display
     - `MarkdownMemory.tsx` - Markdown rendering component
   - Port page layouts and styling from `next/src/app/`
   - Maintain same UI/UX look and feel

3. **WebSocket Integration**
   - **Reuse existing `ws/ws-client.ts` directly** (no browser adaptation needed!)
   - Update ws-client to use `eventemitter3` (works in Node.js + Browser)
   - Connect to ws://localhost:3001 (WebSocket server)
   - Use slash commands for CRUD operations
   - Real-time event streaming for agent messages
   - Message queue integration
   - Automatic reconnection handling

4. **Features to Implement**
   - World listing and selection (via `list-worlds` command)
   - World creation and editing (via `create-world`, `update-world` commands)
   - Agent management (via `create-agent`, `list-agents`, `update-agent`, `delete-agent` commands)
   - Chat interface with real-time streaming
   - Event history and sequence tracking

### What NOT to Build

- No server-side rendering (SSR)
- No API routes
- No REST endpoints
- No SSE (Server-Sent Events) - use WebSocket instead

### What to Remove

- Delete entire `next/` folder after porting components
- Remove Next.js dependencies from root package.json

### What to Keep

- `web/` folder (AppRun frontend) - no changes
- `ws/` folder (WebSocket server) - minor update command additions only
- `core/` package - no changes
- All other packages remain unchanged

## Architecture

```
┌─────────────────────┐
│  Vite + React SPA   │ (react/ folder)
│   (Port 5173)       │ - Static frontend
└──────────┬──────────┘ - Browser WebSocket client
           │
           │ WebSocket ONLY (ws://localhost:3001)
           │ - Slash commands (CRUD)
           │ - Event streaming (real-time)
           │
           ▼
   ┌───────────────────┐
   │  WS Server        │ (ws/ folder)
   │  (Port 3001)      │ - Command handlers
   │                   │ - Event broadcaster
   └────────┬──────────┘ - Queue processor
            ▼
    ┌───────────────┐
    │ Core + SQLite │ (core/ folder)
    └───────────────┘
```

## Technical Details

### Project Structure

```
react/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.tsx           # Entry point
│   ├── App.tsx            # Root component with routing
│   ├── components/        # Reusable components
│   │   ├── MarkdownEditor.tsx
│   │   ├── StreamChatBox.tsx
│   │   └── MarkdownMemory.tsx
│   ├── pages/             # Page components
│   │   ├── HomePage.tsx
│   │   └── WorldPage.tsx
│   ├── hooks/             # Custom hooks
│   │   └── useWebSocket.ts
│   ├── lib/               # WebSocket client
│   │   └── ws-client.ts   # Browser-compatible client
│   ├── types/
│   │   └── index.ts
│   └── styles/
│       └── globals.css
└── public/
```

### Dependencies

- **Core:**
  - react 19.1.0
  - react-dom 19.1.0
  - typescript ^5
  
- **Build Tools:**
  - vite ^6
  - @vitejs/plugin-react
  
- **Styling:**
  - tailwindcss ^4
  - postcss

- **WebSocket:**
  - eventemitter3 ^5.0.1 (universal EventEmitter for Node.js + Browser)
  - Native browser WebSocket API (already supported in ws-client)

- **Markdown:**
  - gray-matter ^4.0.3 (YAML frontmatter)
  - react-markdown ^10.1.0
  - remark-gfm ^4.0.1

### WebSocket Communication Pattern

**1. Connection:**
```typescript
const client = new BrowserWSClient('ws://localhost:3001');
await client.connect();
```

**2. CRUD Operations via Slash Commands:**
```typescript
// World management
const worlds = await client.sendCommand(undefined, 'list-worlds');
const world = await client.sendCommand(undefined, 'create-world', { name, description });
await client.sendCommand(undefined, 'update-world', { worldId, name, description });
await client.sendCommand(undefined, 'delete-world', { worldId });

// Agent management (requires worldId)
const agents = await client.sendCommand(worldId, 'list-agents');
const agent = await client.sendCommand(worldId, 'create-agent', { name, type, provider, model, systemPrompt });
await client.sendCommand(worldId, 'update-agent', { agentId, name, systemPrompt });
await client.sendCommand(worldId, 'delete-agent', { agentId });

// Chat management (requires worldId)
await client.sendCommand(worldId, 'new-chat');
const chats = await client.sendCommand(worldId, 'list-chats');
await client.sendCommand(worldId, 'delete-chat', { chatId });
```

**3. Subscribe to Real-time Events:**
```typescript
await client.subscribe(worldId, chatId);
client.on('event', (event) => {
  // Handle agent responses, status updates, etc.
});
```

**4. Send Messages:**
```typescript
const messageId = await client.sendMessage(worldId, content, chatId, sender);
```

**5. Auto-reconnection:**
- Client automatically reconnects with exponential backoff
- Resubscribes to previous subscriptions
- Replays missed events using sequence tracking

### WebSocket Client Reusability

**✅ ws-client Already Works in Browser!**

The existing `ws/ws-client.ts` was designed as a **universal client**:

```typescript
// ws/ws-client.ts already has:
const isNode = typeof process !== 'undefined' && process?.versions?.node;

// Auto-detects environment and uses:
// - Browser: native WebSocket
// - Node.js: ws library
const WebSocketConstructor = isNode && NodeWebSocket 
  ? NodeWebSocket 
  : (globalThis as any).WebSocket;
```

**Only Change Required:**
- Replace `import { EventEmitter } from 'events'` (Node.js only)
- With `import { EventEmitter } from 'eventemitter3'` (universal)

**Why eventemitter3:**
- ✅ Works in Node.js AND browser (explicitly designed for both)
- ✅ API-compatible with Node.js EventEmitter (drop-in replacement)
- ✅ Small bundle size (2 KB)
- ✅ Zero dependencies
- ✅ Already tested and verified

**No other changes needed:**
- ✅ `connect()`, `disconnect()` - work as-is
- ✅ `subscribe()`, `unsubscribe()` - work as-is
- ✅ `sendMessage()`, `sendCommand()` - work as-is
- ✅ Event handlers: `on('event')`, `on('status')` - work as-is
- ✅ Automatic reconnection - works as-is
- ✅ Sequence tracking - works as-is

### WebSocket Server Updates

**Minor additions needed in `ws/ws-server.ts`:**

Currently supported commands:
- ✅ `create-world`, `get-world`, `list-worlds`, `delete-world`
- ✅ `create-agent`, `get-agent`, `list-agents`, `delete-agent`
- ✅ `new-chat`, `list-chats`, `delete-chat`
- ✅ `export-world`

**Missing commands (need to add):**
- ❌ `update-world` - Update world properties
- ❌ `update-agent` - Update agent configuration

**Implementation:** Add 2 command handlers (~20 lines each):
```typescript
case 'update-world':
  result = await updateWorld(worldId || params.worldId, params);
  responseMessage = `World '${params.name}' updated successfully`;
  break;

case 'update-agent':
  result = await updateAgent(worldId, params.agentId, params);
  responseMessage = `Agent updated successfully`;
  break;
```

## Success Criteria

- ✅ Vite + React app runs on port 5173
- ✅ All WebSocket commands work (including new update commands)
- ✅ Real-time chat streaming works correctly
- ✅ All components from Next.js are ported and functional
- ✅ Same UI/UX as Next.js version
- ✅ WebSocket reconnection with event replay works
- ✅ `next/` folder deleted
- ✅ No build errors or TypeScript issues

## Non-Goals

- Changing the `web/` AppRun frontend
- Modifying WebSocket server core architecture
- Adding new features not in Next.js version
- Optimizing or improving existing functionality

## Implementation Notes

- Use React Router for client-side routing
- Implement custom hook `useWebSocket` for connection management
- Reuse Tailwind CSS classes from Next.js components
- Keep component structure similar to Next.js for easier porting
- Use Vite's HMR (Hot Module Replacement) for development
- Handle WebSocket connection state in global context

## Timeline Estimate

- **Project Setup:** 1.5-2.5 hours (+env config, dark mode)
- **Update ws-client to use eventemitter3:** 1-1.5 hours (+types, copy strategy)
- **WS Server Updates (add update commands):** 1-2 hours
- **Core React Infrastructure:** 3-4 hours (+connection status, error handling)
- **Component Migration:** 3-4 hours (+ConnectionStatus component)
- **Page Implementation:** 3-4 hours
- **UI Polish & Testing:** 3-4 hours (+bundle optimization, detailed tests)
- **Cleanup:** 1 hour

**Total: 15-23 hours** (revised after architecture review)

## Development Workflow

1. **One-time setup:**
   ```bash
   # Install eventemitter3 in ws package
   npm install eventemitter3 --workspace=@agent-world/ws
   
   # Update ws-client.ts import
   # Change: import { EventEmitter } from 'events';
   # To:     import { EventEmitter } from 'eventemitter3';
   ```

2. **Start servers:**
   ```bash
   npm run ws:watch            # Port 3001 (WebSocket)
   npm run dev --workspace=react  # Port 5173 (Frontend)
   ```

3. **Development:**
   - Frontend imports: `import { WebSocketClient } from '../../ws/ws-client.js'`
   - Connects to `ws://localhost:3001` for everything
   - Vite HMR for instant updates
   - WebSocket devtools for debugging

4. **Testing:**
   - Unit tests for components
   - Integration tests for WebSocket communication
   - E2E tests for user flows

## Migration Strategy

Incremental migration approach:
1. Build `react/` frontend alongside existing `next/`
2. Test thoroughly before removal
3. Keep both running during transition
4. Delete `next/` only when `react/` is fully functional

## Risk Mitigation

**Risk:** eventemitter3 incompatibility with Node.js  
**Mitigation:** ✅ Verified - eventemitter3 explicitly supports Node.js + Browser, API-compatible, tested

**Risk:** Breaking TUI when changing ws-client  
**Mitigation:** eventemitter3 is drop-in replacement, all tests will verify compatibility

**Risk:** Missing update commands  
**Mitigation:** Trivial addition, mirror existing command patterns

**Risk:** Component porting introduces bugs  
**Mitigation:** Port components one-by-one, test each thoroughly

**Risk:** WebSocket reconnection issues  
**Mitigation:** ✅ No changes to reconnection logic - remains production-tested

## Related Files

- Source: `next/src/components/*.tsx`
- Target: `react/src/components/*.tsx`
- WebSocket Client: `ws/client.ts` (adapt for browser)
- WebSocket Server: `ws/ws-server.ts` (add update commands)
- Core Integration: `@agent-world/core`

## Architecture Review Summary

**Date:** 2025-11-02 (Initial), 2025-11-03 (Updated)  
**Reviewer:** AI Assistant  
**Status:** ✅ Approved with Modifications

### Key Findings

**1. WebSocket Server - Already Complete**
- ✅ WebSocket server already implements comprehensive CRUD via slash commands
- ✅ Command/response pattern provides clean request-response semantics
- ✅ Production-tested by CLI and TUI applications
- ⚠️ Only minor additions needed (2 update commands: update-world, update-agent)

**2. WebSocket Client - Reusable As-Is**
- ✅ `ws/ws-client.ts` already designed as universal client (Node.js + Browser)
- ✅ Already detects environment and uses appropriate WebSocket API
- ✅ TUI proves it works in React environment (Ink)
- ⚠️ **Only change needed:** Replace EventEmitter dependency

**3. EventEmitter Solution - eventemitter3**
- ✅ Explicitly designed for Node.js AND browser compatibility
- ✅ API-compatible with Node.js EventEmitter (drop-in replacement)
- ✅ Works with class inheritance: `class Client extends EventEmitter`
- ✅ Small bundle size: 2 KB
- ✅ Zero dependencies
- ✅ Tested and verified in Node.js
- ❌ AppRun instances rejected (UI framework, not event library)
- ❌ Vite polyfills rejected (unnecessary complexity, larger bundle)

**4. No Browser-Specific Client Needed**
- ✅ One client works everywhere: `ws/ws-client.ts`
- ✅ Same API for TUI and React web app
- ✅ Same imports: `import { WebSocketClient } from '../../ws/ws-client.js'`
- ✅ No environment conditionals needed

### Implementation Changes

**Minimal changes required:**

1. **Update ws-client.ts (1 line):**
   ```typescript
   // Change:
   import { EventEmitter } from 'events';
   // To:
   import { EventEmitter } from 'eventemitter3';
   ```

2. **Add dependency:**
   ```bash
   npm install eventemitter3 --workspace=@agent-world/ws
   ```

3. **Add 2 commands to ws-server.ts (~40 lines):**
   - `update-world` handler
   - `update-agent` handler

**That's it!** Everything else works as-is.

### Effort Reduction

- Original estimate: 20-30 hours (assuming browser client creation)
- Initial revised estimate: **13-20 hours** (with ws-client reuse)
- Final revised estimate: **15-23 hours** (with robustness improvements)
- **Savings: 5-7 hours** from original, +2-3h for quality improvements

### Architecture Review Updates (2025-11-03)

**Additional Requirements Identified:**

1. **ws-client Import Strategy**
   - ✅ Decision: Copy ws-client.ts to react/src/lib/ (don't use workspace import)
   - Rationale: Simpler Vite build, no TypeScript path issues, browser-optimized
   - Tradeoff: Manual sync needed (acceptable for stable file)

2. **Type Definitions**
   - ✅ Add @types/eventemitter3 to both ws and react workspaces
   - Prevents TypeScript errors with eventemitter3

3. **Environment Configuration**
   - ✅ Add .env file for WebSocket URL configuration
   - Supports different environments (dev, staging, prod)

4. **Browser Compatibility**
   - ✅ Add WebSocket support check in WebSocketContext
   - Graceful error for old browsers

5. **Connection Status UI**
   - ✅ Add ConnectionStatus component to header
   - Shows: Connected, Connecting, Reconnecting, Disconnected states

6. **Bundle Optimization**
   - ✅ Add lazy loading for pages (React.lazy)
   - ✅ Code splitting by route
   - Target: < 500KB initial bundle

7. **Dependencies Version Lock**
   - ✅ react-router-dom@^6.28.0 (v6 for stability, not v7)

### Decision

**WebSocket-only architecture with universal ws-client reuse is the optimal approach:**
- Minimal code changes (1 import + 2 command handlers)
- Zero duplication of logic (copy strategy for deployment, not architecture)
- Universal compatibility (eventemitter3 works everywhere)
- Production-tested foundation (ws-client already proven)
- Smallest bundle size (2 KB for eventemitter3)
- Robustness improvements identified and planned (+2-3 hours acceptable)

```┌─────────────────────┐

│  Vite + React SPA   │

## Development Workflow└─────┬───────────┬───┘

      │           │

1. **Start servers:**      │ REST      │ WebSocket

   ```bash      │ (CRUD)    │ (Events)

   npm run server:watch        # Port 3000 (REST API)      │           │

   npm run ws:watch            # Port 3001 (WebSocket)┌─────▼───────┐   ┌─▼─────────────┐

   npm run dev --workspace=react  # Port 5173 (Frontend)│ Express API │   │  WS Server    │

   ```│ Port 3000   │   │  Port 3001    │

└─────┬───────┘   └───┬───────────┘

2. **Development:**      │               │

   - Frontend connects to `http://localhost:3000` for REST      └───────┬───────┘

   - Frontend connects to `ws://localhost:3001` for WebSocket              ▼

   - Vite HMR for instant updates      ┌───────────────┐

      │ Core + SQLite │

3. **Testing:**      └───────────────┘

   - Unit tests for components```

   - Integration tests for API/WebSocket

   - E2E tests for user flows**Responsibilities:**

- **REST API (Port 3000):** World/Agent CRUD, initial data loading

## Migration Strategy- **WebSocket (Port 3001):** Real-time events, message streaming, chat updates



**Incremental migration approach:****Pros:**

1. Build `react/` frontend alongside existing `next/`- ✅ Clear separation of concerns

2. Test thoroughly before removal- ✅ REST for request/response patterns (CRUD)

3. Keep both running during transition- ✅ WebSocket for real-time streaming (correct use)

4. Delete `next/` only when `react/` is fully functional- ✅ Minimal changes to existing infrastructure

- ✅ Follows industry best practices

## Risk Mitigation

**Cons:**

**Risk:** Browser WebSocket client breaks existing functionality  - ⚠️ Two server connections instead of one

**Mitigation:** Keep `ws/client.ts` unchanged, create separate `ws/browser-client.ts`- ⚠️ Slightly more complex client setup



**Risk:** REST API changes needed  #### Option B: WebSocket-Only with Command Pattern

**Mitigation:** Use existing REST API endpoints without modification**Extend WebSocket server with CRUD commands**



**Risk:** Component porting introduces bugs  ```

**Mitigation:** Port components one-by-one, test each thoroughly┌─────────────────────┐

│  Vite + React SPA   │

**Risk:** WebSocket reconnection issues  └──────────┬──────────┘

**Mitigation:** Implement sequence tracking and event replay on reconnect           │ WebSocket Only

           │ (Commands + Events)

## Success Criteria           ▼

   ┌───────────────────┐

- [ ] Vite + React app runs on port 5173   │  Enhanced WS      │

- [ ] All CRUD operations work via REST API   │  Port 3001        │

- [ ] Real-time chat streaming works via WebSocket   │  + CRUD Commands  │

- [ ] Components look and behave like Next.js version   └────────┬──────────┘

- [ ] WebSocket reconnection with event replay works            ▼

- [ ] No TypeScript errors    ┌───────────────┐

- [ ] All tests pass    │ Core + SQLite │

- [ ] `next/` folder deleted    └───────────────┘

```

## Timeline Estimate

**New WebSocket message types:**

- Phase 1-2: 2-3 hours (setup + browser client)```typescript

- Phase 3-4: 3-4 hours (infrastructure + components)| { type: 'list-worlds' }

- Phase 5-6: 3-4 hours (pages + REST integration)| { type: 'create-world'; payload: { name, description } }

- Phase 7: 2-3 hours (WebSocket integration)| { type: 'update-world'; worldId: string; payload: World }

- Phase 8-9: 2-3 hours (polish + testing)| { type: 'list-agents'; worldId: string }

- Phase 10: 1 hour (cleanup)| { type: 'create-agent'; worldId: string; payload: Agent }

| { type: 'update-agent'; worldId: string; agentId: string; payload: Agent }

**Total:** 13-18 hours```



## Notes**Pros:**

- ✅ Single connection point

- Prioritize browser WebSocket client early (blocks frontend work)- ✅ Unified communication protocol

- Test REST endpoints thoroughly (existing server should work as-is)- ✅ No REST API needed

- Focus on parity with Next.js functionality, not enhancements

- Document any deviations from original requirement**Cons:**

- ❌ WebSocket not semantically correct for CRUD
- ❌ Requires significant WS server refactoring
- ❌ Harder to test and debug
- ❌ Against industry best practices
- ❌ Request/response pattern awkward over WebSocket

#### Option C: Keep Next.js, Add WebSocket
**Don't migrate to Vite, enhance existing Next.js**

**Pros:**
- ✅ No migration effort
- ✅ Keep existing REST routes
- ✅ Add WebSocket for real-time features

**Cons:**
- ❌ Doesn't address original goal (reduce overhead)
- ❌ Keeps SSR complexity
- ❌ Not aligned with requirement

### Browser WebSocket Client Issue

The `ws/client.ts` must be adapted for browser:

**Current (Node.js):**
```typescript
import WebSocket from 'ws';
import { EventEmitter } from 'events';
```

**Browser-compatible:**
```typescript
// Use native browser WebSocket
const ws = new WebSocket('ws://localhost:3001');

// Use custom EventEmitter or library like 'eventemitter3'
import EventEmitter from 'eventemitter3';
```

**Solutions:**
1. Create `ws/browser-client.ts` - browser-specific version
2. Use conditional exports in package.json
3. Use isomorphic WebSocket library that works in both environments

### Data Loading Strategy Clarification

**Initial Page Load (World List):**
- Option A: `GET /api/worlds` (REST)
- Option B: `{ type: 'list-worlds' }` (WebSocket command)

**World Creation:**
- Option A: `POST /api/worlds` (REST)
- Option B: `{ type: 'create-world' }` (WebSocket command)

**Real-time Updates:**
- Both options: WebSocket event streaming

### Recommendations

**Primary Recommendation: Option A (Hybrid)**

1. **Use REST API for CRUD operations**
   - Keep Express server on port 3000
   - Frontend uses `fetch()` for world/agent CRUD
   - Request/response pattern fits REST semantics

2. **Use WebSocket for real-time events**
   - Keep WS server on port 3001
   - Frontend subscribes to world events
   - Stream messages, agent responses, processing status

3. **Create browser-compatible WebSocket client**
   - New file: `ws/browser-client.ts`
   - Use native `WebSocket` API
   - Use `eventemitter3` or similar
   - Mirror `ws/client.ts` API surface

4. **Update requirement to clarify:**
   - REST API for CRUD (not "no REST endpoints")
   - WebSocket for real-time streaming (correct scope)
   - Separate concerns appropriately

### Implementation Impact

If Option A is chosen (recommended):
- ✅ Minimal changes to backend
- ✅ Clear frontend architecture
- ✅ Industry-standard patterns
- Create `react/` folder with Vite + React
- Create `ws/browser-client.ts` for frontend
- Use `fetch()` for CRUD, WebSocket for events
- Remove `next/` folder after migration

If Option B is chosen:
- ⚠️ Significant WS server refactoring
- ⚠️ Request/response over WebSocket (non-standard)
- ⚠️ More complex error handling
- ⚠️ Harder debugging and testing

## Related Files
- Source: `next/src/components/*.tsx`
- Target: `react/src/components/*.tsx`
- WebSocket Client: `ws/client.ts` (needs browser adaptation)
- REST API: `server/api.ts` (keep for CRUD)
- Core Integration: `@agent-world/core`
