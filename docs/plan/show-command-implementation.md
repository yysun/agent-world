# Show Command Implementation Plan

## Overview
Implement `/show <agent-name>` command to display conversation history for a specific agent in a formatted way.

## Requirements
- Display conversation history for a specific agent
- Format: `● agent-name` header followed by Q/A pairs
- Q: User messages (from HUMAN or other agents)
- A: Assistant messages (from LLM)
- Handle cases where agent doesn't exist
- Handle cases where agent has no conversation history

## Implementation Steps

### Step 1: Create show command function
- [x] Create `showCommand` function in `/cli/commands/` directory
- [x] Handle agent name parameter validation
- [x] Check if agent exists in current world
- [x] Load agent's memory/conversation history

### Step 2: Format conversation history display
- [x] Create formatting function for conversation history
- [x] Implement Q/A format with proper styling
- [x] Use colors for better readability (Q: questions, A: answers)
- [x] Handle empty conversation history gracefully

### Step 3: Integrate command into CLI
- [x] Add show command to command registry in `cli/index.ts`
- [x] Update help command to include `/show` documentation
- [x] Test command with existing agents

### Step 4: Error handling and edge cases
- [x] Handle non-existent agent names
- [x] Handle agents with no conversation history
- [x] Provide helpful error messages
- [x] Handle partial agent name matching (optional)

## File Changes Required

1. **Create new file**: `cli/commands/show.ts`
   - Main show command implementation
   - Conversation history formatting
   - Error handling

2. **Update**: `cli/index.ts`
   - Add show command to registry
   - Import show command function

3. **Update**: `cli/commands/help.ts`
   - Add `/show` command documentation

## Technical Details

### Display Format (Updated)
- Format: `Q: <user message>` / `A: <assistant message>` (no numbering)
- Use unnumbered Q/A pairs with blank lines between conversation exchanges for readability
- Example output:
  ```
  ● a1
    Q: hi
    A: Hello! It's nice to meet you. ...

    Q: who are you
    A: I'm a computer
  ```

- Use existing agent memory loading functions from `src/agent.ts`
- Leverage existing color utilities from `cli/utils/colors.ts`
- Follow existing command pattern and error handling
- Display format: bullet point with agent name, then Q/A pairs with indentation

## Testing Scenarios

- `/show a1` - Show history for existing agent with conversation
- `/show nonexistent` - Handle non-existent agent
- `/show a2` - Show history for agent with no conversation
- `/show` - Handle missing agent name parameter

## Dependencies

- Agent memory loading functions
- World agent lookup functions
- Color utilities for formatting
- Existing command infrastructure
