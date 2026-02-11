# Requirement: Port Electron App UX to Web App

**Date**: 2026-02-11  
**Type**: Feature Enhancement  
**Priority**: High

## Overview

Port the superior user experience (UX) features from the Electron desktop app to the web app. The Electron app provides significantly better visual feedback, activity indicators, and tool execution visibility compared to the current web app implementation.

## Goals

- Match or exceed Electron app's UX quality in the web app
- Provide real-time feedback for user actions and agent processing
- Improve visibility into tool execution and progress
- Enhance error message presentation
- Optimize streaming state management for better performance

## Current State Analysis

### Web App (Current)
- Simple three-dot waiting animation
- Basic tool streaming with minimal visual distinction
- No elapsed time tracking
- No queue visualization
- Basic error indicators
- Simple SSE-based streaming
- No debouncing or performance optimization

### Electron App (Target)
- Sophisticated activity indicators with multiple components
- Rich tool execution status with icons and progress
- Elapsed time counter (mm:ss format)
- Agent queue display
- Collapsible tool output (defaults to collapsed)
- Debounced streaming updates (16ms, 60fps)
- Advanced activity state tracking

## Functional Requirements

### REQ-1: Waiting Indicators
**Status**: Required  
**Description**: Implement comprehensive waiting/activity indicators

**Components Needed**:
- [ ] ThinkingIndicator - Animated dots with "Thinking..." text
- [ ] ActivityPulse - Pulsing dot indicator (active/idle states)
- [ ] ElapsedTimeCounter - Show elapsed time in mm:ss or hh:mm:ss format
- [ ] AgentQueueDisplay - Show which agents are processing/waiting

**Acceptance Criteria**:
- Visible activity indicator when agents are processing
- Elapsed timer starts when first activity begins
- Timer updates every 1 second
- Agent queue shows active agent with visual distinction
- Queued agents shown with position indicators
- All indicators clear when processing completes

### REQ-2: Tool Execution Status
**Status**: Required  
**Description**: Rich tool execution feedback with icons and progress

**Components Needed**:
- [ ] ToolExecutionStatus component showing:
  - Tool names formatted (snake_case → Title Case)
  - Tool-specific icons (file, terminal, search, web, etc.)
  - Real-time progress text when available
  - Spinner animation for active tools
- [ ] Collapsible tool output (default: collapsed)
- [ ] Icon-only expand/collapse buttons
- [ ] stdout/stderr visual distinction:
  - stderr: red-tinted background
  - stdout: dark terminal background
- [ ] 50K character truncation limit for large output

**Acceptance Criteria**:
- Tool icon appears when tool starts
- Tool name displayed in readable format
- Progress text shown when available
- Spinner animation while tool is running
- Tool output collapsed by default
- User can expand/collapse tool output
- stderr visually distinct from stdout
- Very large output truncated with notice

### REQ-3: Streaming State Management
**Status**: Required  
**Description**: Optimize streaming performance with debouncing

**Modules Needed**:
- [ ] streaming-state module:
  - Map-based accumulator for concurrent streams
  - 16ms debounce using requestAnimationFrame (60fps)
  - Clean lifecycle: start → chunk → end/error
  - Separate handling for assistant and tool streams
  - Flush pending updates on end/error
- [ ] activity-state module:
  - Tool tracking by toolUseId
  - 1-second interval for elapsed time
  - Aggregated busy state from streams + tools
  - Start/stop elapsed timer based on activity

**Acceptance Criteria**:
- UI updates smoothly at 60fps
- No stuttering during streaming
- Multiple concurrent streams handled correctly
- Tool outputs tracked separately
- Elapsed time accurate within 1 second
- Activity state correctly reflects busy/idle
- Clean cleanup when changing sessions

### REQ-4: Enhanced Message Display
**Status**: Required  
**Description**: Improve message card styling and visual hierarchy

**Features Needed**:
- [ ] Role-based left border colors:
  - User messages: subtle border
  - Tool messages: amber border
  - System messages: muted border
  - Agent messages: sky border
- [ ] Sender label with reply chain tracking
- [ ] Markdown rendering for all message types
- [ ] Clean message deduplication

**Acceptance Criteria**:
- Message role immediately visible from border color
- Reply chains correctly tracked and displayed
- Markdown content renders properly
- No duplicate messages in multi-agent scenarios
- Clean visual hierarchy

### REQ-5: Error Message Improvements
**Status**: Required  
**Description**: Better error visibility and handling

**Features Needed**:
- [ ] Dedicated error state indicators
- [ ] Visual distinction for stderr streams
- [ ] Error message formatting utilities
- [ ] Clear error state in activity tracking

**Acceptance Criteria**:
- Errors immediately visible
- stderr output clearly marked
- Error messages formatted for readability
- Tool errors tracked and displayed

## Non-Functional Requirements

### Performance
- UI updates at 60fps during streaming (16ms frame budget)
- No blocking operations during message rendering
- Efficient memory usage for long conversations

### Usability
- Visual feedback for all user actions
- Clear indication of system state (busy/idle)
- Intuitive tool output collapse/expand
- Accessible to screen readers (aria-live regions)

### Maintainability
- Framework-agnostic utilities (can be reused)
- Clear separation of concerns (state vs. UI)
- AppRun component patterns followed
- Type safety with TypeScript

### Compatibility
- Works with existing SSE infrastructure
- Compatible with AppRun framework
- No breaking changes to existing features

## Technical Constraints

1. **Framework**: Must work with AppRun (not React)
2. **Styling**: Use existing CSS variable system
3. **Build**: No additional build steps required
4. **Bundle Size**: Keep additions minimal (<20KB)
5. **Browser Support**: Modern browsers only (ES2020+)

## Implementation Considerations

### AppRun Adaptation
- Electron uses React hooks (useState, useEffect, useMemo)
- Web uses AppRun (app.run, state management, event handling)
- Need to convert React patterns to AppRun patterns
- Factory functions work in both (streaming-state, activity-state)

### Styling Approach
- Electron uses Tailwind CSS with HSL tokens
- Web uses CSS custom properties + some Tailwind
- Convert Tailwind classes to CSS custom properties where needed
- Keep existing Short Stack font style

### Event System
- Electron uses IPC + SSE for events
- Web uses direct SSE connection
- Streaming state managers work the same way
- Activity state tracking identical

## Dependencies & Risks

### Dependencies
- Existing SSE infrastructure
- AppRun framework
- CSS custom properties support
- requestAnimationFrame API

### Risks
1. **Performance Risk**: Debouncing might not integrate smoothly with AppRun
   - Mitigation: Test with long conversations, profile performance
2. **Styling Risk**: Tailwind → CSS variable conversion might lose fidelity
   - Mitigation: Match visual appearance carefully, use design tokens
3. **Complexity Risk**: Adding many components might bloat codebase
   - Mitigation: Keep components minimal, share utilities
4. **Testing Risk**: Hard to test streaming behavior
   - Mitigation: Use manual testing with dev server

## Out of Scope

- Complete Tailwind CSS integration (use existing CSS variables)
- Changing fundamental architecture of web app
- Porting all Electron features (only UX improvements)
- Breaking existing functionality

## Acceptance Criteria Summary

✅ The web app must have:
- [ ] Visible activity indicators matching Electron quality
- [ ] Rich tool execution status with icons and progress
- [ ] Elapsed time counter (mm:ss format)
- [ ] Agent queue display showing processing order
- [ ] Collapsible tool output (default collapsed)
- [ ] stdout/stderr visual distinction
- [ ] Debounced streaming at 60fps
- [ ] Role-based message styling
- [ ] Clean error handling and display
- [ ] No performance degradation
- [ ] No breaking changes to existing features

## Success Metrics

1. **Visual Parity**: Web app UX matches Electron app quality
2. **Performance**: 60fps during streaming (measured in DevTools)
3. **User Feedback**: Improved visibility into agent actions
4. **No Regressions**: All existing features still work
5. **Bundle Size**: <20KB addition to bundle

## References

- Electron App: `/electron/renderer/src/App.jsx`
- Web App: `/web/src/components/world-chat.tsx`
- Streaming State: `/electron/renderer/src/streaming-state.js`
- Activity State: `/electron/renderer/src/activity-state.js`
- Components: `/electron/renderer/src/components/`

## Related Work

- Previous web app message display improvements
- SSE streaming infrastructure
- AppRun domain module extraction (message-display.ts)
