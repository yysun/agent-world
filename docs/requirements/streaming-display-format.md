# Streaming Display Format Requirements

## Current Behavior ✅ IMPLEMENTED
- Streaming responses display character-by-character in real-time with single-line previews
- Preview lines are properly hidden before showing full content
- Input and output tokens are displayed separately using arrow notation

## Required Changes ✅ COMPLETED

### During Streaming (Single Line Preview) ✅
- ✅ Limit streaming data display to one line per agent
- ✅ Show truncated preview with ellipsis (...) to indicate more content
- ✅ Format: `● agentName: preview content ... (↑inputTokens ↓outputTokens tokens)`
- ✅ Keep streaming content on same line, replacing previous content

Example:
```
> hi
● you: hi

● a1: Hello! How can I assist you today? ... (↑52 ↓7 tokens)
● a2: Hi there! I'm ready to help. ... (↑52 ↓6 tokens)
```

### After Streaming Complete (Full Multi-line Display) ✅
- ✅ Re-display the complete message in full multi-line format
- ✅ Show all content without truncation
- ✅ Maintain proper formatting and line breaks
- ✅ Hide the single-line preview before showing full content

Example:
```
> hi
● you: hi

✓ a1: Hello! How can I assist you today?

✓ a2: Hi there! I'm ready to help.
```

## Implementation Details ✅ COMPLETED

### Token Display Enhancement ✅
- ✅ **Input Tokens (↑)**: Estimated from system prompt and conversation context
- ✅ **Output Tokens (↓)**: Counted in real-time from response content
- ✅ **Arrow Notation**: ↑ for input tokens, ↓ for output tokens
- ✅ **Fallback**: Shows simple token count when estimation unavailable

### Technical Implementation ✅
- ✅ Modified streaming display logic in `cli/streaming/streaming-display.ts`
- ✅ Added token estimation from conversation context
- ✅ Implemented single-line preview with arrow token display
- ✅ Enhanced preview clearing to hide all lines before final display
- ✅ Maintained cursor position and clean display transitions
- ✅ Preserved existing real-time streaming feel while improving readability

### Files Modified ✅
- ✅ `cli/streaming/streaming-display.ts` - Core streaming display logic
- ✅ `cli/index.ts` - Token estimation and event handling
- ✅ `src/llm.ts` - Token usage capture (though providers don't support it for streaming)
- ✅ `src/types.ts` - Added usage field to SSEEventPayload interface

## Limitations and Notes

### Token Accuracy
- **Input tokens**: Estimated from system prompt and conversation context (approximate)
- **Output tokens**: Real-time count from response content (accurate)
- **Reason**: Most LLM providers don't return exact token usage for streaming responses
- **Solution**: Estimation provides useful visual distinction between input/output

### Provider Support
- Token usage information varies by LLM provider
- OpenAI, Anthropic, and others typically don't provide streaming token usage
- The implementation gracefully falls back to simple counts when detailed usage unavailable

## Status: ✅ COMPLETED

All requirements have been successfully implemented. The streaming display now provides:
1. Clean single-line previews during streaming
2. Proper preview hiding before final content display  
3. Input/output token distinction with intuitive arrow notation
4. Improved readability while maintaining real-time streaming performance
