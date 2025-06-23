# Streaming Display Format Requirements

## Current Behavior
- Streaming responses display character-by-character in real-time
- All streaming content shows on multiple lines as it arrives
- No differentiation between streaming preview and final display

## Required Changes

### During Streaming (Single Line Preview)
- Limit streaming data display to one line per agent
- Show truncated preview with ellipsis (...) to indicate more content
- Format: `> agentName: preview content ......`
- Keep streaming content on same line, replacing previous content

Example:
```
> hi
> 
> a1: hi ...... 
> a2: hi ......
```

### After Streaming Complete (Full Multi-line Display)
- Re-display the complete message in full multi-line format
- Show all content without truncation
- Maintain proper formatting and line breaks
- Clear the single-line preview before showing full content

Example:
```
> hi
> 
> a1: hi ...... 
.......
> a2: hi ......
.......
```

## Implementation Requirements
- Modify streaming display logic in CLI index.ts
- Buffer complete response content during streaming
- Implement single-line preview with ellipsis truncation
- Replace preview with full content when streaming completes
- Maintain cursor position and clean display transitions
- Preserve existing real-time streaming feel while improving readability
