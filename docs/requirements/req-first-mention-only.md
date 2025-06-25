# First Mention Only - Agent Response Requirements

## Overview
Modify mention detection to ensure only the **first** mentioned agent responds to a message containing multiple @mentions.

## Current Behavior
- Message: "hi @a1 say hi to @a2" 
- Result: Both `a1` and `a2` respond
- Problem: Multiple agents responding to same message creates noise

## Required Behavior
- Message: "hi @a1 say hi to @a2"
- Result: Only `a1` responds (first mention)
- Benefit: Clear conversation flow, single agent response

## Technical Requirements

### Mention Priority Rules
1. **First Mention Only**: Only the first @mention in a message determines the target agent
2. **Order Preservation**: Left-to-right parsing order must be maintained
3. **Case Insensitive**: @A1 and @a1 should be treated equally
4. **Valid Mentions Only**: Skip malformed mentions when finding first valid mention

### Message Type Handling
- **Human Messages**: 
  - No mentions → All agents respond (public message)
  - Has mentions → Only first mentioned agent responds
- **Agent Messages**: 
  - Only first mentioned agent responds (existing behavior maintained)
- **System Messages**: 
  - All agents respond (existing behavior maintained)

### Edge Cases
- Empty message: No response
- Only malformed mentions: Treat as public message
- First mention is malformed: Use first valid mention
- Agent mentions self first: Skip to next valid mention

## Implementation Scope
- Update `shouldRespondToMessage()` function in `src/agent.ts`
- Modify mention detection logic to return first valid mention only
- Maintain existing debug logging with updated messages
- Update related tests to validate first-mention-only behavior

## Success Criteria
1. Message "hi @a1 say hi to @a2" → only a1 responds
2. Message "hello @invalid @a2 how are you" → only a2 responds  
3. Message "hey everyone" → all agents respond (public)
4. Message "@a1 tell @a2 that @a3 says hi" → only a1 responds
5. All existing tests continue to pass

## Testing Requirements
- Unit tests for first mention extraction
- Integration tests for multi-agent scenarios
- Edge case tests for malformed mentions
- Regression tests for public message behavior
