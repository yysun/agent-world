# Code Reuse from Web Frontend

This document tracks what code was reused from the web frontend and how it was adapted.

## Summary

| Component | Source | LOC | Reuse % | Notes |
|-----------|--------|-----|---------|-------|
| Types | web/src/types/ | 360 | 90% | Removed UI-specific fields |
| ~~API Client~~ | ~~web/src/api.ts~~ | ~~N/A~~ | ~~N/A~~ | **NOT USED - WebSocket only** |
| Domain Logic | web/src/domain/ | 730 | 78% | Extracted pure functions |
| **TOTAL** | | **1090** | **84%** | High reuse rate (WebSocket-only) |

## Important: TUI is WebSocket-Only

**The TUI does NOT use the REST API client from the web frontend.**

- **Web Frontend:** Uses HTTP/REST API (`web/src/api.ts`) + Server-Sent Events (SSE)
- **TUI Client:** Uses WebSocket protocol exclusively (`ws://localhost:3001`)

All operations in TUI (subscribe, enqueue messages, execute commands) are done via WebSocket messages, not HTTP requests.

## Type Definitions (tui/src/types/)

**Copied from:** `web/src/types/index.ts`

**Changes:**
- Removed `spriteIndex`, `messageCount` from Agent
- Removed `expandable`, `resultPreview` from Message
- Kept all core data structures and event types

## API Client (tui/src/api/)

**NOT USED - TUI is WebSocket-only**

**Reason:**
- TUI connects to WebSocket server (ws://localhost:3001), not HTTP API server
- All operations use WebSocket protocol (subscribe, enqueue, command messages)
- REST API client is for web frontend HTTP requests only
- No HTTP calls needed in TUI - everything is real-time via WebSocket

## Domain Logic (tui/src/logic/)

**Extracted from:** `web/src/domain/*.ts`

**Strategy:**
- Extracted pure functions (*Logic, validation, helpers)
- Skipped AppRun state creators (rewritten as React hooks)
- Maintained business logic algorithms

**Files:**
- `validation.ts` ← `input.ts`, `editing.ts` (validation functions)
- `message-utils.ts` ← `message-display.ts` (pure logic functions)
- `chat-utils.ts` ← `chat-history.ts` (helper functions)
- `stream-utils.ts` ← `sse-streaming.ts` (boolean checks, getters)

## What Was Rewritten

**React Hooks (tui/src/hooks/):**
- `useWebSocket` - New (connects to ws:// server, handles all communication)
- `useWorldState` - Replaces AppRun component state
- `useEventProcessor` - Replaces AppRun update handlers

**Ink Components (tui/src/components/):**
- All UI components rewritten for Ink (React for terminals)
- Same patterns as AppRun components but using Ink primitives
- <Box>, <Text> instead of <div>, <span>

## Communication Protocol Comparison

| Aspect | Web Frontend | TUI Client |
|--------|-------------|------------|
| **Protocol** | HTTP/REST + SSE | WebSocket only |
| **Server** | http://localhost:3000 | ws://localhost:3001 |
| **API Calls** | REST API (`/api/worlds`, etc.) | WebSocket messages |
| **Real-time** | Server-Sent Events (SSE) | WebSocket event stream |
| **Operations** | HTTP POST/GET/DELETE | WebSocket `enqueue`, `command`, `subscribe` |

## Maintenance Strategy

**When updating web frontend:**
1. Check if changes affect types → Update `tui/src/types/`
2. ~~Check if changes affect API~~ → **N/A - TUI uses WebSocket, not REST API**
3. Check if changes affect domain logic → Update `tui/src/logic/`
4. UI changes typically don't affect TUI (separate presentation layer)

**Keep in sync:**
- Type definitions (data structures)
- Business logic (validation, calculations)
- **WebSocket protocol changes** (if WebSocket server protocol updates)

**Independent evolution:**
- UI components (AppRun vs Ink)
- State management (AppRun vs React hooks)
- Framework-specific patterns
- **Communication protocol (HTTP/SSE vs WebSocket)**

## Architecture Diagram

```
Web Frontend (web/)          TUI Client (tui/)
      ↓                            ↓
  HTTP/REST API            WebSocket Protocol
      ↓                            ↓
API Server (server/)       WebSocket Server (ws/)
      ↓                            ↓
      └─────── Core & Storage ────┘
```

**Key Difference:** Web frontend and TUI use different protocols to communicate with the backend, but share the same core types and domain logic.
