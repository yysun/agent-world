# Requirement: Electron App Tool Streaming Display

**Date**: 2026-02-10  
**Type**: Feature Enhancement  
**Status**: ✅ Requirements Reviewed  
**Related**:  
- [Multi-Client Tool Streaming](../../done/2026-02-08/multi-client-tool-streaming.md)
- [Electron Stream Display Plan](../../plans/2026-02-10/plan-electron-stream-display.md)
- [Shell Streaming Requirements](../2026-02-08/req-shell-streaming.md)

---

## 🔍 Architecture Review (AR)

**Review Date**: 2026-02-10  
**Reviewer**: AI Assistant  
**Result**: ✅ **APPROVED** - Ready for implementation

### Review Summary

The requirements are **complete, feasible, and well-structured**. The implementation can leverage existing patterns from the React client and reuse the Electron app's streaming state infrastructure with minimal modifications.

### ✅ Strengths

1. **Clear Scope**: Requirements are specific and measurable with concrete acceptance criteria
2. **Proven Pattern**: React client implementation provides a working reference
3. **Infrastructure Ready**: Streaming state manager and SSE forwarding already exist
4. **Consistent Design**: Maintains cross-client UX consistency (Web, React, Electron)
5. **Well Constrained**: Clear boundaries prevent scope creep

### ⚠️ Considerations & Recommendations

#### 1. Streaming State Extension Pattern

**Current State**: `streaming-state.js` handles text streaming with `handleStart/Chunk/End/Error`

**Recommendation**: Add parallel tool streaming methods to avoid mixing concerns:
```javascript
// Option A: Extend existing methods with type flag
handleStart(messageId, agentName, streamingType = 'text')

// Option B: Add dedicated tool streaming methods (RECOMMENDED)
handleToolStreamStart(messageId, agentName, streamType)
handleToolStreamChunk(messageId, content, streamType)
handleToolStreamEnd(messageId)
```

**Rationale**: Option B provides better separation, easier testing, and clearer semantics.

#### 2. Message State Flags

**Requirement**: Messages need both `isStreaming` (text) and `isToolStreaming` flags

**Recommendation**: Ensure these are mutually exclusive or clearly documented:
- A message can be text-streaming OR tool-streaming, never both simultaneously
- State transitions: `null → isStreaming → done` OR `null → isToolStreaming → done`

**Example State Structure**:
```javascript
{
  messageId: '123',
  content: 'output',
  isStreaming: false,
  isToolStreaming: true,  // Currently streaming tool output
  streamType: 'stdout'     // Present only when isToolStreaming
}
```

#### 3. Event Routing in App.jsx

**Current Code**: `App.jsx` already handles `payload.type === 'sse'` events

**Implementation Path**:
```javascript
if (eventType === 'tool-stream') {
  streaming.handleToolStreamChunk(messageId, streamPayload.content, streamPayload.stream);
}
```

**Minimal changeset** — only adds one conditional branch.

#### 4. Visual Rendering Approach

**Option A**: Inline conditional in message rendering (matches React client)
```jsx
{message.isToolStreaming ? (
  <div className="tool-output">
    <div className="tool-header">⚙️ Executing...</div>
    <pre className={streamType === 'stderr' ? 'stderr' : 'stdout'}>
      {message.content || '(waiting for output...)'}
    </pre>
  </div>
) : (
  <div className="message-content">{message.content}</div>
)}
```

**Option B**: Separate component
```jsx
{message.isToolStreaming ? 
  <ToolStreamingOutput message={message} /> : 
  <MessageContent message={message} />}
```

**Recommendation**: Use **Option A** for consistency with React client and simpler maintenance.

#### 5. Styling with Inline vs. Tailwind Classes

**Current Electron App**: Uses inline styles and Tailwind classes

**Recommendation**: Match existing patterns in `App.jsx`:
```jsx
// For stdout
style={{
  backgroundColor: 'rgb(15 23 42)', // slate-900
  borderColor: 'rgb(51 65 85)',     // slate-700
  color: 'rgb(203 213 225)'         // slate-300
}}

// For stderr
style={{
  backgroundColor: 'rgba(69 10 10 / 0.3)', // red-950/30
  borderColor: 'rgba(239 68 68 / 0.3)',    // red-500/30
  color: 'rgb(248 113 113)'                // red-400
}}
```

This ensures theme compatibility without additional CSS files.

#### 6. Performance Considerations

**Large Output Handling**: REQ-19 mentions ">100KB" outputs

**Recommendations**:
- **Content Truncation**: Consider showing last N lines (e.g., 500) with "Show Full Output" button
- **Virtual Scrolling**: For extremely large outputs, consider a virtualized list (overkill for MVP)
- **MVP Approach**: Trust React's efficient reconciliation; profile if issues arise

**Suggested Addition to Requirements**:
```markdown
- REQ-20: Tool output exceeding 50,000 characters shall display a warning: 
  "⚠️ Large output truncated. Showing last 50,000 chars."
```

#### 7. Testing Strategy

**Existing Tests**: 27 tests in `streaming-state.test.ts` for text streaming

**Recommended Test Additions**:
```javascript
describe('Tool Streaming', () => {
  it('should handle tool-stream start event')
  it('should accumulate tool stream chunks')
  it('should distinguish stdout from stderr')
  it('should handle mixed stdout/stderr streams')
  it('should clear tool streaming on message complete')
  it('should debounce tool stream updates at 16ms')
  it('should handle tool streaming errors')
  it('should not interfere with text streaming')
})
```

**Estimated**: 8-10 new test cases

### 🎯 Implementation Feasibility

| Aspect | Status | Notes |
|--------|--------|-------|
| **Backend Events** | ✅ Ready | `tool-stream` events already emitted via SSE |
| **IPC Forwarding** | ✅ Ready | Main process forwards all SSE events |
| **State Management** | 🟡 Minor Extension | Add tool streaming methods to `streaming-state.js` |
| **UI Rendering** | 🟡 Minor Addition | Add conditional rendering in `App.jsx` |
| **Styling** | ✅ Ready | Can use inline styles matching Tailwind colors |
| **Testing** | 🟡 New Tests Needed | Add ~8 tests for tool streaming |

**Overall Assessment**: **Low complexity, high confidence**

### 🔄 Alternative Approaches

#### Alternative 1: Reuse Text Streaming Path
**Concept**: Treat tool output as regular text streaming with a flag

**Pros**: Minimal code changes  
**Cons**: Mixing concerns, harder to style differently

**Verdict**: ❌ Not recommended - visual distinction is a key requirement

#### Alternative 2: Separate Tool Output Messages
**Concept**: Create separate message entries for tool output

**Pros**: Clean separation  
**Cons**: Complicates message list, harder to associate with tool call

**Verdict**: ❌ Not recommended - deviates from React client pattern

#### Alternative 3: Use Activity State for Tool Output
**Concept**: Display tool output in the activity panel (bottom of screen)

**Pros**: No message list changes  
**Cons**: Less visible, doesn't match other clients

**Verdict**: ❌ Not recommended - breaks consistency requirement (Goal 4)

### 📋 Updated Requirements Recommendations

**Add to Functional Requirements**:
```markdown
- REQ-20: Tool output exceeding 50,000 characters shall display a truncation warning
- REQ-21: The renderer shall prioritize the most recent streamType when handling 
  rapid stdout/stderr switching (< 100ms apart)
```

**Add to Non-Functional Requirements**:
```markdown
- NFR-9: The implementation shall add 8-10 unit tests covering tool streaming scenarios
```

**Add to Constraints**:
```markdown
- CONST-5: Tool streaming messages shall not exceed 50,000 characters in the UI 
  (backend may send more, but UI truncates)
```

### ✅ Approval & Next Steps

**Status**: **APPROVED FOR IMPLEMENTATION**

**Recommended Sequence**:
1. ✅ **Phase 1**: Extend `streaming-state.js` with tool streaming methods (1-2 hours)
2. ✅ **Phase 2**: Add event routing in `App.jsx` for `tool-stream` events (30 min)
3. ✅ **Phase 3**: Add conditional rendering for tool streaming messages (1 hour)
4. ✅ **Phase 4**: Add inline styles for stdout/stderr distinction (30 min)
5. ✅ **Phase 5**: Write unit tests for tool streaming state (1-2 hours)
6. ✅ **Phase 6**: Manual testing with shell commands (30 min)

**Total Estimated Effort**: 4-6 hours

**Risks**: **LOW**
- All infrastructure exists
- Reference implementation available (React client)
- No backend changes required
- Can be tested incrementally

**Final Recommendation**: **Proceed with implementation following the recommendations above.**

---

## Overview

Add real-time shell command output streaming display to the Electron desktop app, matching the functionality already implemented in the React and Web (AppRun) clients. Currently, the Electron app receives `tool-stream` events via SSE but does not process or display them, resulting in users not seeing shell command output until after execution completes.

## Goals

- **Goal 1**: Display real-time stdout/stderr output from shell commands during execution
- **Goal 2**: Match the visual design and UX of the React client's tool streaming
- **Goal 3**: Distinguish between stdout (normal) and stderr (error) output visually
- **Goal 4**: Maintain consistent behavior across all three client applications (Web, React, Electron)

## Functional Requirements

### Event Handling

- **REQ-1**: The Electron renderer shall handle `tool-stream` SSE events alongside existing `start`, `chunk`, `end`, `error` events
- **REQ-2**: Tool stream events shall contain:
  - `type` — Must equal `'tool-stream'`
  - `messageId` — Unique identifier for the message
  - `toolName` — Name of the tool (e.g., `'shell_cmd'`)
  - `content` — Text chunk (stdout/stderr output)
  - `stream` — Either `'stdout'` or `'stderr'`
  - `agentName` — Agent identity (e.g., `'shell_cmd'`)
- **REQ-3**: The streaming state manager shall accumulate tool stream chunks by `messageId`
- **REQ-4**: Tool streaming messages shall be identified by a `isToolStreaming` flag

### Message State Management

- **REQ-5**: On receiving the first `tool-stream` event for a `messageId`, the renderer shall:
  - Create or update a message with `isToolStreaming: true`
  - Set `streamType` to either `'stdout'` or `'stderr'`
  - Initialize content accumulator
- **REQ-6**: On receiving subsequent `tool-stream` events with matching `messageId`, the renderer shall:
  - Append content to the accumulator
  - Update the displayed content via debounced render (16ms)
  - Preserve the `streamType` from the event
- **REQ-7**: The renderer shall handle mixed stdout/stderr streams by showing the most recent stream type
- **REQ-8**: When the tool completes and a final `message` event arrives, the renderer shall:
  - Clear the `isToolStreaming` flag
  - Replace accumulated content with final message content
  - Remove the `streamType` flag

### Visual Rendering

- **REQ-9**: Tool streaming messages shall display a header with "⚙️ Executing..." text
- **REQ-10**: Tool output shall be rendered in a monospace font with preserved formatting
- **REQ-11**: stdout output shall be styled with:
  - Dark background (similar to `bg-slate-900`)
  - Medium border (similar to `border-slate-700`)
  - Light text color (similar to `text-slate-300`)
- **REQ-12**: stderr output shall be styled with:
  - Red-tinted dark background (similar to `bg-red-950/30`)
  - Red border (similar to `border-red-500/30`)
  - Red text color (similar to `text-red-400`)
- **REQ-13**: Tool streaming output shall use `whitespace-pre-wrap` to preserve formatting
- **REQ-14**: Tool streaming output shall use `word-break` or similar to prevent horizontal overflow
- **REQ-15**: The visual design shall match the React client's implementation for consistency

### Performance & UX

- **REQ-16**: Tool stream chunk updates shall be debounced at 16ms intervals (matching existing streaming)
- **REQ-17**: The renderer shall auto-scroll to show new tool output as it arrives
- **REQ-18**: Tool streaming shall not interfere with regular message streaming
- **REQ-19**: Empty or whitespace-only tool output shall display "(waiting for output...)" placeholder
- **REQ-20**: Tool output exceeding 50,000 characters shall display a truncation warning and show only the last 50,000 characters
- **REQ-21**: The renderer shall prioritize the most recent streamType when handling rapid stdout/stderr switching (transitions < 100ms apart)

## Non-Functional Requirements

### Consistency

- **NFR-1**: The implementation shall follow patterns established in the React client (`react/src/components/chat/chat-message-bubble.tsx`)
- **NFR-2**: The implementation shall reuse the existing `streaming-state.js` debounce logic
- **NFR-3**: Color schemes shall match the Electron app's existing theme system

### Performance

- **NFR-4**: Tool streaming shall not degrade message rendering performance
- **NFR-5**: Large tool outputs (>100KB) shall be rendered efficiently without UI freezing

### Maintainability

- **NFR-6**: The implementation shall be testable with unit tests
- **NFR-7**: Code changes shall follow the existing Electron app architecture (streaming state manager pattern)
- **NFR-8**: The solution shall be documented inline with JSDoc comments
- **NFR-9**: The implementation shall add 8-10 unit tests covering tool streaming scenarios including stdout/stderr distinction, mixed streams, and error cases

## Constraints

- **CONST-1**: Must use existing IPC architecture (main process forwards events, renderer processes)
- **CONST-2**: Must not modify the core tool streaming event structure in `core/shell-cmd-tool.ts`
- **CONST-3**: Must maintain backward compatibility with existing SSE event handling
- **CONST-5**: Tool streaming messages shall not exceed 50,000 characters in the UI (backend may send more, but UI truncates for performance)
- **CONST-4**: Must work with the existing `streaming-state.js` and `activity-state.js` managers

## Acceptance Criteria

- [ ] **AC-1**: When a user runs a shell command that produces stdout output, the output appears in real-time with a dark background
- [ ] **AC-2**: When a shell command produces stderr output, the output appears in real-time with a red background
- [ ] **AC-3**: The "⚙️ Executing..." header is visible during tool execution
- [ ] **AC-4**: Tool output uses monospace font and preserves line breaks
- [ ] **AC-5**: Tool streaming does not break existing text message streaming
- [ ] **AC-6**: The visual design matches the React client's tool streaming display
- [ ] **AC-7**: Auto-scroll works correctly with tool streaming messages
- [ ] **AC-8**: Tool output that exceeds viewport height is scrollable
- [ ] **AC-9**: Mixed stdout/stderr output is handled gracefully
- [ ] **AC-10**: Empty or missing tool output shows a placeholder message

## Out of Scope

- Changes to the tool streaming event format or core tool execution logic
- Adding support for other tools beyond `shell_cmd`
- Rich formatting or syntax highlighting of tool output
- Interactive terminal features (user input during execution)
- Cancelling tool execution from the UI

## Success Metrics

- Feature parity with React client's tool streaming implementation
- Zero regressions in existing streaming functionality
- Positive user feedback on visibility of shell command execution
- Consistent behavior across all three client applications

## Dependencies

- Existing `streaming-state.js` module in Electron renderer
- SSE event forwarding in `electron/main.js` (already implemented)
- React client's tool streaming implementation as reference

## References

- **React Implementation**: `react/src/components/chat/chat-message-bubble.tsx` (lines 188-216)
- **Web Implementation**: `web/src/components/world-chat.tsx` (tool streaming rendering)
- **Event Source**: `core/shell-cmd-tool.ts` (lines 507-523, `tool-stream` event emission)
- **Event Type**: `core/types.ts` (line 502, `WorldSSEEvent` interface)
- **Documentation**: `.docs/done/2026-02-08/multi-client-tool-streaming.md`

---

## ADDENDUM: Inline Log Message Display (2026-02-10)

### Additional Requirements

**REQ-LOG-1**: The Electron app SHALL display inline log messages from `logger.error()`, `logger.warn()`, `logger.info()`, `logger.debug()`, and `logger.trace()` calls

**REQ-LOG-2**: Log messages SHALL appear chronologically in the message flow, not in a separate status bar or panel

**REQ-LOG-3**: Each log message SHALL display a colored dot indicator based on log level:
  - error: red (#ef4444)
  - warn: amber (#f59e0b)
  - info: green (#10b981)
  - debug: cyan (#06b6d4)
  - trace: gray (#9ca3af)

**REQ-LOG-4**: Log messages SHALL display the category (logger name) in bold followed by the message text

**REQ-LOG-5**: Log message styling SHALL use small monospace font for technical readability

**REQ-LOG-6**: Log messages SHALL match the Web app's inline display pattern for visual consistency

**REQ-LOG-7**: Log messages SHALL be non-intrusive and visually distinct from user/agent messages

### Additional Acceptance Criteria

- [ ] **AC-LOG-1**: When `logger.error()` is called, a red dot appears inline with the error message
- [ ] **AC-LOG-2**: When `logger.warn()` is called, an amber dot appears inline with the warning
- [ ] **AC-LOG-3**: Log messages appear in chronological order with other messages
- [ ] **AC-LOG-4**: Log messages use monospace font and show category name in bold
- [ ] **AC-LOG-5**: Visual styling matches Web app's log message pattern
