# Streaming Display Behavior Fix Implementation Plan

## Analysis of Current Issues

### Critical Problems Identified

From testing the current implementation, I've identified several critical issues with the streaming display behavior:

#### 1. **ANSI Escape Sequence Conflicts**
- **Issue**: Real-time streaming updates are using ANSI cursor positioning that conflicts with input box positioning
- **Evidence**: Lines like `● a1: ... (↑465 ↓0 tokens)○ a2: ... (↑539 ↓0 tokens)● a1: ... (↑465 ↓0 tokens)` showing overlapping/conflicting display
- **Root Cause**: The `renderStreamingLines()` function uses `\x1B[${lines.length}A` to move up and clear lines, but this interferes with the input box positioning system

#### 2. **Input Box Never Appears During Multi-Agent Streaming**
- **Issue**: The desired layout shows input box below streaming lines, but current implementation hides input box completely during streaming
- **Evidence**: No input box visible during streaming in the test output
- **Root Cause**: `startStreamingDisplay()` calls `hideInputBox()` and never repositions it below streaming content

#### 3. **Streaming Line Rendering Race Conditions**
- **Issue**: Multiple agents updating simultaneously cause display corruption
- **Evidence**: Overlapping agent lines and garbled token counts in output
- **Root Cause**: No proper synchronization between multiple streaming agents updating display simultaneously

#### 4. **Inconsistent Final Display Transition**
- **Issue**: Transition from streaming to final display is abrupt and doesn't maintain proper spacing
- **Evidence**: Final messages appear without proper sequential flow formatting
- **Root Cause**: `endStreamingDisplay()` clears streaming lines but doesn't maintain consistent spacing rules

#### 5. **Token Count Display Issues**
- **Issue**: Token counts appear corrupted and overlapping during streaming
- **Evidence**: Mixed token displays like `↑465 ↓0 tokens)○ a2: ... (↑539 ↓0 tokens)`
- **Root Cause**: ANSI positioning conflicts with debounced refresh timing

## Desired Streaming Display Behavior

Based on the plan requirements, the correct behavior should be:

### Multi-Agent Streaming Layout
```
● Agent1: streaming content... (↑50 ↓15 tokens)
● Agent2: streaming content... (↑42 ↓8 tokens)  
● Agent3: streaming content... (↑38 ↓12 tokens)

┌─────────────────────────────────────┐
│ > [user input area]                 │
└─────────────────────────────────────┘
```

### Key Requirements
1. **Real-time Updates**: Streaming lines update with flashing emoji animation and token counts
2. **Input Protection**: User typing is blocked during streaming to prevent interference
3. **Dynamic Positioning**: Input box automatically repositions as streaming agents are added
4. **Consistent Spacing**: Always maintains one blank line between content and input box
5. **Input Box Visibility**: Input box remains visible below streaming content (not hidden)

## Implementation Plan

### Phase 1: Streaming Display Architecture Redesign ⚠️
- [ ] **Coordinate ANSI-based rendering** to prevent conflicts between streaming and input box
- [ ] **Implement streaming region management** by reserving terminal areas for streaming vs input
- [ ] **Create ANSI operation synchronization** that ensures streaming and input box don't interfere
- [ ] **Add streaming-safe input box positioning** that places input box below streaming content dynamically

**Go/No-Go Checkpoint**: Streaming lines display without ANSI conflicts and input box appears below streaming content

### Phase 2: Input Box Dynamic Positioning During Streaming ⚠️
- [ ] **Modify streaming start behavior** to reposition input box below streaming area instead of hiding it
- [ ] **Implement dynamic input box repositioning** as new streaming agents are added
- [ ] **Create streaming-aware input management** that clears input text but keeps input box visible
- [ ] **Add proper spacing enforcement** between streaming content and input box

**Go/No-Go Checkpoint**: Input box remains visible and properly positioned during multi-agent streaming

### Phase 3: Real-time Streaming Synchronization ⚠️
- [ ] **Implement streaming agent coordination** to prevent simultaneous display updates
- [ ] **Create sequential streaming line updates** with proper queuing to avoid display corruption
- [ ] **Add streaming state management** to track agent positions and prevent overlapping
- [ ] **Implement emoji animation synchronization** across multiple agents

**Go/No-Go Checkpoint**: Multiple agents stream simultaneously without display corruption

### Phase 4: Streaming to Final Display Transition ⚠️
- [ ] **Redesign streaming completion flow** to maintain sequential display pattern
- [ ] **Implement smooth transition** from streaming lines to final formatted messages
- [ ] **Ensure consistent spacing** during streaming-to-final transition
- [ ] **Maintain input box positioning** after streaming completion

**Go/No-Go Checkpoint**: Streaming completion follows consistent display pattern without layout breaks

### Phase 5: Input Interaction During Streaming ⚠️
- [ ] **Implement input blocking during streaming** while keeping input box visible
- [ ] **Add clear visual indication** that input is blocked during streaming
- [ ] **Ensure input box content clearing** when streaming starts
- [ ] **Restore input functionality** when streaming completes

**Go/No-Go Checkpoint**: User input interaction works correctly during all streaming states

## Technical Implementation Details

### Core Architecture Changes Required

#### 1. **Streaming Display System Redesign**
```typescript
interface StreamingLineManager {
  lines: Map<string, StreamingLine>;
  displayBuffer: string[];
  inputBoxPosition: number;
  isRendering: boolean;
}

interface StreamingLine {
  agentName: string;
  content: string;
  tokens: { input: number; output: number };
  status: 'streaming' | 'complete' | 'error';
  lineNumber: number;
  lastUpdate: number;
}
```

#### 2. **Coordinate ANSI-based Rendering**
- **Current Problem**: Conflicting ANSI operations between streaming updates and input box positioning
- **Solution**: Create centralized ANSI coordination to prevent conflicts
- **Approach**: Reserve terminal regions for streaming vs input box, coordinate cursor operations

#### 3. **Dynamic Input Box Positioning**
- **Current Problem**: Input box is hidden during streaming
- **Solution**: Calculate input box Y position based on number of streaming agents
- **Approach**: Position input box at `streamingLines.length + 2` (for spacing)

#### 4. **Streaming State Coordination**
- **Current Problem**: Multiple agents update display simultaneously causing corruption
- **Solution**: Implement update queue with mutex-like behavior
- **Approach**: Sequential processing of streaming updates with debounced rendering

### Key Functions to Modify

#### `startStreamingDisplay()`
```typescript
// BEFORE: Hides input box completely
if (state.terminal.isInputBoxVisible) {
  clearInputText('> ');
  hideInputBox(); // ❌ This hides the input box
}

// AFTER: Repositions input box below streaming area
if (state.terminal.isInputBoxVisible) {
  clearInputText('> ');
  repositionInputBoxBelowStreaming(); // ✅ Keeps input box visible
}
```

#### `renderStreamingLines()`
```typescript
// BEFORE: Uncoordinated ANSI operations (causes conflicts)
process.stdout.write(`\x1B[${lines.length}A`); // ❌ Conflicts with input box
process.stdout.write('\x1B[2K'); // ❌ May interfere with input positioning

// AFTER: Coordinated ANSI operations (prevents conflicts)
if (!state.terminal.inputBoxRegion.isActive) { // ✅ Check input box state first
  moveToStreamingRegion(lines.length); // ✅ Coordinated cursor movement
  clearStreamingLines(lines.length); // ✅ Safe line clearing
}
```

#### `updateStreamingLine()`
```typescript
// BEFORE: Debounced refresh with potential ANSI conflicts
streamingDisplay.refreshTimer = setTimeout(() => {
  renderStreamingLines(); // ❌ May conflict with input box operations
}, 100);

// AFTER: Coordinated updates with ANSI synchronization
if (acquireDisplayLock()) { // ✅ Prevent ANSI conflicts
  updateSpecificStreamingLine(agentName, content, tokens, status);
  repositionInputBoxIfNeeded(); // ✅ Maintain input box position
  releaseDisplayLock();
}
```

## Success Criteria

### Visual Layout Verification
1. **Streaming Display**: Multiple agents show streaming content with animated emojis and token counts
2. **Input Box Position**: Input box appears below streaming content with proper spacing
3. **Dynamic Positioning**: Input box moves down as new streaming agents are added
4. **No Display Corruption**: No overlapping or garbled text during multi-agent streaming
5. **Smooth Transitions**: Clean transition from streaming to final display

### Functional Verification
1. **Input Blocking**: User input is blocked during streaming but input box remains visible
2. **Input Clearing**: Current input is cleared when streaming starts
3. **Input Restoration**: Input functionality restored when streaming completes
4. **Sequential Display**: All display operations follow content → blank line → input box pattern
5. **Error Handling**: Graceful handling of streaming errors without display corruption

### Performance Verification
1. **No ANSI Conflicts**: No cursor positioning conflicts between streaming and input box
2. **Efficient Rendering**: Streaming updates don't cause excessive terminal redraws
3. **Memory Management**: Streaming state properly cleaned up after completion
4. **Responsive UI**: Input box repositioning happens smoothly without lag

## Files to Modify

### Primary Files
- **`cli/ui/display.ts`** - Core streaming display implementation
  - Redesign `startStreamingDisplay()`, `renderStreamingLines()`, `updateStreamingLine()`
  - Implement dynamic input box positioning during streaming
  - Replace ANSI-based rendering with line-by-line approach

### Secondary Files
- **`cli/index.ts`** - Streaming event handling
  - Update streaming callbacks to work with new display system
  - Ensure proper input management during streaming

### Testing Files
- **`integration-tests/streaming-display-test.ts`** - New test file for streaming behavior
  - Test multi-agent streaming layout
  - Verify input box positioning during streaming
  - Test transition from streaming to final display

## Risk Assessment

### High Risk Areas
1. **ANSI Escape Sequence Removal** - Major architectural change that could break terminal compatibility
2. **Input Box Positioning Logic** - Complex terminal positioning that varies across terminal types
3. **Multi-Agent Coordination** - Race conditions between multiple streaming agents

### Mitigation Strategies
1. **Incremental Implementation** - Test each phase thoroughly before proceeding
2. **Fallback Mechanisms** - Maintain simple console.log fallbacks for terminal positioning failures
3. **Cross-Platform Testing** - Test on different terminals (macOS Terminal, iTerm2, VSCode terminal)

## Implementation Priority

### Immediate (Phase 1-2)
Focus on fixing the core ANSI conflicts and input box positioning since these are the most visible issues affecting user experience.

### Short-term (Phase 3-4)
Address multi-agent coordination and transition smoothness to achieve the complete desired behavior.

### Long-term (Phase 5)
Polish input interaction and error handling for production-ready streaming display.

---

## Summary

The current streaming display implementation has fundamental architectural issues with ANSI escape sequence conflicts that prevent the desired layout from working. The fix requires:

1. **Coordinating ANSI operations** to prevent conflicts between streaming and input box
2. **Keeping input box visible** during streaming instead of hiding it
3. **Implementing proper region management** to separate streaming area from input area
4. **Adding synchronization** between multiple streaming agents to prevent display corruption

This is a significant architectural change but necessary to achieve the desired streaming display behavior described in the requirements.
