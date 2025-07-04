# Implementation Plan: Paragraph Beginning Mention Rule Update

## Overview
Update the agent mention detection system to only respond to @mentions that appear at the beginning of paragraphs, not those in the middle of sentences or text.

## Current Analysis

### Current Implementation
- `extractMentions()` in `core/utils.ts` extracts first @mention using regex
- `shouldAgentRespond()` in `core/agent-events.ts` checks if agent ID matches first mention
- No position validation - @mentions work anywhere in text
- First-mention-only logic prevents multiple agent responses

### Key Files
- `core/utils.ts` - Mention extraction logic
- `core/agent-events.ts` - Agent response decision logic  
- `tests/core/utils.test.ts` - Existing mention tests
- `tests/core/agent-events.test.ts` - Agent response tests

## Implementation Steps

### Phase 1: Core Logic Implementation

#### Step 1: Create New Mention Detection Function ✅ COMPLETE
**File**: `core/utils.ts`
**Estimated Effort**: 2-3 hours

- [x] Create `extractParagraphBeginningMentions()` function
- [x] Implement regex pattern to detect @mentions at paragraph start
- [x] Pattern should match: start of string OR after newline + optional whitespace
- [x] Return array of valid mentions (case-insensitive, lowercase)
- [x] Handle edge cases: empty content, no mentions, malformed mentions
- [x] Preserve existing `extractMentions()` function for backward compatibility

**Implementation Details**:
```typescript
export function extractParagraphBeginningMentions(content: string): string[] {
  // Pattern: @mention at start of string or after newline + optional whitespace
  // Should match: "^@mention" or "\n\s*@mention"
}
```

#### Step 2: Update Agent Response Logic ✅ COMPLETE
**File**: `core/agent-events.ts`
**Estimated Effort**: 1-2 hours

- [x] Update `shouldAgentRespond()` function to use new mention detection
- [x] Replace `extractMentions()` call with `extractParagraphBeginningMentions()`
- [x] Maintain existing logic flow and turn limit checks
- [x] Preserve case-insensitive agent ID matching
- [x] Keep first-mention-only logic for multiple valid mentions

**Changes Required**:
```typescript
// Replace this line:
const mentions = extractMentions(messageEvent.content);

// With this:
const mentions = extractParagraphBeginningMentions(messageEvent.content);
```

#### Step 3: Preserve Backward Compatibility ✅ COMPLETE
**File**: `core/agent-events.ts` (auto-mention logic)
**Estimated Effort**: 1 hour

- [x] Verify auto-mention reply logic still uses original `extractMentions()`
- [x] Ensure agent-to-agent mention replies work correctly
- [x] Test that memory saving and other features are unaffected
- [x] Confirm turn limit reset and other filtering logic unchanged

### Phase 2: Testing and Validation

#### Step 4: Update Existing Tests ✅ COMPLETE
**File**: `tests/core/utils.test.ts`
**Estimated Effort**: 2-3 hours

- [x] Add comprehensive tests for `extractParagraphBeginningMentions()`
- [x] Test valid cases: start of string, after newline, with whitespace
- [x] Test invalid cases: mid-sentence, after text, in middle of paragraph
- [x] Test edge cases: empty content, multiple newlines, mixed valid/invalid
- [x] Verify existing `extractMentions()` tests still pass

**Test Cases to Add**:
```typescript
describe('extractParagraphBeginningMentions', () => {
  test('should extract mentions at start of string');
  test('should extract mentions after newlines');  
  test('should ignore mentions in middle of text');
  test('should handle multiple paragraphs correctly');
  test('should be case-insensitive');
  test('should handle whitespace after newlines');
});
```

#### Step 5: Update Agent Response Tests ✅ COMPLETE
**File**: `tests/core/agent-events.test.ts`
**Estimated Effort**: 2-3 hours

- [x] Update existing `shouldAgentRespond()` tests for new behavior
- [x] Add tests for paragraph beginning mention validation
- [x] Test that mid-paragraph mentions don't trigger responses
- [x] Verify turn limit and other logic still works correctly
- [x] Test multi-line messages with valid/invalid mentions

**New Test Scenarios**:
```typescript
test('should respond to mentions at paragraph beginning');
test('should not respond to mentions in middle of text');
test('should handle multi-line messages correctly');
test('should preserve turn limit logic with new mention rule');
```

#### Step 6: Integration Testing ✅ COMPLETE
**File**: `integration-tests/paragraph-mention-test.ts`
**Estimated Effort**: 2-3 hours

- [x] Create comprehensive integration test
- [x] Test real agent conversations with new mention rules
- [x] Verify agent memory saving works with new logic
- [x] Test agent-to-agent communication patterns
- [x] Validate WebSocket message handling with new rules

### Phase 3: Documentation and Cleanup

#### Step 7: Update Documentation
**Files**: README.md, docs/ files
**Estimated Effort**: 1-2 hours

- [ ] Update agent communication examples in README.md
- [ ] Update documentation about mention rules
- [ ] Add migration notes for existing users
- [ ] Update API documentation if applicable
- [ ] Create user guide for new mention behavior

#### Step 8: Code Review and Refinement
**Estimated Effort**: 1-2 hours

- [ ] Review all changes for consistency and quality
- [ ] Ensure error handling is proper throughout
- [ ] Verify performance impact is minimal
- [ ] Check for any edge cases missed
- [ ] Validate TypeScript types are correct

## Technical Implementation Details

### Regex Pattern Design
```typescript
// Pattern to match @mentions at paragraph beginning:
const paragraphMentionRegex = /(?:^|\n\s*)@(\w+(?:[-_]\w+)*)/g;

// Explanation:
// (?:^|\n\s*) - Start of string OR newline followed by optional whitespace
// @ - Literal @ symbol
// (\w+(?:[-_]\w+)*) - Capture group for mention name (word chars, hyphens, underscores)
// /g - Global flag to find all matches
```

### Function Implementation Strategy
1. **New Function**: Create `extractParagraphBeginningMentions()` alongside existing `extractMentions()`
2. **Backward Compatibility**: Keep original function for auto-mention replies and other features
3. **Targeted Usage**: Only use new function in `shouldAgentRespond()` for response logic
4. **Consistent Interface**: Return same array format as existing function

### Testing Strategy
1. **Unit Tests**: Comprehensive coverage of new mention detection logic
2. **Integration Tests**: End-to-end agent conversation testing
3. **Regression Tests**: Ensure existing functionality still works
4. **Edge Case Testing**: Handle malformed input and unusual scenarios

## Dependencies
- Existing mention extraction logic in `core/utils.ts`
- Agent response pipeline in `core/agent-events.ts`
- Current test suite structure
- WebSocket message handling system

## Success Criteria

### Functional Requirements
- ✅ Agents respond only to paragraph-beginning @mentions
- ✅ Mid-paragraph @mentions are ignored for response triggering
- ✅ Existing agent communication patterns preserved where appropriate
- ✅ Memory saving and turn limits work unchanged
- ✅ Auto-mention replies continue to function

### Quality Requirements
- ✅ All existing tests continue to pass
- ✅ New functionality has comprehensive test coverage
- ✅ No performance regression in message processing
- ✅ Clean, maintainable code with proper TypeScript types
- ✅ Clear documentation for the new behavior

## Risk Mitigation

### Breaking Changes
- **Risk**: Existing agent conversations may stop working
- **Mitigation**: Thorough testing and clear migration documentation

### Performance Impact
- **Risk**: New regex processing could slow message handling
- **Mitigation**: Optimize regex pattern and benchmark performance

### Edge Cases
- **Risk**: Unusual message formats could break mention detection
- **Mitigation**: Comprehensive edge case testing and error handling

## Timeline Estimate

### Development Phase (8-12 hours)
- **Phase 1**: Core Logic (4-6 hours)
- **Phase 2**: Testing (6-9 hours) 
- **Phase 3**: Documentation (2-3 hours)

### Total Effort: 12-18 hours across 2-3 days

## Next Steps
1. **Confirmation**: Wait for approval of this implementation plan
2. **Development**: Begin with Phase 1, Step 1 implementation
3. **Iterative Testing**: Test each step before proceeding to next
4. **Documentation**: Update docs after core functionality is complete
