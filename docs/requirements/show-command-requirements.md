# Show Command Requirements

## Overview
User requested a `/show <agent-name>` command to display conversation history for a specific agent in a formatted way.

## Requirements
- Command syntax: `/show <agent-name>`
- Display conversation history for the specified agent
- Format: `● agent-name` header followed by Q/A pairs
- Q: User messages (from HUMAN or other agents)
- A: Assistant messages (from LLM)
- Handle cases where agent doesn't exist
- Handle cases where agent has no conversation history
- Use color coding for better readability
- Provide helpful error messages

## User's Exact Request
```
add `/show <agent-name>` command to display conversation history on the screen, like 

● a1
Q: ... (user message - from HUMAN or other agents)
A: ... (assistant message - from LLM)
```

Updated format requirement:
```
● a1
  Q: hi
  A: Hello! It's nice to meet you. ...

  Q: who are you
  A: I'm a computer 
```

The display should use unnumbered Q/A pairs with blank lines between conversation exchanges for better readability.

## Implementation Details
- Use existing `World.getAgentConversationHistory()` function
- Follow existing command pattern in `cli/commands/` directory
- Add to command registry in `cli/index.ts`
- Update help command documentation
- Color-coded output: cyan for questions, magenta for answers
- Error handling for non-existent agents and empty history
- Multi-line message support with proper indentation

## Files Created/Modified
1. **Created**: `cli/commands/show.ts` - Main implementation
2. **Modified**: `cli/index.ts` - Added command import and registry entry
3. **Modified**: `cli/commands/help.ts` - Added documentation
4. **Modified**: File comment blocks updated per coding standards

## Testing Scenarios Verified
- `/show a1` - Shows agent with no conversation history
- `/show nonexistent` - Handles non-existent agent gracefully
- `/show` - Handles missing agent name parameter
- `/help` - Shows command in help list

## Status
✅ **COMPLETED** - All requirements implemented and tested successfully
