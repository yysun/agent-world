# Architecture Plan: Chat Design System (React + Tailwind + shadcn/ui)

**Date:** 2025-11-04  
**Status:** Ready for Implementation  
**Related:** [req-chat-design-system.md](../../reqs/2025-11-04/req-chat-design-system.md)

---

## Implementation Strategy

**Approach:** Incremental, test-driven development with focus on core components first, then enhancement features.

**Duration:** 3-5 days (assuming full-time development)

**Target:** react/ frontend application (specifically WorldPage integration)

**Dependencies:**
- ✅ Existing React 19 + TailwindCSS 4 setup
- ✅ `core/types.ts` with AgentMessage, ChatMessage interfaces
- ✅ WebSocket infrastructure via `useWebSocket` hook
- ✅ Current WorldPage layout with sidebar + main area

---

## Phase 1: Foundation & Design Tokens (Day 1 - Morning)
**Goal:** Establish theme system and type safety

### Task 1.1: Design Token Setup
- [ ] Update `tailwind.config.js` with message-specific color tokens
- [ ] Extend `globals.css` with CSS custom properties
- [ ] Verify light/dark mode compatibility
- [ ] Document token usage in comments

**Files:**
- `react/tailwind.config.js` - MODIFY
- `react/src/styles/globals.css` - MODIFY

**Token Structure:**
```javascript
// tailwind.config.js
extend: {
  colors: {
    message: {
      user: {
        bg: "hsl(var(--primary))",
        fg: "hsl(var(--primary-foreground))",
      },
      assistant: {
        bg: "hsl(var(--secondary))",
        fg: "hsl(var(--secondary-foreground))",
      },
      system: {
        bg: "hsl(var(--muted))",
        fg: "hsl(var(--muted-foreground))",
      },
      tool: {
        bg: "hsl(var(--accent))",
        fg: "hsl(var(--accent-foreground))",
      },
    },
  },
}
```

**Acceptance:**
- Tokens reference existing design system (no conflicts)
- Dark mode works without manual overrides
- Can use `bg-message-user-bg` in className

---

### Task 1.2: TypeScript Type Definitions
- [ ] Create `src/components/chat/types.ts`
- [ ] Define ChatRole, ChatMessage interfaces
- [ ] Map to existing `core/types.ts` types
- [ ] Export utility type guards (isUserMessage, etc.)

**Files:**
- `react/src/components/chat/types.ts` - NEW

**Type Structure:**
```typescript
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  sender?: string;
  messageId?: string;
  replyToMessageId?: string;
  meta?: {
    streaming?: boolean;
    toolName?: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

// Type guards
export function isUserMessage(msg: ChatMessage): boolean;
export function isAssistantMessage(msg: ChatMessage): boolean;
export function isSystemMessage(msg: ChatMessage): boolean;
export function isToolMessage(msg: ChatMessage): boolean;
```

**Acceptance:**
- Full TypeScript coverage, no `any` types
- Compatible with AgentMessage from core
- Type guards for role checking

---

## Phase 2: Core Message Components (Day 1 - Afternoon)
**Goal:** Build fundamental message display components

### Task 2.1: ChatMessageBubble Component
- [ ] Create message bubble with role-based styling
- [ ] Add timestamp display
- [ ] Support basic text content
- [ ] Add sender name display
- [ ] Implement React.memo for performance

**Files:**
- `react/src/components/chat/chat-message-bubble.tsx` - NEW

**Component API:**
```typescript
interface ChatMessageBubbleProps {
  message: ChatMessage;
  showTimestamp?: boolean;
  showSender?: boolean;
  allMessages?: ChatMessage[]; // For threading context
}

export const ChatMessageBubble = React.memo<ChatMessageBubbleProps>(
  ({ message, showTimestamp = true, showSender = true }) => {
    // Implementation
  }
);
```

**Styling Strategy:**
- User messages: Right-aligned, `bg-message-user-bg text-message-user-fg`
- Assistant messages: Left-aligned, `bg-message-assistant-bg text-message-assistant-fg`
- System messages: Centered, `bg-message-system-bg text-message-system-fg italic`
- Tool messages: Left-aligned, `bg-message-tool-bg text-message-tool-fg text-xs`

**Acceptance:**
- User messages: right-aligned, primary color
- Assistant messages: left-aligned, secondary color
- System messages: centered, muted style
- Tool messages: left-aligned, accent color
- React.memo prevents unnecessary re-renders

---

### Task 2.2: ChatTypingIndicator Component
- [ ] Create animated typing indicator
- [ ] Add customizable message text
- [ ] CSS-only animation (no JS)
- [ ] Add ARIA live region

**Files:**
- `react/src/components/chat/chat-typing-indicator.tsx` - NEW

**Component API:**
```typescript
interface ChatTypingIndicatorProps {
  message?: string;
  className?: string;
}

export function ChatTypingIndicator({
  message = "Assistant is thinking",
  className,
}: ChatTypingIndicatorProps) {
  // Implementation
}
```

**Animation:**
```tsx
<div className="flex items-center gap-1">
  <span>{message}</span>
  <span className="flex gap-1">
    <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
    <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
    <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
  </span>
</div>
```

**Acceptance:**
- 3-dot bounce animation
- Matches assistant message styling
- Accessible (aria-live="polite", role="status")

---

### Task 2.3: ChatMessageList Component
- [ ] Create scrollable message container
- [ ] Implement auto-scroll to bottom
- [ ] Add empty state
- [ ] Handle loading state
- [ ] Optimize for 100+ messages

**Files:**
- `react/src/components/chat/chat-message-list.tsx` - NEW

**Component API:**
```typescript
interface ChatMessageListProps {
  messages: ChatMessage[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function ChatMessageList({
  messages,
  loading,
  emptyMessage = "No messages yet. Start a conversation!",
  className,
}: ChatMessageListProps) {
  // Implementation with auto-scroll
}
```

**Auto-scroll Logic:**
```typescript
const messagesEndRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);
```

**Acceptance:**
- Smooth auto-scroll on new messages
- Maintains scroll position when viewing history
- Empty state shows helpful message
- Handles 100+ messages without lag
- role="log" for accessibility

---

## Phase 3: Input & Interaction (Day 2 - Morning)
**Goal:** Enable message sending and user interaction

### Task 3.1: ChatInput Component
- [ ] Multi-line textarea with auto-resize
- [ ] Send button with loading states
- [ ] Enter to send, Shift+Enter for newline
- [ ] Disable during send/disconnect

**Files:**
- `react/src/components/chat/chat-input.tsx` - NEW

**Component API:**
```typescript
interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  maxRows?: number;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "Send a message...",
  maxRows = 5,
}: ChatInputProps) {
  // Implementation
}
```

**Keyboard Handling:**
```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    onSubmit();
  }
};
```

**Acceptance:**
- Textarea grows up to 5 rows (configurable)
- Enter sends, Shift+Enter adds newline
- Disabled state visually clear
- Focus management works correctly
- Send button shows loading state

---

### Task 3.2: ChatThread Component
- [ ] Combine message list + typing indicator + input
- [ ] Add thread header
- [ ] Manage scroll behavior
- [ ] Handle streaming state

**Files:**
- `react/src/components/chat/chat-thread.tsx` - NEW

**Component API:**
```typescript
interface ChatThreadProps {
  worldId: string;
  selectedAgent?: Agent | null;
  messages: ChatMessage[];
  streaming?: boolean;
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

export function ChatThread({
  worldId,
  selectedAgent,
  messages,
  streaming = false,
  onSendMessage,
  disabled = false,
}: ChatThreadProps) {
  // Implementation combining all sub-components
}
```

**Layout:**
```tsx
<div className="flex h-full flex-col">
  {/* Header */}
  <div className="border-b border-border px-4 py-3">
    <h2 className="text-sm font-semibold">
      {selectedAgent ? selectedAgent.name : 'All Agents'}
    </h2>
  </div>
  
  {/* Messages */}
  <ChatMessageList messages={messages} className="flex-1" />
  
  {/* Typing Indicator */}
  {streaming && (
    <div className="px-4 py-2">
      <ChatTypingIndicator />
    </div>
  )}
  
  {/* Input */}
  <div className="border-t border-border bg-card px-4 py-3">
    <ChatInput
      value={draft}
      onChange={setDraft}
      onSubmit={handleSend}
      disabled={disabled || streaming}
    />
  </div>
</div>
```

**Acceptance:**
- Shows typing indicator when streaming
- Input area always visible (sticky bottom)
- Header shows world/agent context
- Smooth transitions between states

---

## Phase 4: Event Integration (Day 2 - Afternoon)
**Goal:** Connect to World event system

### Task 4.1: useWorldEvents Hook
- [ ] Subscribe to EventType.MESSAGE
- [ ] Subscribe to EventType.SSE
- [ ] Handle event deduplication
- [ ] Cleanup on unmount

**Files:**
- `react/src/components/chat/hooks/use-world-events.ts` - NEW

**Hook API:**
```typescript
interface UseWorldEventsOptions {
  worldId: string;
  agentFilter?: string | null;
}

interface UseWorldEventsReturn {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
}

export function useWorldEvents({
  worldId,
  agentFilter,
}: UseWorldEventsOptions): UseWorldEventsReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Get world instance
    // Subscribe to events
    // Return cleanup function
  }, [worldId]);
  
  return { messages, streaming, error };
}
```

**Deduplication Strategy:**
```typescript
const seenMessageIds = useRef(new Set<string>());

const handleMessageEvent = (event: WorldMessageEvent) => {
  if (event.messageId && seenMessageIds.current.has(event.messageId)) {
    return; // Skip duplicate
  }
  
  if (event.messageId) {
    seenMessageIds.current.add(event.messageId);
  }
  
  setMessages(prev => [...prev, convertToMessage(event)]);
};
```

**Acceptance:**
- No duplicate messages from multi-agent scenarios
- Streaming updates appear in real-time
- Cleanup prevents memory leaks
- Error states handled gracefully

---

### Task 4.2: useMessageState Hook
- [ ] Manage message CRUD operations
- [ ] Optimistic UI updates
- [ ] Error handling and rollback
- [ ] Edit/delete state machine

**Files:**
- `react/src/components/chat/hooks/use-message-state.ts` - NEW

**Hook API:**
```typescript
interface UseMessageStateOptions {
  worldId: string;
  initialMessages?: ChatMessage[];
}

interface UseMessageStateReturn {
  messages: ChatMessage[];
  sendMessage: (content: string) => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  editingId: string | null;
  deletingId: string | null;
  errors: Map<string, string>;
}

export function useMessageState({
  worldId,
  initialMessages = [],
}: UseMessageStateOptions): UseMessageStateReturn {
  // State machine implementation
}
```

**State Machine:**
```typescript
type MessageAction =
  | { type: 'SEND'; content: string }
  | { type: 'SEND_SUCCESS'; message: ChatMessage }
  | { type: 'SEND_ERROR'; error: string }
  | { type: 'EDIT_START'; messageId: string }
  | { type: 'EDIT_SUCCESS'; messageId: string; content: string }
  | { type: 'EDIT_ERROR'; messageId: string; error: string }
  | { type: 'DELETE_START'; messageId: string }
  | { type: 'DELETE_SUCCESS'; messageId: string }
  | { type: 'DELETE_ERROR'; messageId: string; error: string };
```

**Acceptance:**
- Optimistic add shows immediately
- Rollback on send failure
- Edit state transitions work correctly
- Delete removes message + updates UI
- Error messages displayed to user

---

## Phase 5: Layout & Integration (Day 3 - Morning)
**Goal:** Integrate components into WorldPage

### Task 5.1: Replace StreamChatBox in WorldPage
- [ ] Remove existing StreamChatBox component
- [ ] Import ChatThread from new system
- [ ] Wire up event hooks
- [ ] Test agent filtering
- [ ] Verify WebSocket integration

**Files:**
- `react/src/pages/WorldPage.tsx` - MODIFY
- `react/src/components/StreamChatBox.tsx` - DEPRECATE (optional: keep for reference)

**Changes:**
```tsx
// Before
import StreamChatBox from '@/components/StreamChatBox.tsx';

<StreamChatBox
  messages={messages}
  selectedAgent={selectedAgent}
  message={message}
  setMessage={setMessage}
  onSendMessage={handleSendMessage}
  sending={sending}
  connectionState={connectionState}
/>

// After
import { ChatThread } from '@/components/chat/chat-thread';
import { useWorldEvents } from '@/components/chat/hooks/use-world-events';

const { messages, streaming } = useWorldEvents({
  worldId: worldId!,
  agentFilter: selectedAgent?.id,
});

<ChatThread
  worldId={worldId!}
  selectedAgent={selectedAgent}
  messages={messages}
  streaming={streaming}
  onSendMessage={sendMessage}
  disabled={connectionState !== 'connected'}
/>
```

**Acceptance:**
- Chat works identically to before
- No regression in functionality
- Performance equal or better
- Agent filtering still works
- WebSocket reconnection handled

---

### Task 5.2: ChatSidebar Component (Agent List)
- [ ] Extract agent list from WorldPage sidebar
- [ ] Style as chat component
- [ ] Add agent avatars/initials
- [ ] Show online/activity status (optional)

**Files:**
- `react/src/components/chat/chat-sidebar.tsx` - NEW

**Component API:**
```typescript
interface ChatSidebarProps {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent | null) => void;
  onCreateAgent: () => void;
}

export function ChatSidebar({
  agents,
  selectedAgent,
  onSelectAgent,
  onCreateAgent,
}: ChatSidebarProps) {
  // Implementation
}
```

**Layout:**
```tsx
<aside className="flex w-64 flex-col border-r border-border bg-card">
  <div className="flex items-center justify-between p-4">
    <h2 className="font-semibold text-sm">Agents</h2>
    <button onClick={onCreateAgent}>+ Add</button>
  </div>
  
  <div className="flex-1 overflow-y-auto p-2">
    <button
      onClick={() => onSelectAgent(null)}
      className={selectedAgent === null ? 'bg-accent' : ''}
    >
      All Agents
    </button>
    
    {agents.map((agent) => (
      <AgentListItem
        key={agent.id}
        agent={agent}
        selected={selectedAgent?.id === agent.id}
        onClick={() => onSelectAgent(agent)}
      />
    ))}
  </div>
</aside>
```

**Acceptance:**
- Shows all world agents
- Click selects agent for filtering
- Visual indicator for selected agent
- Scrollable for many agents
- Avatar initials generated from name

---

## Phase 6: Enhancement Features (Day 3 - Afternoon)
**Goal:** Add nice-to-have features

### Task 6.1: Markdown Rendering
- [ ] Install/verify react-markdown + remark-gfm
- [ ] Add rehype-sanitize for security
- [ ] Configure allowed HTML tags
- [ ] Add code syntax highlighting (optional)

**Files:**
- `react/src/components/chat/chat-message-bubble.tsx` - MODIFY
- `react/package.json` - ADD dependencies (if not present)

**Dependencies:**
```json
{
  "react-markdown": "^10.1.0",
  "remark-gfm": "^4.0.1",
  "rehype-sanitize": "^6.0.0"
}
```

**Implementation:**
```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeSanitize]}
  components={{
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline hover:text-primary/80"
      >
        {children}
      </a>
    ),
    code: ({ inline, children, ...props }) =>
      inline ? (
        <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
          {children}
        </code>
      ) : (
        <pre className="bg-muted p-2 rounded overflow-x-auto">
          <code {...props}>{children}</code>
        </pre>
      ),
  }}
>
  {message.content}
</ReactMarkdown>
```

**Acceptance:**
- Markdown renders correctly (bold, italic, links, lists, code)
- XSS protection enabled via rehype-sanitize
- Links open in new tab with rel="noopener noreferrer"
- Code blocks formatted with syntax preservation
- No raw HTML allowed

---

### Task 6.2: ChatToolBadge Component
- [ ] Display tool_calls from AgentMessage
- [ ] Show tool name and status
- [ ] Expandable result view (optional)
- [ ] Visual hierarchy (less prominent)

**Files:**
- `react/src/components/chat/chat-tool-badge.tsx` - NEW

**Component API:**
```typescript
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatToolBadgeProps {
  toolCalls: ToolCall[];
  expandable?: boolean;
}

export function ChatToolBadge({
  toolCalls,
  expandable = false,
}: ChatToolBadgeProps) {
  // Implementation
}
```

**Visual Design:**
```tsx
<div className="mt-2 space-y-1">
  {toolCalls.map((tc) => (
    <div
      key={tc.id}
      className="flex items-center gap-2 text-xs text-muted-foreground bg-message-tool-bg px-2 py-1 rounded"
    >
      <span className="font-mono">🔧 {tc.function.name}</span>
      {expandable && (
        <button className="ml-auto text-xs">View</button>
      )}
    </div>
  ))}
</div>
```

**Acceptance:**
- Tool calls visible in assistant messages
- Click expands result (if implemented)
- Clear visual distinction from main content
- Handles multiple tool calls per message
- Tool name extracted and displayed

---

## Phase 7: Threading & Replies (Day 4)
**Goal:** Support message threading

### Task 7.1: ChatThreadIndicator Component
- [ ] Show "replying to" badge
- [ ] Display parent message excerpt
- [ ] Click scrolls to parent (optional)
- [ ] Visual connection line (optional)

**Files:**
- `react/src/components/chat/chat-thread-indicator.tsx` - NEW

**Component API:**
```typescript
interface ChatThreadIndicatorProps {
  parentMessage: ChatMessage;
  onParentClick?: () => void;
}

export function ChatThreadIndicator({
  parentMessage,
  onParentClick,
}: ChatThreadIndicatorProps) {
  // Implementation
}
```

**Visual Design:**
```tsx
<div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
  <span>↪</span>
  <span>Replying to {parentMessage.sender}:</span>
  <button
    onClick={onParentClick}
    className="truncate italic hover:underline max-w-[200px]"
  >
    "{parentMessage.content.substring(0, 50)}..."
  </button>
</div>
```

**Acceptance:**
- Visible when replyToMessageId exists
- Shows parent sender + preview (50 chars)
- Doesn't clutter bubble design
- Works with all message types
- Optional click handler for scroll

---

### Task 7.2: Thread Context in ChatMessageBubble
- [ ] Pass allMessages for parent lookup
- [ ] Integrate ChatThreadIndicator
- [ ] Update message bubble layout
- [ ] Test with nested threads

**Files:**
- `react/src/components/chat/chat-message-bubble.tsx` - MODIFY

**Changes:**
```tsx
export const ChatMessageBubble = React.memo<ChatMessageBubbleProps>(
  ({ message, showTimestamp, showSender, allMessages }) => {
    const parentMessage = allMessages?.find(
      (m) => m.messageId === message.replyToMessageId
    );
    
    return (
      <div className="message-wrapper">
        {parentMessage && (
          <ChatThreadIndicator parentMessage={parentMessage} />
        )}
        
        <div className="message-bubble">
          {/* Existing bubble content */}
        </div>
      </div>
    );
  }
);
```

**Acceptance:**
- Threading displays correctly
- No performance impact (memoization)
- Handles missing parents gracefully
- Multi-level threads work
- Visual hierarchy clear

---

## Phase 8: Accessibility & Polish (Day 5 - Morning)
**Goal:** Ensure WCAG 2.1 AA compliance

### Task 8.1: ARIA Annotations
- [ ] Add role="log" to message list
- [ ] Add role="status" to typing indicator
- [ ] Add aria-label to all interactive elements
- [ ] Test with screen reader (VoiceOver/NVDA)

**Files:**
- All chat components - MODIFY

**Required ARIA:**
```tsx
// ChatMessageList
<div role="log" aria-live="polite" aria-label="Chat messages">
  {/* Messages */}
</div>

// ChatTypingIndicator
<div role="status" aria-live="polite" aria-label="Assistant is typing">
  {/* Indicator */}
</div>

// ChatInput
<textarea
  aria-label="Message input"
  aria-describedby="input-help"
/>
<button
  aria-label="Send message"
  aria-disabled={disabled}
>
  Send
</button>
```

**Acceptance:**
- Screen reader announces new messages
- All buttons have accessible names
- Keyboard navigation works fully
- Focus visible on all interactive elements
- Live regions don't over-announce

---

### Task 8.2: Keyboard Navigation
- [ ] Arrow keys navigate messages (optional)
- [ ] Tab order is logical
- [ ] Enter/Esc shortcuts work
- [ ] Focus returns to input after send

**Files:**
- `react/src/components/chat/chat-thread.tsx` - MODIFY
- `react/src/components/chat/chat-input.tsx` - MODIFY

**Keyboard Shortcuts:**
- `Enter` (input focused): Send message
- `Shift+Enter` (input focused): New line
- `Esc` (input focused): Clear input
- `Tab`: Navigate through interactive elements
- `Shift+Tab`: Navigate backwards

**Implementation:**
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && document.activeElement === inputRef.current) {
      setDraft('');
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);

// Focus input after send
const handleSend = async () => {
  await onSendMessage(draft);
  setDraft('');
  inputRef.current?.focus();
};
```

**Acceptance:**
- Tab moves through interactive elements
- Enter sends message (input focused)
- Esc clears input or cancels edit
- Focus management is smooth
- No keyboard traps

---

### Task 8.3: Visual Polish
- [ ] Smooth animations for new messages
- [ ] Loading states for all async operations
- [ ] Error states with retry buttons
- [ ] Empty states with helpful CTAs

**Files:**
- All chat components - MODIFY

**Animations:**
```css
/* Message entrance */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-enter {
  animation: slideIn 0.2s ease-out;
}
```

**Error State:**
```tsx
{error && (
  <div className="bg-red-100 border border-red-300 rounded-lg p-3 mb-2">
    <p className="text-sm text-red-800">{error}</p>
    <button
      onClick={retry}
      className="text-xs text-red-600 underline mt-1"
    >
      Retry
    </button>
  </div>
)}
```

**Acceptance:**
- Transitions feel smooth (no jank)
- Loading states prevent confusion
- Errors give actionable feedback
- Empty states guide users
- Animations respect prefers-reduced-motion

---

## Phase 9: Testing & Documentation (Day 5 - Afternoon)
**Goal:** Ensure quality and maintainability

### Task 9.1: Unit Tests
- [ ] Test message bubble rendering
- [ ] Test input validation
- [ ] Test event hook subscriptions
- [ ] Test state management hook

**Files:**
- `react/src/components/chat/__tests__/` - NEW directory
- `react/src/components/chat/__tests__/chat-message-bubble.test.tsx` - NEW
- `react/src/components/chat/__tests__/chat-input.test.tsx` - NEW
- `react/src/components/chat/__tests__/use-world-events.test.tsx` - NEW
- `react/src/components/chat/__tests__/use-message-state.test.tsx` - NEW

**Test Examples:**
```typescript
// chat-message-bubble.test.tsx
describe('ChatMessageBubble', () => {
  it('renders user message with correct styling', () => {
    const message = { id: '1', role: 'user', content: 'Hello' };
    render(<ChatMessageBubble message={message} />);
    expect(screen.getByText('Hello')).toHaveClass('bg-message-user-bg');
  });
  
  it('shows thread indicator when replyToMessageId exists', () => {
    const parent = { id: '1', role: 'user', content: 'Question' };
    const reply = {
      id: '2',
      role: 'assistant',
      content: 'Answer',
      replyToMessageId: '1',
    };
    render(
      <ChatMessageBubble message={reply} allMessages={[parent, reply]} />
    );
    expect(screen.getByText(/Replying to/)).toBeInTheDocument();
  });
});
```

**Coverage Target:** >80% for core components

---

### Task 9.2: Integration Tests
- [ ] Test full chat flow (send → receive)
- [ ] Test agent filtering
- [ ] Test WebSocket reconnection
- [ ] Test message editing/deletion

**Files:**
- `react/src/components/chat/__tests__/integration.test.tsx` - NEW

**Test Scenarios:**
```typescript
describe('Chat Integration', () => {
  it('sends message and receives response', async () => {
    const { user } = setup();
    
    await user.type(screen.getByRole('textbox'), 'Hello agent');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    
    expect(screen.getByText('Hello agent')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText(/Assistant is thinking/)).toBeInTheDocument();
    });
  });
  
  it('filters messages by selected agent', async () => {
    const { user } = setup();
    
    await user.click(screen.getByText('Agent 1'));
    
    expect(screen.queryByText('Agent 2 message')).not.toBeInTheDocument();
    expect(screen.getByText('Agent 1 message')).toBeInTheDocument();
  });
});
```

**Acceptance:**
- E2E scenarios pass
- Error scenarios handled
- No console warnings
- Performance acceptable

---

### Task 9.3: Documentation
- [ ] Add JSDoc to all components
- [ ] Document props and usage
- [ ] Create usage examples
- [ ] Update component README

**Files:**
- Component files - ADD JSDoc comments
- `react/src/components/chat/README.md` - NEW

**JSDoc Example:**
```typescript
/**
 * ChatMessageBubble - Displays a single message with role-based styling
 * 
 * @component
 * @example
 * ```tsx
 * <ChatMessageBubble
 *   message={{ id: '1', role: 'user', content: 'Hello' }}
 *   showTimestamp={true}
 *   showSender={true}
 * />
 * ```
 * 
 * @param {ChatMessageBubbleProps} props - Component props
 * @param {ChatMessage} props.message - Message object to display
 * @param {boolean} [props.showTimestamp=true] - Show message timestamp
 * @param {boolean} [props.showSender=true] - Show sender name
 * @param {ChatMessage[]} [props.allMessages] - All messages for thread context
 */
export const ChatMessageBubble = React.memo<ChatMessageBubbleProps>(...);
```

**README Structure:**
```markdown
# Chat Components

Modular chat UI components for Agent World.

## Components

- ChatMessageBubble - Individual message display
- ChatMessageList - Scrollable message container
- ChatInput - Message input with send button
- ChatThread - Complete chat interface
- ChatTypingIndicator - Streaming indicator
- ChatToolBadge - Tool call display
- ChatThreadIndicator - Reply visualization

## Usage

### Basic Chat Thread

\`\`\`tsx
import { ChatThread } from '@/components/chat/chat-thread';

<ChatThread
  worldId={worldId}
  messages={messages}
  onSendMessage={handleSend}
/>
\`\`\`

## Theming

Customize via Tailwind tokens in `tailwind.config.js`...
```

**Acceptance:**
- All public APIs documented
- Usage examples clear and runnable
- Props table complete
- README provides quick start

---

## Implementation Checklist Summary

### ✅ Phase 1 (Day 1 AM): Foundation
- [ ] Design tokens in tailwind.config.js
- [ ] CSS variables in globals.css
- [ ] TypeScript types.ts

### ✅ Phase 2 (Day 1 PM): Core Components
- [ ] ChatMessageBubble
- [ ] ChatTypingIndicator
- [ ] ChatMessageList

### ✅ Phase 3 (Day 2 AM): Interaction
- [ ] ChatInput
- [ ] ChatThread

### ✅ Phase 4 (Day 2 PM): Events
- [ ] useWorldEvents hook
- [ ] useMessageState hook

### ✅ Phase 5 (Day 3 AM): Integration
- [ ] Replace StreamChatBox in WorldPage
- [ ] ChatSidebar component

### ✅ Phase 6 (Day 3 PM): Enhancements
- [ ] Markdown rendering
- [ ] ChatToolBadge

### ✅ Phase 7 (Day 4): Threading
- [ ] ChatThreadIndicator
- [ ] Thread integration

### ✅ Phase 8 (Day 5 AM): Polish
- [ ] ARIA annotations
- [ ] Keyboard navigation
- [ ] Visual polish

### ✅ Phase 9 (Day 5 PM): Quality
- [ ] Unit tests
- [ ] Integration tests
- [ ] Documentation

---

## Risk Mitigation

### Risk 1: Performance with Large Message Counts
**Likelihood:** Medium  
**Impact:** High  
**Mitigation:**
- Implement React.memo early on ChatMessageBubble
- Test with 500+ messages during Phase 2
- Monitor render count with React DevTools

**Fallback:** Add react-window virtualization in Phase 10 (post-MVP)

---

### Risk 2: WebSocket Event Deduplication
**Likelihood:** High (multi-agent scenarios)  
**Impact:** Medium  
**Mitigation:**
- Use messageId for dedup Map in Phase 4
- Test with multiple agents responding simultaneously
- Log duplicate detection for monitoring

**Fallback:** Implement server-side dedup if client-side proves insufficient

---

### Risk 3: Markdown XSS Vulnerability
**Likelihood:** Medium  
**Impact:** Critical  
**Mitigation:**
- Use rehype-sanitize from Phase 6 start
- Test with known XSS payloads
- Disable raw HTML entirely
- Regular security audits

**Fallback:** Disable markdown, use plain text only

---

### Risk 4: Threading Complexity
**Likelihood:** Medium  
**Impact:** Medium  
**Mitigation:**
- Start simple in Phase 7 (just show parent)
- Defer nested thread UI to v2
- Keep data structure flexible

**Fallback:** Hide threading UI if performance issues arise, keep replyToMessageId in data

---

### Risk 5: Accessibility Compliance
**Likelihood:** Low  
**Impact:** High  
**Mitigation:**
- Build accessibility into Phase 8 (not afterthought)
- Test with screen readers throughout
- Use semantic HTML from start

**Fallback:** Dedicated accessibility sprint if audit fails

---

## Success Criteria

**Phase Completion:**
- [ ] All tasks in phase checked off
- [ ] Phase acceptance criteria met
- [ ] No blocking bugs introduced
- [ ] Tests passing (if applicable)

**Overall Project Success:**
- [ ] Chat system fully integrated into WorldPage
- [ ] All existing functionality preserved
- [ ] Performance: <100ms render for 100 messages
- [ ] Accessibility: Passes WCAG 2.1 AA automated scan
- [ ] Test coverage: >80% for core components
- [ ] Documentation: README + JSDoc complete
- [ ] User feedback: No major usability issues

---

## Post-MVP Enhancements (Phase 10+)

**Not in scope for initial implementation, but documented for future:**

1. **Message Virtualization** - For 1000+ message conversations
2. **Rich Media Support** - Images, files, voice messages
3. **Message Reactions** - Emoji reactions, upvote/downvote
4. **Advanced Threading** - Nested thread UI, thread summaries
5. **Search & Filter** - Full-text search, date range filters
6. **Message Pinning** - Pin important messages to top
7. **Draft Persistence** - Save unsent messages to localStorage
8. **Typing Indicators** - Show who's typing in real-time
9. **Read Receipts** - Show message read status
10. **Mobile Optimization** - Swipe gestures, mobile-specific UI

---

**Ready for Implementation:** ✅  
**Estimated Duration:** 3-5 days  
**Next Step:** Begin Phase 1 - Foundation & Design Tokens
