# Chat Design System Components

Modular, reusable chat UI components for Agent World built with React 19, TailwindCSS 4, and TypeScript.

## Overview

This chat design system provides production-ready components for building AI chat, messaging, or support applications. Components are designed to work independently or together, with full TypeScript support and WCAG 2.1 accessibility compliance.

## Components

### ChatThread
Complete chat interface combining all sub-components. Use this for a full-featured chat experience.

```tsx
import { ChatThread } from '@/components/chat';

<ChatThread
  worldId={worldId}
  selectedAgent={selectedAgent}
  messages={messages}
  streaming={false}
  onSendMessage={handleSend}
  disabled={connectionState !== 'connected'}
/>
```

### ChatMessageBubble
Individual message display with role-based styling.

```tsx
import { ChatMessageBubble } from '@/components/chat';

<ChatMessageBubble
  message={{ id: '1', role: 'user', content: 'Hello', createdAt: new Date().toISOString() }}
  showTimestamp={true}
  showSender={true}
/>
```

**Message Roles:**
- `user` - Right-aligned, primary color
- `assistant` - Left-aligned, secondary color
- `system` - Centered, muted style with dashed border
- `tool` - Left-aligned, accent color, smaller text

### ChatMessageList
Scrollable message history container with auto-scroll.

```tsx
import { ChatMessageList } from '@/components/chat';

<ChatMessageList
  messages={messages}
  loading={false}
  emptyMessage="No messages yet. Start a conversation!"
/>
```

### ChatInput
Multi-line message input with send button.

```tsx
import { ChatInput } from '@/components/chat';

<ChatInput
  value={draft}
  onChange={setDraft}
  onSubmit={handleSend}
  disabled={sending}
  placeholder="Send a message..."
/>
```

**Keyboard Shortcuts:**
- `Enter` - Send message
- `Shift+Enter` - New line
- Auto-resizes up to 5 rows

### ChatTypingIndicator
Animated "thinking" indicator for streaming responses.

```tsx
import { ChatTypingIndicator } from '@/components/chat';

<ChatTypingIndicator message="Assistant is thinking..." />
```

## Utilities

### Message Conversion

Convert between app `Message` and `ChatMessage` formats:

```tsx
import { messageToChatMessage, messagesToChatMessages } from '@/components/chat';

// Single message
const chatMsg = messageToChatMessage(appMessage);

// Array of messages
const chatMsgs = messagesToChatMessages(appMessages);
```

## Type Guards

```tsx
import {
  isUserMessage,
  isAssistantMessage,
  isSystemMessage,
  isToolMessage,
  hasToolCalls,
  isReplyMessage,
  isStreamingMessage,
} from '@/components/chat';

if (isUserMessage(message)) {
  // Handle user message
}
```

## Theming

### Tailwind Tokens

Customize via `tailwind.config.js`:

```javascript
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
  borderRadius: {
    bubble: "var(--radius-bubble)",
  },
}
```

### CSS Variables

Add to `globals.css`:

```css
:root {
  --radius-bubble: 1rem;
}
```

## Accessibility

All components are WCAG 2.1 AA compliant:

- **ARIA roles**: `role="log"` for message list, `role="status"` for indicators
- **Live regions**: Screen reader announcements for new messages
- **Keyboard navigation**: Tab, Enter, Escape shortcuts
- **Focus management**: Visual focus indicators on all interactive elements

## Integration Example

Full integration in `WorldPage`:

```tsx
import { ChatThread, messagesToChatMessages } from '@/components/chat';
import { useChatData } from '@/hooks/useChatData';

function WorldPage() {
  const { messages, sendMessage } = useChatData(worldId);
  const [sending, setSending] = useState(false);

  const handleSend = async (content: string) => {
    setSending(true);
    try {
      await sendMessage(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <ChatThread
      worldId={worldId}
      messages={messagesToChatMessages(messages)}
      streaming={sending}
      onSendMessage={handleSend}
    />
  );
}
```

## File Structure

```
src/components/chat/
├── chat-message-bubble.tsx   # Individual message display
├── chat-message-list.tsx     # Message scroll container
├── chat-input.tsx            # Input with send button
├── chat-typing-indicator.tsx # Streaming indicator
├── chat-thread.tsx           # Complete chat interface
├── types.ts                  # TypeScript definitions
├── utils.ts                  # Conversion utilities
├── index.ts                  # Main exports
└── README.md                 # This file
```

## Performance

- **React.memo**: Message bubbles memoized to prevent re-renders
- **Auto-scroll**: Efficient ref-based scrolling on new messages
- **Optimized**: Handles 100+ messages without lag

## Future Enhancements

See `.docs/plans/2025-11-04/plan-chat-design-system.md` for planned features:

- Phase 6: Markdown rendering with security
- Phase 7: Message threading/replies
- Phase 8: Enhanced accessibility
- Phase 9: Comprehensive testing

## Related Documentation

- [Requirement Doc](../../../.docs/reqs/2025-11-04/req-chat-design-system.md)
- [Architecture Plan](../../../.docs/plans/2025-11-04/plan-chat-design-system.md)
