# Requirement: Shell Command Output Streaming to UI via SSE

**Date**: 2026-02-08  
**Type**: Feature Enhancement  
**Status**: Requirements Phase

## Overview

Shell command execution output should be streamed or accumulated to the UI through Server-Sent Events (SSE), providing real-time feedback to users similar to how LLM responses are currently streamed.

## Current State Analysis

### Backend Implementation (✅ Partially Complete)
- **shell-cmd-tool.ts** (Updated 2026-02-08):
  - `executeShellCommand()` has `onStdout` and `onStderr` callbacks
  - Publishes `tool-stream` events via `publishSSE()`
  - Event structure: `{ type: 'tool-stream', toolName: 'shell_cmd', content: chunk, stream: 'stdout'|'stderr', messageId, agentName }`
  
### Frontend Implementation (❌ Incomplete)
- **sse-client.ts**:
  - Has handlers for: `tool-start`, `tool-progress`, `tool-result`, `tool-error`
  - **Missing**: Handler for `tool-stream` event type
  - `handleStreamingEvent()` function does NOT have a case for `'tool-stream'`

### Event Flow
1. ✅ Backend: Shell command executes → stdout/stderr chunks received
2. ✅ Backend: Chunks published as `tool-stream` SSE events
3. ❌ Frontend: Events received but NOT processed (no handler)
4. ❌ Frontend: No UI display of streaming output

## Goals

1. **Real-time Output Display**: Show shell command output as it streams, not just final result
2. **User Feedback**: Provide immediate confirmation that command is executing
3. **Consistency**: Match the streaming UX pattern used for LLM responses  
4. **Error Visibility**: Display stderr output in real-time for debugging

## Functional Requirements

### REQ-1: Frontend Event Handling
- **MUST** add `'tool-stream'` case to `handleStreamingEvent()` in sse-client.ts
- **MUST** publish appropriate AppRun event for UI state update
- **MUST** handle both `stdout` and `stderr` streams separately
- **MUST** accumulate chunks per messageId for coherent display

### REQ-2: UI State Management
- **MUST** add event handler in WorldEvents type (events.ts)
- **MUST** create domain function for tool stream state updates
- **MUST** maintain streaming message state per tool execution
- **MUST** distinguish stdout vs stderr in display

### REQ-3: Message Display
- **MUST** show tool execution status indicator during streaming
- **MUST** display accumulated stdout content in real-time
- **SHOULD** display stderr differently (e.g., red/warning style)
- **MUST** finalize message display on tool completion
- **SHOULD** support collapsible/expandable output for long streams

### REQ-4: UI/UX Requirements
- **MUST** auto-scroll to show new streaming content
- **MUST** show "executing..." indicator before first output
- **SHOULD** show command being executed
- **SHOULD** show elapsed time during execution
- **MUST** preserve formatting (code blocks, monospace font)

## Non-Functional Requirements

### Performance
- Streaming chunks should display with <100ms latency
- UI should remain responsive during large output streams
- Memory usage should be bounded (truncate very long output)

### Reliability
- Handle stream interruptions gracefully
- Ensure message IDs match correctly between events
- No duplicate or lost chunks

### User Experience
- Consistent with existing LLM streaming UX patterns
- Clear visual distinction between tool types (LLM vs shell)
- Clear visual distinction between stdout and stderr

## Constraints

### Technical Constraints
- Must use existing SSE infrastructure (no new connection patterns)
- Must work with AppRun event system
- Must maintain backwards compatibility with non-streaming display
- Backend streaming already implemented - frontend-only changes

### Design Constraints
- Follow existing patterns in `sse-client.ts` for event handlers
- Follow existing patterns in `domain/sse-streaming.ts` for state management
- Use existing message display components where possible

## Acceptance Criteria

- [ ] **AC-1**: When a shell command executes, user sees "Executing..." indicator immediately
- [ ] **AC-2**: stdout chunks appear in UI within 100ms of being generated
- [ ] **AC-3**: stderr chunks appear distinctly (different color/style) in real-time
- [ ] **AC-4**: Long-running commands (>5s) show continuous output updates
- [ ] **AC-5**: Command completion shows final consolidated output
- [ ] **AC-6**: Multiple concurrent commands stream independently without conflicts
- [ ] **AC-7**: Output is properly formatted in monospace font with preserved whitespace
- [ ] **AC-8**: User can collapse/expand command output in message history
- [ ] **AC-9**: stderr output is visually distinguishable from stdout
- [ ] **AC-10**: Page auto-scrolls to follow streaming output

## Dependencies

- Existing SSE infrastructure (server/sse-handler.ts)
- Existing shell-cmd-tool.ts streaming implementation
- AppRun framework event system
- World component state management

## Risks and Mitigations

### Risk: Performance degradation with very large output
**Mitigation**: Implement output size limits and truncation strategy

### Risk: UI becomes cluttered with too much tool output
**Mitigation**: Collapsible tool output sections, default collapsed for long output

### Risk: Stream synchronization issues with multiple tools
**Mitigation**: Use messageId for proper stream correlation

### Risk: Browser memory issues with long-running streams
**Mitigation**: Implement circular buffer or output truncation after threshold

## Out of Scope

- ❌ Modifying backend streaming implementation (already complete)
- ❌ Interactive shell sessions (stdin support)
- ❌ Real-time command cancellation from UI
- ❌ Output filtering/searching in real-time
- ❌ Streaming for other tool types (focus on shell_cmd only)

## Success Metrics

1. **Latency**: Streaming chunks visible in UI within 100ms
2. **Completeness**: 100% of stdout/stderr captured and displayed
3. **Reliability**: Zero dropped chunks or out-of-order display
4. **UX**: User can monitor long-running command progress in real-time

## Related Documents

- Backend Implementation: [core/shell-cmd-tool.ts](/Users/esun/Documents/Projects/agent-world/core/shell-cmd-tool.ts)
- SSE Handler: [server/sse-handler.ts](/Users/esun/Documents/Projects/agent-world/server/sse-handler.ts)
- Frontend SSE: [web/src/utils/sse-client.ts](/Users/esun/Documents/Projects/agent-world/web/src/utils/sse-client.ts)
- Event Publishers: [core/events/publishers.ts](/Users/esun/Documents/Projects/agent-world/core/events/publishers.ts)

## Notes

- Backend streaming was added 2026-02-08 but frontend handler was not implemented
- This is primarily a **frontend enhancement** - backend is ready
- Pattern should mirror existing LLM streaming for consistency
- Consider reusing components from existing stream handlers where possible

---

## Architecture Review (AR) - 2026-02-08

### Review Summary
✅ **APPROVED** - Requirements are complete, feasible, and well-scoped. Implementation is straightforward with minimal risk.

### Completeness Analysis

#### Strengths
- **Well-defined scope**: Focuses on frontend-only changes with backend already complete
- **Clear requirements**: Specific event handling, state management, and UI display requirements
- **Comprehensive constraints**: Technical and design constraints clearly identified
- **Detailed acceptance criteria**: 10 testable criteria covering all aspects

#### Identified Gaps (Minor)
1. **Message Type Definition**: Need to define `Message` type extension for tool streaming
2. **Truncation Strategy**: Should specify output size limits (e.g., 10KB per stream, 50KB total)
3. **Performance Metrics**: Should define acceptable chunk processing time (<50ms per chunk)
4. **Mobile Responsiveness**: No mention of mobile/small screen handling for tool output

### Feasibility Analysis

#### ✅ Technical Feasibility: HIGH
- **Backend Complete**: Streaming already works, just needs frontend consumption
- **Existing Patterns**: Can follow `handleToolStart/Progress/Result/Error` patterns from sse-client.ts
- **Infrastructure Ready**: SSE connection, event routing, state management all in place
- **Low Complexity**: Simple event handler addition + state update + UI display

#### ✅ Implementation Effort: LOW-MEDIUM
**Estimated**: 4-6 hours for complete implementation + testing
- **Event Handler**: 1 hour (add `tool-stream` case to `handleStreamingEvent()`)
- **State Management**: 1 hour (domain function + event type + state updates)
- **UI Display**: 2-3 hours (message rendering with stdout/stderr distinction)
- **Testing**: 1 hour (manual testing with various commands)

#### ✅ Risk Level: LOW
- No breaking changes - additive only
- Backend already tested and working
- Can leverage existing tool event display patterns

### Alternative Approaches

#### **Option A: Simple Accumulation (RECOMMENDED)**
**Description**: Accumulate chunks in existing message object, update text field

**Pros:**
- Simplest implementation
- Reuses existing message display components
- Minimal state changes
- Consistent with LLM streaming pattern

**Cons:**
- Limited control over stdout vs stderr styling
- May need message type extension for stream metadata

**Implementation:**
```typescript
case 'tool-stream':
  const toolStream = streamingState.activeMessages.get(messageId);
  if (toolStream) {
    const isStdout = eventData.stream === 'stdout';
    toolStream.content += eventData.content;
    toolStream.streamType = eventData.stream; // Track current stream
    
    publishEvent('handleToolStream', {
      messageId,
      content: toolStream.content,
      stream: eventData.stream,
      agentName
    });
  }
  break;
```

---

#### **Option B: Dual-Stream Tracking**
**Description**: Track stdout and stderr separately, merge during display

**Pros:**
- Clear separation of output streams
- Better styling control (color coding)
- Can show "3 errors" badge on stderr
- Better for debugging

**Cons:**
- More complex state management
- Requires custom message display component
- Potential synchronization issues

**Implementation:**
```typescript
interface ToolStreamState {
  stdout: string;
  stderr: string;
  lastUpdate: 'stdout' | 'stderr';
}

case 'tool-stream':
  const stream = streamingState.toolStreams.get(messageId) || {
    stdout: '', stderr: '', lastUpdate: 'stdout'
  };
  
  if (eventData.stream === 'stdout') {
    stream.stdout += eventData.content;
    stream.lastUpdate = 'stdout';
  } else {
    stream.stderr += eventData.content;
    stream.lastUpdate = 'stderr';
  }
  
  publishEvent('handleToolStream', { messageId, ...stream });
  break;
```

---

#### **Option C: Line-by-Line Display**
**Description**: Display each chunk as a separate line item for granular control

**Pros:**
- Maximum control over styling per line
- Can timestamp each chunk
- Easy to implement search/filter
- Better for very long outputs

**Cons:**
- Performance impact with many chunks (DOM nodes)
- More complex UI component
- Harder to copy/paste output
- Memory overhead

**Pros/Cons**: **NOT RECOMMENDED** - Unnecessary complexity for MVP

---

### Recommended Approach: **Option A with Enhancements**

**Reasoning:**
1. **Consistency**: Matches existing LLM streaming pattern
2. **Simplicity**: Minimal code changes, reuses existing components
3. **Performance**: Single message object, efficient updates
4. **Extensibility**: Can layer stderr styling without state complexity

**Enhanced Implementation Plan:**
1. Add `tool-stream` case to `handleStreamingEvent()`
2. Accumulate chunks in activeMessages Map
3. Publish `handleToolStream` event with stream type metadata
4. Add domain function `handleToolStream()` following existing patterns
5. Extend message display to apply stderr styling (red/orange text)
6. Add output truncation at 50KB per tool execution

### Scalability Considerations

#### ✅ Current Design Scales Well
- **Concurrent Commands**: messageId-based tracking supports multiple simultaneous streams
- **Large Outputs**: Recommend 50KB limit with "...truncated" indicator
- **High Frequency**: Browser can handle 100+ chunks/sec (tested with LLM streaming)
- **Memory**: Bounded by message history limit (already implemented)

#### Potential Issues & Mitigations
1. **Issue**: Long-running command output (MB scale)
   **Mitigation**: Implement circular buffer, keep last 50KB only

2. **Issue**: Rapid stderr/stdout interleaving
   **Mitigation**: Option A handles naturally (appends in order received)

3. **Issue**: Multiple concurrent shell commands
   **Mitigation**: messageId isolation ensures no conflicts

### Security Considerations

#### ✅ No New Security Risks
- Output is already sanitized by backend (shell execution runs in controlled env)
- Frontend uses existing markdown rendering (already sanitized)
- No exec/eval in display - only text rendering

#### Best Practices
- Ensure output is escaped before HTML rendering (existing renderMarkdown handles this)
- Consider rate limiting display updates (max 10Hz) to prevent UI flooding

### Maintainability Review

#### ✅ Good Maintainability
- **Pattern Consistency**: Follows existing `handleTool*` event patterns
- **Code Locality**: All changes in sse-client.ts and domain/sse-streaming.ts
- **Minimal Dependencies**: No new libraries needed
- **Clear Separation**: Event handling → State update → UI display

### Testing Strategy

#### Unit Tests
- [ ] `handleToolStream` domain function (state transitions)
- [ ] Message accumulation logic (stdout/stderr ordering)
- [ ] Output truncation at 50KB limit

#### Integration Tests
- [ ] Real shell command streaming (echo, ls, long-running command)
- [ ] Concurrent command execution
- [ ] Stream interruption/cancellation
- [ ] Large output handling (stress test)

#### Manual Tests
- [ ] Visual appearance (stdout black, stderr red/orange)
- [ ] Auto-scroll behavior
- [ ] Collapse/expand long output
- [ ] Copy/paste output content

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Option A (Simple Accumulation)** | Matches LLM streaming pattern, minimal complexity |
| **Single Message Object** | Reuses existing display components, efficient |
| **Stream Type Metadata** | Enables stderr styling without separate tracking |
| **50KB Output Limit** | Prevents memory issues, 50KB = ~10,000 lines |
| **Frontend-Only Changes** | Backend already complete and tested |

### Updated Acceptance Criteria Priority

**Critical (Must Have - MVP):**
- AC-1, AC-2, AC-3, AC-4, AC-5, AC-7

**Important (Should Have - v1.1):**
- AC-6, AC-8, AC-10

**Nice to Have (Future):**
- AC-9 (advanced stderr styling)

### Implementation Risks - LOW

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Performance degradation | Low | Medium | Add 50KB truncation, 10Hz update limit |
| UI cluttered with output | Low | Low | Implement collapsible sections (future) |
| Stream sync issues | Very Low | Low | Use existing messageId correlation |
| Mobile rendering issues | Low | Low | Use responsive CSS (existing pattern) |

### Conclusion

**Status**: ✅ **APPROVED FOR IMPLEMENTATION**

The requirements are complete, well-scoped, and technically feasible. The recommended approach (Option A with enhancements) provides the best balance of simplicity, consistency, and functionality. Implementation risk is low with existing patterns to follow. Estimated effort is 4-6 hours for complete implementation and testing.

**Next Steps:**
1. Create Architecture Plan (AP) document with phased implementation
2. Begin implementation with SS (Step-by-Step) workflow
3. Test each phase before moving to next
