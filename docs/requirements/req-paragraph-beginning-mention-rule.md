# Agent Mention Rule Update - Paragraph Beginning Requirement

## What
Update the first mention rule for agent responding to messages so that instead of matching the first extracted @mention with agent ID, the system should search all extracted @mentions, but the @mention must be at the beginning of a paragraph.

## Current Behavior
- System extracts first @mention from message content using `extractMentions()`
- Agent responds if their ID matches the first extracted @mention
- @mentions can appear anywhere in the content (middle of sentences, etc.)
- Example: "hi @pro, how are you?" - @pro would respond (current behavior)

## Required Behavior  
- System should search ALL extracted @mentions from message content
- Agent responds only if their ID appears in an @mention that is at the beginning of a paragraph
- @mentions in the middle of text or after other words should be ignored for response triggering
- @mentions must be the first non-whitespace characters of a paragraph/line

## Valid vs Invalid Mention Examples

### Valid Mentions (should trigger agent response)
```
@pro, what do you think about this?
```

```
Hello everyone!

@pro, please respond to this question.
```

```
@pro
Please help with this task.
```

### Invalid Mentions (should NOT trigger agent response)
```
hi @pro, what do you think?
```

```
I think @pro should handle this.
```

```
Please ask @pro about this.
```

## Technical Requirements

### R1. Mention Detection Logic
- Extract ALL @mentions from message content (not just first)
- Check each @mention's position in the text
- @mention is valid only if it appears at the beginning of a paragraph/line
- Paragraph beginning means: start of string OR after newline + optional whitespace

### R2. Agent Response Logic  
- Agent responds if ANY valid (paragraph-beginning) @mention matches their ID
- Invalid @mentions (mid-paragraph) should be ignored for response triggering
- Maintain existing case-insensitive matching
- Preserve existing turn limit and other filtering logic

### R3. Backward Compatibility
- Maintain existing mention extraction for other purposes (auto-mention replies, etc.)
- Preserve existing agent communication patterns
- Keep existing first-mention-only logic for multiple valid mentions in same message

## Implementation Scope

### Files to Update
1. `core/utils.ts` - Update `extractMentions()` function or create new function
2. `core/agent-events.ts` - Update mention checking logic in `shouldAgentRespond()`
3. Tests - Update existing tests and add new paragraph-beginning tests

### Function Changes Required
- Create new function `extractParagraphBeginningMentions()` OR
- Modify existing `extractMentions()` to include position information OR  
- Update `shouldAgentRespond()` to validate mention positions

## Success Criteria

### Functional Requirements
- Agent responds to @mentions only when they appear at paragraph beginning
- Agent ignores @mentions that appear mid-sentence or mid-paragraph
- Existing valid mention patterns continue to work
- Invalid mention patterns no longer trigger responses

### Test Cases
- "@@pro, hello" → @pro responds ✓
- "hi @pro, hello" → @pro does NOT respond ✓
- Multi-line with valid mention → agent responds ✓
- Multi-line with invalid mention → agent does NOT respond ✓
- Multiple valid mentions → first mentioned agent responds ✓
- Mixed valid/invalid mentions → only valid mentions count ✓

## Out of Scope
- Changes to mention syntax (@mention format)
- Changes to agent memory saving (all messages still saved)
- Changes to turn limit logic
- Changes to auto-mention reply behavior
- Changes to case sensitivity handling

## Dependencies
- Existing mention extraction logic in `core/utils.ts`
- Agent response logic in `core/agent-events.ts`
- Message processing pipeline
- Existing test suite for mention handling

## Risks and Considerations
- Breaking existing agent conversations that rely on mid-paragraph mentions
- Need to communicate rule change to users
- Potential impact on agent collaboration patterns
- May need migration guide for existing world configurations

## Priority
High - This is a core behavior change that affects agent communication patterns
