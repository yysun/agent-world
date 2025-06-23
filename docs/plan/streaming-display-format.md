# Streaming Display Format Implementation Plan

## Overview
Implement single-line streaming preview with full multi-line display after completion to improve readability and user experience.

## Implementation Steps

### Phase 1: Analysis and Preparation
- [x] Analyze current streaming implementation in `cli/index.ts`
- [x] Identify streaming management functions that need modification
- [x] Review event handling for SSE streaming events
- [x] Map out cursor positioning and display logic requirements

### Phase 2: Core Streaming Logic Updates
- [x] Modify `StreamingAgent` interface to include content buffer
- [x] Update `startStreaming()` to initialize content buffering
- [x] Implement single-line preview logic in `addStreamingContent()`
- [x] Add content truncation with ellipsis for preview display
- [x] Implement cursor positioning for same-line updates

### Phase 3: Display Management
- [x] Create preview line management system
- [x] Implement content buffering during streaming
- [x] Add logic to clear preview lines before full display
- [x] Update `endStreaming()` to show complete multi-line content
- [x] Ensure proper cursor restoration after full display

### Phase 4: Terminal Control Enhancements
- [x] Add terminal control utilities for cursor management
- [x] Implement line clearing and cursor positioning functions
- [x] Add support for replacing single-line content during streaming
- [x] Ensure compatibility with different terminal types

### Phase 5: Error Handling and Edge Cases
- [x] Handle streaming errors with proper cleanup
- [x] Manage multiple concurrent agent streaming
- [x] Handle very long content that exceeds terminal width
- [x] Ensure proper cleanup when streaming is interrupted

### Phase 6: Testing Structure
- [x] Create unit tests for streaming display logic
- [x] Add integration tests for multi-agent streaming  
- [x] Test terminal control and cursor positioning
- [x] Verify error handling and cleanup scenarios
- [x] Test with various content lengths and types

### Phase 7: Integration and Validation
- [x] Test with real agent responses
- [x] Validate single-line preview behavior
- [x] Confirm multi-line final display works correctly
- [x] Ensure no regression in existing functionality
- [x] Performance testing for large responses

## Technical Considerations

### Modified Components
- **StreamingAgent Interface**: Add content buffer and preview state
- **startStreaming()**: Initialize preview display
- **addStreamingContent()**: Implement single-line preview updates
- **endStreaming()**: Replace preview with full content
- **Terminal Control**: Add cursor and line management utilities

### Dependencies
- Node.js readline module for cursor control
- ANSI escape sequences for terminal manipulation
- Existing World event system for streaming events

### Performance Requirements
- Minimal latency for preview updates
- Efficient buffer management for large responses
- Smooth transition from preview to full display

## Acceptance Criteria

### During Streaming
- [x] Each agent shows single-line preview with ellipsis
- [x] Preview updates in real-time without creating new lines
- [x] Multiple agents stream simultaneously on separate lines
- [x] Content is properly truncated to fit terminal width

### After Streaming
- [x] Preview lines are cleared cleanly
- [x] Full multi-line content displays correctly
- [x] Proper spacing and formatting maintained
- [x] Cursor returns to input prompt position

### Error Handling
- [x] Streaming errors don't leave orphaned preview lines
- [x] Interrupted streaming cleans up properly
- [x] Terminal state remains consistent after errors

## File Modifications Required
- `cli/index.ts` - Main streaming logic updates
- `cli/utils/colors.ts` - Potential terminal control utilities
- `tests/` - New test files for streaming display functionality
