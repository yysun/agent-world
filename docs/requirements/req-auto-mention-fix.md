# Auto-Mention Functionality Fix Requirements

**Status: ✅ COMPLETED** - All requirements implemented and tested successfully. All 17 test cases pass.

## Problem Statement
The current auto-mention functionality in `processAgentMessage` has several critical bugs:

1. **Memory vs Published Response Mismatch**: The original LLM response is saved to memory, but a modified response (with auto-mentions) is published to the world. This creates inconsistency between what's stored and what's actually sent.

2. **Limited Auto-Mention Scope**: Auto-mention only works for agent-to-agent communication, not agent-to-human replies, which limits natural conversation flow.

3. **Poor Mention Detection**: Uses simple string inclusion check without word boundaries, leading to false positives and incorrect behavior.

4. **Aggressive Self-Mention Removal**: Removes self-mentions anywhere in the response using regex with word boundaries, which can remove legitimate mentions in quoted text or examples.

5. **Inconsistent Auto-Mention Logic**: Doesn't always prepend @sender at the beginning, and the logic for when to add mentions is unclear.

6. **Self-Mention Bug**: Agents can auto-mention themselves, which should never happen.

## Functional Requirements

### FR1: Memory Consistency
- **FR1.1**: The system MUST save the final published response to agent memory (not the original LLM response)
- **FR1.2**: The assistant message stored in memory MUST be identical to the message published to the world
- **FR1.3**: Memory updates MUST occur after all auto-mention processing is complete

### FR2: Auto-Mention Behavior
- **FR2.1**: The system MUST auto-mention humans when agents reply to them
- **FR2.2**: The system MUST auto-mention agents when agents reply to them
- **FR2.3**: The system MUST NOT auto-mention system messages
- **FR2.4**: The system MUST use extractParagraphBeginningMentions logic to detect @sender at response start
- **FR2.5**: The system MUST prepend @sender if not detected at start, preserving case if found elsewhere
- **FR2.6**: The system MUST trim response whitespace before auto-mention processing

### FR3: Mention Detection Logic
- **FR3.1**: The system MUST use same logic as extractParagraphBeginningMentions for mention detection
- **FR3.2**: Mention detection MUST be case-insensitive for comparison
- **FR3.3**: The system MUST preserve original case of existing mentions
- **FR3.4**: The system MUST only check response start (first paragraph beginning)

### FR4: Self-Mention Prevention
- **FR4.1**: The system MUST always run self-mention removal as safety measure
- **FR4.2**: The system MUST remove all consecutive @agentId mentions from response start
- **FR4.3**: The system MUST preserve self-mentions in quoted text or examples in the middle/end of responses
- **FR4.4**: Self-mention removal MUST use case-insensitive matching
- **FR4.5**: The system MUST handle multiple self-mentions at response beginning

### FR5: Edge Case Handling
- **FR5.1**: The system MUST handle empty responses gracefully (no auto-mention)
- **FR5.2**: The system MUST handle responses with only whitespace (no auto-mention)
- **FR5.3**: The system MUST handle responses that are already just "@sender" (no duplication)
- **FR5.4**: The system MUST handle case-insensitive sender matching
- **FR5.5**: The system MUST handle null/undefined sender values
- **FR5.6**: The system MUST handle responses where sender equals agent ID (no auto-mention)

## Technical Requirements

### TR1: Implementation Details
- **TR1.1**: Auto-mention processing MUST occur before memory storage
- **TR1.2**: Self-mention removal MUST occur before auto-mention addition (prevents double auto-mention)
- **TR1.3**: Use extractParagraphBeginningMentions logic for @sender detection at response start
- **TR1.4**: Remove multiple self-mentions using pattern `^(@agentId\\s*)+` (case-insensitive)
- **TR1.5**: Processing order: 1) Trim response, 2) Remove self-mentions, 3) Check @sender at start, 4) Add @sender if needed, 5) Save to memory, 6) Publish

### TR2: Performance Requirements
- **TR2.1**: Auto-mention processing MUST not add significant latency to message processing
- **TR2.2**: Regex operations MUST be optimized for common use cases

## Test Requirements

### TR3: Comprehensive Unit Tests
The system MUST have unit tests covering all scenarios:

#### Basic Auto-Mention Cases
- **TC1**: Agent replying to human (should auto-mention human)
- **TC2**: Agent replying to agent (should auto-mention agent)
- **TC3**: Agent replying to system (should not auto-mention)

#### Mention Detection Cases
- **TC4**: Response already has @sender at beginning (should not duplicate)
- **TC5**: Response has @sender in middle (should still prepend)
- **TC6**: Response has partial sender name match (should not match)
- **TC7**: Case-insensitive sender matching

#### Self-Mention Prevention Cases
- **TC8**: Agent trying to mention themselves (should be prevented)
- **TC9**: Self-mention at beginning vs middle/end (only remove at beginning)
- **TC10**: Self-mention in quoted text (should be preserved)

#### Edge Cases
- **TC11**: Empty response
- **TC12**: Whitespace-only response
- **TC13**: Response is just "@sender"
- **TC14**: Null/undefined sender
- **TC15**: Sender equals agent ID

#### Memory Consistency Cases
- **TC16**: Published message equals stored message
- **TC17**: Auto-mention changes are reflected in memory
- **TC18**: Original LLM response vs final response consistency

#### Additional Test Cases
- **TC19**: Trimming with existing mention: `"  @sender hello"` → `"@sender hello"`
- **TC20**: Case preservation: `"@SENDER hello"` → `"@SENDER hello"` (no change)
- **TC21**: Multiple self-mentions: `"@alice @alice hello"` → `"hello"`
- **TC22**: Mixed case self-mentions: `"@Alice @ALICE hello"` → `"hello"`
- **TC23**: Self-mention with other mentions: `"@alice @bob hello"` → `"@bob hello"`

## Success Criteria

### SC1: Functional Success
- All unit tests pass with 100% coverage of auto-mention logic
- Memory and published messages are identical in all scenarios
- Agents never mention themselves under any circumstances
- Auto-mention works correctly for both human and agent replies

### SC2: Technical Success
- Mention detection using extractParagraphBeginningMentions logic prevents all false positives
- Self-mention removal only affects the beginning of responses
- No performance degradation in message processing
- All edge cases handled gracefully

### SC3: Integration Success
- No regression in existing functionality
- Proper integration with existing memory storage system
- Compatible with current event publishing system

## Out of Scope

### OS1: Features Not Included
- Changing the overall message processing flow
- Modifying the LLM call logic or streaming behavior
- Changing the turn limit functionality
- Modifying the pass command handling
- Adding new mention syntax or formats

### OS2: Future Enhancements
- Configurable auto-mention behavior per agent
- Support for multiple mentions in auto-mention
- Custom mention formatting options
- Historical mention tracking or analytics

## Implementation Notes

### IN1: Critical Bug Fixes
The current implementation has a critical bug where the original LLM response is saved to memory, but the modified response (with auto-mentions) is published. This creates a mismatch between stored and published content.

### IN2: Self-Mention Bug Root Cause
The self-mention bug likely occurs because the auto-mention logic doesn't properly check if the sender is the agent itself, or the self-mention removal logic is not working correctly.

### IN3: extractParagraphBeginningMentions Logic
Using the same logic as extractParagraphBeginningMentions is crucial for consistency with shouldAgentRespond behavior and proper mention detection at paragraph boundaries.
