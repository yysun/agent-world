# Requirements: SSE Streaming Display Enhancement

## Overview
Enhance the CLI App.tsx to display SSE (Server-Sent Events) chunks inline as they arrive, providing real-time streaming text display for LLM responses.

## Current State
- CLI App.tsx receives SSE events through the event system
- Events are displayed in a recent events list with basic formatting
- SSE chunks are not accumulated or displayed as streaming text

## Requirements

### Functional Requirements
1. **Real-Time SSE Chunk Display**
   - Display SSE chunks inline as they arrive from the event system
   - Accumulate chunks to build complete streaming messages
   - Show streaming text in real-time during LLM response generation

2. **SSE Event Handling**
   - Detect SSE event types: `chunk`, `end`, `error`
   - Handle `chunk` events for streaming text accumulation
   - Handle `end` events for proper line termination
   - Handle `error` events for streaming error display

3. **Streaming Text Component**
   - Create dedicated component for streaming text display
   - Show partial text as it builds up from chunks
   - Clear streaming area when new stream starts
   - Preserve completed streams in event history

4. **Visual Indicators**
   - Show typing indicator during active streaming
   - Display completion indicator when stream ends
   - Show error state if streaming fails
   - Distinguish streaming content from static events

### Technical Requirements
1. **Event System Integration**
   - Use existing event system without modification
   - Handle SSE events through current `addEvent` callback
   - Maintain compatibility with other event types

2. **State Management**
   - Track active streaming sessions
   - Accumulate chunks for current stream
   - Clear state when stream completes
   - Handle multiple concurrent streams if needed

3. **Display Architecture**
   - Separate streaming display from event history
   - Show streaming content prominently during generation
   - Move completed streams to event history
   - Maintain responsive UI during streaming

### User Experience Requirements
1. **Immediate Feedback**
   - Show streaming text appears instantly as chunks arrive
   - Provide visual indication that content is generating
   - Smooth transition from streaming to completed state

2. **Clear Visual Hierarchy**
   - Streaming content should be visually distinct
   - Completed content should integrate with event history
   - Error states should be clearly indicated

3. **Performance**
   - Handle high-frequency chunk events efficiently
   - Avoid UI lag during rapid streaming
   - Maintain responsiveness of other CLI features

## Implementation Approach
1. Add streaming state management to App.tsx
2. Create StreamingDisplay component for real-time text
3. Enhance event handler to detect and route SSE events
4. Integrate streaming display with existing event system
5. Add visual indicators and completion handling

## Success Criteria
- SSE chunks display inline as they arrive
- Streaming text builds up in real-time
- Completed streams integrate with event history
- No performance degradation during streaming
- Clear visual indicators for streaming states
