# Requirement: Chat Design System (React + Tailwind + shadcn/ui)

**Date:** 2025-11-04  
**Status:** Under Review  
**Target:** react/ frontend application

---

## Overview

Create a **modular, reusable chat UI design system** for building AI chat, messaging, or support applications using **React 19**, **TailwindCSS 4**, and **shadcn/ui** component patterns.

## Application Structure: Two-Page Architecture

### Page Separation Strategy

The application maintains **two distinct pages** with clear separation of concerns:

#### 1. HomePage (`/`)
**Purpose:** World discovery and selection
- Display all available worlds in a grid layout
- Create new worlds with inline form
- Navigate to specific world detail pages
- Lightweight - no WebSocket connections or real-time data

**Key Features:**
- World list with name, description
- "Create New World" button with form
- Grid layout responsive to screen size
- Loading and empty states
- Footer with copyright

**User Intent:** "Which world should I work in?"

#### 2. WorldPage (`/world/:worldId`)
**Purpose:** Active world interaction and management
- Real-time chat interface with agents
- Agent creation and management
- World/agent settings editor
- WebSocket-based live updates

**Layout Structure:**
```
┌──────────────────────────────────────────┐
│ [Back] World Name                        │
│ Tabs: Main | Settings                    │
├──────────┬───────────────────────────────┤
│ Agents   │ Chat Area                     │
│ Sidebar  │ (or Settings Editor)          │
│          │                               │
│ + Add    │ Messages...                   │
│ Agent 1  │                               │
│ Agent 2  │ [Input] [Send]                │
└──────────┴───────────────────────────────┘
```

**User Intent:** "Let me interact with this world and its agents"

### Rationale for Separation

**1. Performance**
- HomePage: Fast, static list (no heavy components)
- WorldPage: Only loads when needed (lazy loading, WebSocket only on entry)

**2. State Management**
- Clear boundaries: selection state vs interaction state
- Easier cleanup: WebSocket disconnects when leaving world
- No complex global state coordination

**3. User Experience**
- Clean URLs: `/` vs `/world/my-world`
- Browser back button makes sense (exit world = back to list)
- Shareable/bookmarkable world links
- Mobile-friendly (no overlapping panels)

**4. Code Organization**
- Single Responsibility: Each page has one job
- Easier testing: Mock world data vs mock chat interactions
- Clear component ownership

### Navigation Enhancements (Post-MVP)

To improve flow between pages:
1. **Breadcrumb navigation** on WorldPage
2. **Recent worlds** quick access on HomePage
3. **World switcher dropdown** in header (WorldPage)
4. **Keyboard shortcut** (Esc) to return home from WorldPage

## What We Need

### 1. Design Token System
- Define chat-specific CSS variables for consistent theming
- Support light and dark modes
- Integrate with existing Tailwind configuration
- Provide semantic color naming for different message types

### 2. Message Type Support
- User messages (human input)
- Assistant messages (AI responses)
- System messages (system notifications)
- Tool messages (function call results)
- Streaming indicators for real-time responses

### 3. Core Components

#### ChatLayout
- Main container managing sidebar + thread view
- Responsive layout adapting to screen sizes
- Session/chat management integration

#### ChatSidebar
- List of chat sessions/conversations
- New chat creation
- Session selection and highlighting
- Scrollable history

#### ChatThread
- Main conversation view
- Header with chat title
- Message list area
- Input area with send controls
- Streaming/loading states

#### ChatMessageList
- Scrollable message container
- Auto-scroll to latest message
- Message grouping and spacing
- Empty state handling

#### ChatMessageBubble
- Individual message display
- Role-based styling (user/assistant/system/tool)
- Timestamp display
- Content formatting (text, markdown support)
- Message actions (edit, delete)

#### ChatInput
- Multi-line text input
- Send button with disabled states
- Keyboard shortcuts (Enter to send)
- Loading/disabled states

#### ChatTypingIndicator
- Animated "thinking" indicator
- Displayed during streaming/waiting
- Customizable messaging

### 4. Type Definitions
- ChatRole: 'user' | 'assistant' | 'system' | 'tool'
- ChatMessage interface with:
  - id: unique identifier
  - role: message role
  - content: message text
  - createdAt: timestamp
  - name: optional sender name
  - meta: optional metadata (streaming, tool info)

### 5. Integration Requirements
- Compatible with existing `core/types.ts` types (AgentMessage, ChatMessage)
- Support for react-markdown rendering
- Event-driven updates (messages, sessions)
- Accessibility compliance (ARIA labels, keyboard navigation)

### 6. Features to Support
- Real-time message streaming
- Message editing and deletion
- Session/chat management
- Agent filtering (show messages from specific agents)
- Threading/reply-to support
- Tool call visualization
- Error states and retry mechanisms

## Success Criteria

1. **Reusability**: Components can be used independently or together
2. **Themability**: Full light/dark mode support with customizable tokens
3. **Type Safety**: Complete TypeScript typing throughout
4. **Performance**: Efficient rendering for long conversations (virtualization consideration)
5. **Accessibility**: WCAG 2.1 AA compliance
6. **Maintainability**: Clear component boundaries and responsibilities
7. **Integration**: Seamless integration with existing Agent World architecture

## Non-Goals

- Backend implementation (API/WebSocket)
- State management library (use React hooks)
- Authentication/authorization
- File upload/attachment handling (future feature)
- Voice/audio messaging (future feature)

## Dependencies

- React 19.1.0
- TailwindCSS 4.x
- react-markdown (existing)
- TypeScript 5.x
- No additional UI libraries required (build from primitives)

## Architecture Considerations

### Component Hierarchy
```
ChatLayout
├── ChatSidebar
│   └── SessionList (scrollable)
└── ChatThread
    ├── ThreadHeader
    ├── ChatMessageList
    │   └── ChatMessageBubble[] (repeating)
    ├── ChatTypingIndicator (conditional)
    └── ChatInput
```

### State Management
- Parent component manages:
  - sessions/chats list
  - active session
  - messages array
  - streaming state
- Child components receive props and emit events
- No global state management needed (keep it simple)

### Styling Strategy
- Tailwind utility classes for layout and spacing
- CSS custom properties for theme values
- Component-specific classes for special states
- shadcn/ui pattern: copy/paste components, not npm packages

### Performance Considerations
- Virtualized scrolling for 500+ messages (future optimization)
- React.memo for message bubbles to prevent re-renders
- Efficient state updates (avoid full message array mutations)
- Debounced scroll-to-bottom on new messages

## Implementation Notes

- Start with basic components, iterate based on usage
- Prioritize type safety and developer experience
- Keep components small and focused (single responsibility)
- Document props and usage patterns inline
- Test with existing Agent World data structures

## Related Files

- `core/types.ts` - Core type definitions (AgentMessage, ChatMessage)
- `react/src/styles/globals.css` - Existing Tailwind setup
- `react/tailwind.config.js` - Tailwind configuration
- `web/src/components/world-chat.tsx` - Existing chat component (reference)
- `next/src/components/StreamChatBox.tsx` - Existing Next.js chat (reference)

---

## Architecture Plan (AP)

### Implementation Strategy

**Approach:** Incremental, test-driven development with focus on core components first, then enhancement features.

**Duration:** 3-5 days (assuming full-time development)

**Dependencies:**
- Existing React 19 + TailwindCSS 4 setup ✅
- `core/types.ts` with AgentMessage, ChatMessage interfaces ✅
- WebSocket infrastructure via `useWebSocket` hook ✅
- Current WorldPage layout with sidebar + main area ✅

---

### Phase 1: Foundation & Design Tokens (Day 1 - Morning)
**Goal:** Establish theme system and type safety

#### Task 1.1: Design Token Setup
- [ ] Update `tailwind.config.js` with message-specific color tokens
- [ ] Extend `globals.css` with CSS custom properties
- [ ] Verify light/dark mode compatibility
- [ ] Document token usage in comments

**Files:**
- `react/tailwind.config.js` - Add chat color extensions
- `react/src/styles/globals.css` - Add message token variables

**Acceptance:**
- Tokens reference existing design system (no conflicts)
- Dark mode works without manual overrides
- Can use `bg-message-user-bg` in className

#### Task 1.2: TypeScript Type Definitions
- [ ] Create `src/components/chat/types.ts`
- [ ] Define ChatRole, ChatMessage interfaces
- [ ] Map to existing `core/types.ts` types
- [ ] Export utility type guards (isUserMessage, etc.)

**Files:**
- `react/src/components/chat/types.ts` - NEW

**Acceptance:**
- Full TypeScript coverage, no `any` types
- Compatible with AgentMessage from core
- Type guards for role checking

---

### Phase 2: Core Message Components (Day 1 - Afternoon)
**Goal:** Build fundamental message display components

#### Task 2.1: ChatMessageBubble Component
- [ ] Create message bubble with role-based styling
- [ ] Add timestamp display
- [ ] Support basic text content
- [ ] Add sender name display
- [ ] Implement React.memo for performance

**Files:**
- `react/src/components/chat/chat-message-bubble.tsx` - NEW

**Props:**
```typescript
interface ChatMessageBubbleProps {
  message: ChatMessage;
  showTimestamp?: boolean;
  showSender?: boolean;
}
```

**Acceptance:**
- User messages: right-aligned, primary color
- Assistant messages: left-aligned, secondary color
- System messages: centered, muted style
- Tool messages: left-aligned, accent color

#### Task 2.2: ChatTypingIndicator Component
- [ ] Create animated typing indicator
- [ ] Add customizable message text
- [ ] CSS-only animation (no JS)

**Files:**
- `react/src/components/chat/chat-typing-indicator.tsx` - NEW

**Acceptance:**
- 3-dot bounce animation
- Matches assistant message styling
- Accessible (aria-live="polite")

#### Task 2.3: ChatMessageList Component
- [ ] Create scrollable message container
- [ ] Implement auto-scroll to bottom
- [ ] Add empty state
- [ ] Handle loading state

**Files:**
- `react/src/components/chat/chat-message-list.tsx` - NEW

**Acceptance:**
- Smooth auto-scroll on new messages
- Maintains scroll position when viewing history
- Empty state shows helpful message
- Handles 100+ messages without lag

---

### Phase 3: Input & Interaction (Day 2 - Morning)
**Goal:** Enable message sending and user interaction

#### Task 3.1: ChatInput Component
- [ ] Multi-line textarea with auto-resize
- [ ] Send button with loading states
- [ ] Enter to send, Shift+Enter for newline
- [ ] Disable during send/disconnect

**Files:**
- `react/src/components/chat/chat-input.tsx` - NEW

**Props:**
```typescript
interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}
```

**Acceptance:**
- Textarea grows up to 5 lines
- Enter sends, Shift+Enter adds newline
- Disabled state visually clear
- Focus on mount (optional prop)

#### Task 3.2: ChatThread Component
- [ ] Combine message list + typing indicator + input
- [ ] Add thread header
- [ ] Manage scroll behavior
- [ ] Handle streaming state

**Files:**
- `react/src/components/chat/chat-thread.tsx` - NEW

**Acceptance:**
- Shows typing indicator when streaming
- Input area always visible (sticky)
- Header shows world/agent context
- Smooth transitions between states

---

### Phase 4: Event Integration (Day 2 - Afternoon)
**Goal:** Connect to World event system

#### Task 4.1: useWorldEvents Hook
- [ ] Subscribe to EventType.MESSAGE
- [ ] Subscribe to EventType.SSE
- [ ] Handle event deduplication
- [ ] Cleanup on unmount

**Files:**
- `react/src/components/chat/hooks/use-world-events.ts` - NEW

**API:**
```typescript
function useWorldEvents(worldId: string) {
  return {
    messages: ChatMessage[];
    streaming: boolean;
    error: string | null;
  };
}
```

**Acceptance:**
- No duplicate messages from multi-agent scenarios
- Streaming updates appear in real-time
- Cleanup prevents memory leaks
- Error states handled gracefully

#### Task 4.2: useMessageState Hook
- [ ] Manage message CRUD operations
- [ ] Optimistic UI updates
- [ ] Error handling and rollback
- [ ] Edit/delete state machine

**Files:**
- `react/src/components/chat/hooks/use-message-state.ts` - NEW

**Acceptance:**
- Optimistic add shows immediately
- Rollback on send failure
- Edit state transitions work correctly
- Delete removes message + updates UI

---

### Phase 5: Layout & Integration (Day 3 - Morning)
**Goal:** Integrate components into WorldPage

#### Task 5.1: Replace StreamChatBox in WorldPage
- [ ] Remove existing StreamChatBox component
- [ ] Import ChatThread from new system
- [ ] Wire up event hooks
- [ ] Test agent filtering
- [ ] Verify WebSocket integration

**Files:**
- `react/src/pages/WorldPage.tsx` - MODIFY

**Changes:**
```tsx
// Before
<StreamChatBox messages={messages} ... />

// After
<ChatThread
  worldId={worldId}
  selectedAgent={selectedAgent}
  onSendMessage={handleSend}
/>
```

**Acceptance:**
- Chat works identically to before
- No regression in functionality
- Performance equal or better
- Agent filtering still works

#### Task 5.2: ChatSidebar Component (Agent List)
- [ ] Extract agent list from WorldPage sidebar
- [ ] Style as chat component
- [ ] Add agent avatars/initials
- [ ] Show online/activity status

**Files:**
- `react/src/components/chat/chat-sidebar.tsx` - NEW

**Acceptance:**
- Shows all world agents
- Click selects agent for filtering
- Visual indicator for selected agent
- Scrollable for many agents

---

### Phase 6: Enhancement Features (Day 3 - Afternoon)
**Goal:** Add nice-to-have features

#### Task 6.1: Markdown Rendering
- [ ] Install/verify react-markdown + remark-gfm
- [ ] Add rehype-sanitize for security
- [ ] Configure allowed HTML tags
- [ ] Add code syntax highlighting (optional)

**Files:**
- `react/src/components/chat/chat-message-bubble.tsx` - MODIFY
- `react/package.json` - ADD dependencies

**Acceptance:**
- Markdown renders correctly
- XSS protection enabled
- Links open in new tab with rel="noopener"
- Code blocks formatted (if highlighted)

#### Task 6.2: ChatToolBadge Component
- [ ] Display tool_calls from AgentMessage
- [ ] Show tool name and status
- [ ] Expandable result view (optional)
- [ ] Visual hierarchy (less prominent)

**Files:**
- `react/src/components/chat/chat-tool-badge.tsx` - NEW

**Acceptance:**
- Tool calls visible in assistant messages
- Click expands result (if implemented)
- Clear visual distinction from main content
- Handles multiple tool calls per message

---

### Phase 7: Threading & Replies (Day 4)
**Goal:** Support message threading

#### Task 7.1: ChatThreadIndicator Component
- [ ] Show "replying to" badge
- [ ] Display parent message excerpt
- [ ] Click scrolls to parent (optional)
- [ ] Visual connection line (optional)

**Files:**
- `react/src/components/chat/chat-thread-indicator.tsx` - NEW

**Acceptance:**
- Visible when replyToMessageId exists
- Shows parent sender + preview
- Doesn't clutter bubble design
- Works with all message types

#### Task 7.2: Thread Context in ChatMessageBubble
- [ ] Pass allMessages for parent lookup
- [ ] Integrate ChatThreadIndicator
- [ ] Update message bubble layout
- [ ] Test with nested threads

**Files:**
- `react/src/components/chat/chat-message-bubble.tsx` - MODIFY

**Acceptance:**
- Threading displays correctly
- No performance impact (memoization)
- Handles missing parents gracefully
- Multi-level threads work

---

### Phase 8: Accessibility & Polish (Day 5)
**Goal:** Ensure WCAG 2.1 AA compliance

#### Task 8.1: ARIA Annotations
- [ ] Add role="log" to message list
- [ ] Add role="status" to typing indicator
- [ ] Add aria-label to all interactive elements
- [ ] Test with screen reader (VoiceOver/NVDA)

**Files:**
- All chat components - MODIFY

**Acceptance:**
- Screen reader announces new messages
- All buttons have accessible names
- Keyboard navigation works fully
- Focus visible on all interactive elements

#### Task 8.2: Keyboard Navigation
- [ ] Arrow keys navigate messages (optional)
- [ ] Tab order is logical
- [ ] Enter/Esc shortcuts work
- [ ] Focus returns to input after send

**Files:**
- `react/src/components/chat/chat-thread.tsx` - MODIFY
- `react/src/components/chat/chat-input.tsx` - MODIFY

**Acceptance:**
- Tab moves through interactive elements
- Enter sends message (input focused)
- Esc clears input or cancels edit
- Focus management is smooth

#### Task 8.3: Visual Polish
- [ ] Smooth animations for new messages
- [ ] Loading states for all async operations
- [ ] Error states with retry buttons
- [ ] Empty states with helpful CTAs

**Files:**
- All chat components - MODIFY

**Acceptance:**
- Transitions feel smooth (no jank)
- Loading states prevent confusion
- Errors give actionable feedback
- Empty states guide users

---

### Phase 9: Testing & Documentation (Day 5 - Afternoon)
**Goal:** Ensure quality and maintainability

#### Task 9.1: Unit Tests
- [ ] Test message bubble rendering
- [ ] Test input validation
- [ ] Test event hook subscriptions
- [ ] Test state management hook

**Files:**
- `react/src/components/chat/__tests__/` - NEW directory
- Create test files for each component

**Coverage Target:** >80% for core components

#### Task 9.2: Integration Tests
- [ ] Test full chat flow (send → receive)
- [ ] Test agent filtering
- [ ] Test WebSocket reconnection
- [ ] Test message editing/deletion

**Acceptance:**
- E2E scenarios pass
- Error scenarios handled
- No console warnings

#### Task 9.3: Documentation
- [ ] Add JSDoc to all components
- [ ] Document props and usage
- [ ] Create usage examples
- [ ] Update component README

**Files:**
- Component files - ADD JSDoc comments
- `react/src/components/chat/README.md` - NEW

**Acceptance:**
- All public APIs documented
- Usage examples clear
- Props table complete

---

### Implementation Checklist Summary

**Phase 1 (Day 1 AM):** Foundation
- [ ] Design tokens in tailwind.config.js
- [ ] CSS variables in globals.css
- [ ] TypeScript types.ts

**Phase 2 (Day 1 PM):** Core Components
- [ ] ChatMessageBubble
- [ ] ChatTypingIndicator
- [ ] ChatMessageList

**Phase 3 (Day 2 AM):** Interaction
- [ ] ChatInput
- [ ] ChatThread

**Phase 4 (Day 2 PM):** Events
- [ ] useWorldEvents hook
- [ ] useMessageState hook

**Phase 5 (Day 3 AM):** Integration
- [ ] Replace StreamChatBox in WorldPage
- [ ] ChatSidebar component

**Phase 6 (Day 3 PM):** Enhancements
- [ ] Markdown rendering
- [ ] ChatToolBadge

**Phase 7 (Day 4):** Threading
- [ ] ChatThreadIndicator
- [ ] Thread integration

**Phase 8 (Day 5 AM):** Polish
- [ ] ARIA annotations
- [ ] Keyboard navigation
- [ ] Visual polish

**Phase 9 (Day 5 PM):** Quality
- [ ] Unit tests
- [ ] Integration tests
- [ ] Documentation

---

### Risk Mitigation

**Risk 1: Performance with Large Message Counts**
- Mitigation: Implement React.memo early, test with 500+ messages
- Fallback: Add virtualization in Phase 10 (post-MVP)

**Risk 2: WebSocket Event Deduplication**
- Mitigation: Use messageId for dedup map, test with multi-agent
- Fallback: Server-side dedup if client-side proves insufficient

**Risk 3: Markdown XSS Vulnerability**
- Mitigation: Use rehype-sanitize from start, test with malicious input
- Fallback: Disable HTML entirely, text-only rendering

**Risk 4: Threading Complexity**
- Mitigation: Start simple (just show parent), defer advanced features
- Fallback: Hide threading UI if performance issues, keep data structure

---

## Architecture Review Findings

### ✅ Strengths

1. **Clear Component Boundaries**: Well-defined single-responsibility components
2. **Type Safety Focus**: Strong TypeScript integration from the start
3. **Existing Integration**: Aligns well with current `core/types.ts` structure
4. **Progressive Enhancement**: Can be built incrementally without breaking changes
5. **shadcn/ui Pattern**: Copy/paste approach reduces dependency bloat

### ⚠️ Identified Issues & Recommendations

#### Issue 0: Application Architecture - Two-Page Structure
**Status:** ✅ Resolved

**Decision:** Maintain two separate pages (HomePage and WorldPage) rather than combining into single-page application.

**Rationale:**
- **Performance:** HomePage is lightweight (no WebSocket), WorldPage loads heavy components only when needed
- **User Intent:** Different mental models (selecting vs interacting) = different UIs
- **State Management:** Clear boundaries prevent complex global state coordination
- **Navigation:** Clean URLs, shareable links, browser history makes sense

**Implementation Impact:**
- Chat design system components will be used **only in WorldPage**
- HomePage remains simple world list (no chat components)
- No need for collapsible sidebar or world-switching UI in chat view
- Component API should not assume sidebar presence (can be used standalone)

#### Issue 1: Design Token Naming Collision
**Problem:** The proposed CSS variables use generic names that may conflict with existing tokens:
- `--chat-bg` vs existing `--background`
- `--chat-bubble-user` vs `--primary`

**Recommendation:**
- Option A: Use namespaced variables: `--chat-message-user-bg`, `--chat-message-assistant-bg`
- Option B: Extend existing color system instead of creating parallel system
- **Suggested Approach**: Option B - Extend `tailwind.config.js` with semantic chat tokens that reference existing design system

**Updated Token Structure:**
```css
:root {
  /* Message-specific tokens extending existing system */
  --message-user-bg: var(--primary);
  --message-user-fg: var(--primary-foreground);
  --message-assistant-bg: var(--secondary);
  --message-assistant-fg: var(--secondary-foreground);
  --message-system-bg: var(--muted);
  --message-system-fg: var(--muted-foreground);
  --message-tool-bg: var(--accent);
  --message-tool-fg: var(--accent-foreground);
}
```

#### Issue 2: Missing Threading/Reply Visualization
**Problem:** The requirement mentions "threading/reply-to support" but doesn't define visual treatment.

**Recommendation:**
- Add `ChatMessageThread` component for nested replies
- Define visual indicators: indentation, connecting lines, "replying to" badges
- Support both flat and threaded views
- Leverage existing `replyToMessageId` from `core/types.ts`

**Component Addition:**
```
ChatMessageBubble
├── ThreadIndicator (if replyToMessageId exists)
└── Content
```

#### Issue 3: Accessibility Gaps
**Problem:** While WCAG 2.1 AA is mentioned, specific requirements are missing.

**Recommendation:**
- Add required ARIA roles: `role="log"` for message list, `role="status"` for typing indicator
- Keyboard navigation: Arrow keys for message navigation, Tab for input focus
- Screen reader announcements for new messages and streaming updates
- Focus management after sending messages
- Live regions for streaming content

#### Issue 4: Virtualization Strategy Unclear
**Problem:** Performance mentions "virtualization for 500+ messages" but defers implementation.

**Recommendation:**
- **Critical**: Define threshold now (300 messages?) to avoid refactoring later
- Suggest react-window or react-virtual for virtualization
- Design message bubble API to be virtualization-compatible from the start
- Consider implementing basic virtualization in v1 instead of deferring

#### Issue 5: Message State Management Complexity
**Problem:** The proposal assumes simple parent state management, but editing/deleting creates complex state transitions.

**Recommendation:**
- Define clear state machine for message lifecycle:
  - `idle` → `editing` → `saving` → `idle` | `error`
  - `idle` → `deleting` → `deleted` | `error`
- Add optimistic UI updates with rollback on failure
- Consider using useReducer instead of multiple useState calls
- Document error recovery strategies

**State Structure:**
```typescript
interface MessageState {
  messages: ChatMessage[];
  editingId: string | null;
  deletingId: string | null;
  optimisticUpdates: Map<string, ChatMessage>;
  errors: Map<string, string>;
}
```

#### Issue 6: Markdown Rendering Security
**Problem:** Direct markdown rendering without sanitization could introduce XSS vulnerabilities.

**Recommendation:**
- Use react-markdown with strict configuration
- Sanitize HTML output (remark-gfm is safe, but verify plugins)
- Disable dangerous markdown features (raw HTML, JavaScript links)
- Add code syntax highlighting (but sanitize code blocks)

**Configuration:**
```typescript
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeSanitize]}
  components={{
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  }}
>
  {content}
</ReactMarkdown>
```

#### Issue 7: Event-Driven Updates Architecture
**Problem:** "Event-driven updates" mentioned but integration with `World.eventEmitter` not defined.

**Recommendation:**
- Use React hooks to subscribe to `EventType.MESSAGE`, `EventType.SSE`, etc.
- Create `useWorldEvents` hook for event subscription lifecycle
- Handle event deduplication (same message from multiple agents)
- Define update batching strategy for performance

**Hook Pattern:**
```typescript
function useWorldEvents(worldId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  useEffect(() => {
    const world = getWorld(worldId);
    
    const handleMessage = (event: WorldMessageEvent) => {
      setMessages(prev => [...prev, convertToMessage(event)]);
    };
    
    world.eventEmitter.on(EventType.MESSAGE, handleMessage);
    return () => world.eventEmitter.off(EventType.MESSAGE, handleMessage);
  }, [worldId]);
  
  return { messages };
}
```

#### Issue 8: Mobile Responsiveness Not Addressed
**Problem:** No mobile/responsive design strategy defined.

**Recommendation:**
- Collapsible sidebar on mobile (hamburger menu)
- Full-width messages on small screens
- Touch-friendly targets (48x48px minimum)
- Swipe gestures for sidebar (optional enhancement)
- Consider PWA manifest for app-like experience

#### Issue 9: Tool Call Visualization Undefined
**Problem:** "Tool call visualization" mentioned but no design specified.

**Recommendation:**
- Create `ToolCallBadge` component for inline tool indicators
- Show tool name, status (pending/success/error), and expandable results
- Use existing `tool_calls` structure from `AgentMessage`
- Visual hierarchy: tool calls less prominent than main content

**Visual Treatment:**
```
┌─────────────────────────────────┐
│ Assistant                       │
│ I'll search for that...         │
│                                 │
│ 🔧 web_search("react hooks")    │
│    └─ Found 10 results          │
│                                 │
│ Here's what I found...          │
└─────────────────────────────────┘
```

#### Issue 10: Session Management Complexity
**Problem:** ChatSidebar handles sessions but no session state management defined.

**Recommendation:**
- Define session operations: create, rename, delete, archive
- Add session metadata: message count, last active, unread indicator
- Implement session search/filter
- Consider session persistence strategy (local storage vs backend)

### 🎯 Priority Recommendations

**Must Fix Before Implementation:**
1. **Issue 1**: Resolve design token strategy (avoid conflicts)
2. **Issue 5**: Define message state management pattern
3. **Issue 7**: Define event integration architecture

**Should Address in V1:**
4. **Issue 2**: Add threading/reply visualization
5. **Issue 3**: Complete accessibility requirements
6. **Issue 6**: Secure markdown rendering

**Can Defer to V2:**
7. **Issue 4**: Virtualization (but design for it)
8. **Issue 8**: Advanced mobile features (start with responsive)
9. **Issue 9**: Rich tool call UI (start with basic badges)
10. **Issue 10**: Advanced session features (start with list/select)

### 📋 Updated Component List

Based on review findings, here's the refined component structure:

```
src/components/chat/
├── chat-layout.tsx          # Main container (used in WorldPage)
├── chat-sidebar.tsx         # Agent list sidebar (WorldPage specific)
├── chat-thread.tsx          # Thread container
├── chat-message-list.tsx    # Message scroll area
├── chat-message-bubble.tsx  # Individual message
├── chat-thread-indicator.tsx # Reply visualization (NEW)
├── chat-input.tsx           # Input area
├── chat-typing-indicator.tsx # Streaming indicator
├── chat-tool-badge.tsx      # Tool call display (NEW)
├── hooks/
│   ├── use-world-events.ts  # Event subscription (NEW)
│   └── use-message-state.ts # Message state manager (NEW)
└── types.ts                 # Component types
```

**Note:** The chat design system components will be integrated into **WorldPage**. HomePage remains a simple world list and does not use chat components.

### 🔐 Security Checklist

- [ ] Sanitize markdown HTML output
- [ ] Validate message IDs (prevent injection)
- [ ] Rate limit input submissions (client-side)
- [ ] Escape user-generated content in UI
- [ ] Validate URLs in markdown links
- [ ] CSP headers for production deployment

### 🧪 Testing Strategy

- [ ] Unit tests for message state management
- [ ] Integration tests for event handling
- [ ] Accessibility tests with jest-axe
- [ ] Visual regression tests for message bubbles
- [ ] Performance tests for long conversations
- [ ] Cross-browser testing (Chrome, Firefox, Safari)

---

**Next Steps:**
1. ✅ **Requirement Document Created** (this file)
2. ✅ **Architecture Review Completed** (findings above)
3. ✅ **Architecture Plan Created** → [plan-chat-design-system.md](../../plans/2025-11-04/plan-chat-design-system.md)
4. **Update tailwind.config.js** with refined token strategy
5. **Step-by-step Implementation (SS)** - Begin Phase 1
