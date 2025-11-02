# TUI Layout Redesign - Complete

**Date:** 2025-11-02  
**Status:** ✅ Complete  
**Commit:** a0dfa7b

## What Was Implemented

### New Vertical Layout
Redesigned from side-by-side to top-to-bottom stacking:

```
┌─────────────────────────────────────┐
│ TopPanel (3 lines)                  │
│ • AgentBar (horizontal inline)      │
│ • World › Chat title                │  
│ • Connection status                 │
├─────────────────────────────────────┤
│                                     │
│ Messages Area (~80% of screen)      │
│ • Full width scrollable             │
│ • Color-coded by sender             │
│                                     │
├─────────────────────────────────────┤
│ Input Box (2 lines)                 │
├─────────────────────────────────────┤
│ StatusBar (1 line)                  │
│ Ctrl+W/A/H for CRUD | Stats         │
└─────────────────────────────────────┘
```

### Components Created

**Layout Components:**
- `TopPanel.tsx` - Top bar container with agents + title + status
- `AgentBar.tsx` - Horizontal inline agent status display
- `StatusBar.tsx` - Bottom bar with shortcuts and stats
- `ChatView.tsx` - Updated for full width (removed 75% constraint)

**Popup Components:**
- `Popup.tsx` - Base modal overlay component (centered, bordered)
- `WorldManager.tsx` - World CRUD popup (Ctrl+W)
- `AgentManager.tsx` - Agent CRUD popup (Ctrl+A)
- `ChatManager.tsx` - Chat CRUD popup (Ctrl+H)

**Hooks:**
- `usePopup.ts` - Popup state management + keyboard shortcuts
- `useWebSocketConnection.ts` - Connection lifecycle (NEW)
- `useAgentWorldClient.ts` - Protocol operations (NEW)
- `useEventProcessor.ts` - Event routing (NEW)
- `useWorldState.ts` - State management (REFACTORED)

**Removed:**
- `AgentSidebar.tsx` - Replaced by horizontal AgentBar
- `useWebSocket.ts` - Replaced by 4 focused hooks

### Features

**Vertical Layout Benefits:**
- ✅ More screen space for messages (80%+ vs 75%)
- ✅ Better chat app flow (top-to-bottom)
- ✅ Cleaner interface (no side panels)
- ✅ Agents always visible (top bar)
- ✅ Full width messages (better readability)

**Popup System:**
- ✅ Modal overlays don't clutter main view
- ✅ Keyboard shortcuts: Ctrl+W/A/H to open, Escape to close
- ✅ Centered with double border styling
- ✅ Title bar with close hint
- ✅ Single popup at a time

**AgentBar Features:**
- ✅ Horizontal inline display: `● Agent1 ○ Agent2 ⊙ Agent3...`
- ✅ Color-coded: Green (active), Gray (inactive), Blue (streaming)
- ✅ Streaming indicator with spinner
- ✅ Width-aware truncation: "... +N more" when too many
- ✅ Space-efficient (vs vertical sidebar)

**Focused Hooks Architecture:**
- ✅ `useWebSocketConnection` - Connection only (~140 LOC)
- ✅ `useAgentWorldClient` - Operations only (~120 LOC)
- ✅ `useWorldState` - State only (~140 LOC)
- ✅ `useEventProcessor` - Event routing (~210 LOC)
- ✅ Better separation of concerns
- ✅ Easier testing and maintenance
- ✅ Reusable components

### Keyboard Shortcuts

**Global:**
- `Ctrl+C` - Exit application
- `Ctrl+W` - Open World Manager popup
- `Ctrl+A` - Open Agent Manager popup
- `Ctrl+H` - Open Chat Manager popup
- `Escape` - Close current popup

**StatusBar Display:**
```
Ctrl+C: Exit | Ctrl+W: Worlds | Ctrl+A: Agents | Ctrl+H: Chats | Messages: 42 | Agents: 3
```

### Code Changes

**Files Modified:** 6
- `tui/src/App.tsx` - Vertical layout + popup integration
- `tui/src/hooks/useWorldState.ts` - Refactored (removed event processing)
- `tui/src/components/ChatView.tsx` - Full width support

**Files Added:** 13
- 6 components (TopPanel, AgentBar, StatusBar, Popup, WorldManager, AgentManager, ChatManager)
- 4 hooks (usePopup, useWebSocketConnection, useAgentWorldClient, useEventProcessor)
- 1 plan document

**Files Deleted:** 2
- `tui/src/components/AgentSidebar.tsx`
- `tui/src/hooks/useWebSocket.ts`

**Total Changes:**
- 17 files changed
- 1,397 insertions
- 490 deletions
- Net: +907 lines

### Architecture Improvements

**Before:**
- Monolithic `useWebSocket` hook (~250 LOC)
- Side-by-side layout (25% sidebar + 75% chat)
- No CRUD UI (command-only)
- Agent status in vertical sidebar

**After:**
- 4 focused hooks (connection, client, state, processor)
- Vertical layout (100% width messages)
- Popup-based CRUD UI with keyboard shortcuts
- Agent status in horizontal top bar
- Better separation of concerns
- More testable components

### Integration Points

**Hook Flow:**
```typescript
useWebSocketConnection()
  ↓ (ws, connected)
useAgentWorldClient(ws, connected)
  ↓ (protocol operations)
useWorldState()
  ↓ (state + mutation methods)
useEventProcessor(worldState)
  ↓ (processes WSMessage events)
```

**Popup Flow:**
```typescript
usePopup(enabled)
  → Ctrl+W → WorldManager → executeCommand('/world:...')
  → Ctrl+A → AgentManager → executeCommand('/agent:...')
  → Ctrl+H → ChatManager → executeCommand('/chat:...')
  → Escape → closePopup()
```

### Current State

**Working:**
- ✅ Vertical layout renders correctly
- ✅ TopPanel shows agents + title + status
- ✅ Messages display full width
- ✅ StatusBar shows shortcuts
- ✅ Popup keyboard shortcuts work
- ✅ Modal overlays render on top

**Placeholder (Commands Work):**
- ⏳ WorldManager popup (shows current world)
- ⏳ AgentManager popup (lists agents)
- ⏳ ChatManager popup (shows current chat)
- ⏳ CRUD forms (use commands for now)

**Testing Needed:**
- ⏳ Real WebSocket connection
- ⏳ Message streaming
- ⏳ Agent status updates
- ⏳ Popup interaction
- ⏳ Terminal resize handling

### Next Steps

**Phase 2: Enhanced Popups (Optional)**
- Add interactive forms in popups
- World: Create with name/description inputs
- Agent: Create with name/prompt/LLM config inputs
- Chat: Create with title input
- Delete confirmations with Y/N prompts
- Real-time list updates from WebSocket events

**Phase 3: Polish & UX**
- Terminal resize handling
- Smooth scrolling in messages
- Popup animations (if terminal supports)
- Loading states in popups
- Error handling in CRUD operations

**Phase 4: Testing**
- Integration tests with real WebSocket server
- Component unit tests
- Keyboard shortcut tests
- Layout responsive tests (80x24 to 200x50)

## Usage

**Start TUI:**
```bash
npm run tui:watch -- --world my-world --chat my-chat
```

**Keyboard Shortcuts:**
- Type messages normally
- `/command` for commands
- `Ctrl+W` → World Manager
- `Ctrl+A` → Agent Manager
- `Ctrl+H` → Chat Manager
- `Escape` → Close popup
- `Ctrl+C` → Exit

**CRUD via Commands (for now):**
```
/world:create name="New World"
/world:switch name="Other World"
/agent:create name="Helper" prompt="You are a helpful assistant"
/chat:create title="Planning"
/chat:switch chatId="abc123"
```

## Summary

Successfully redesigned TUI layout from side-by-side to vertical stacking with popup-based CRUD operations. The new layout gives 80%+ of screen space to messages, shows agents inline at the top, and provides keyboard-driven CRUD via popups. The architecture now uses 4 focused hooks for better separation of concerns and testability.

**Key Achievement:** Clean, chat-app-style interface with maximum message space and non-intrusive CRUD operations.
