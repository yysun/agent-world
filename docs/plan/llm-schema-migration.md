# LLM Chat Message Schema Migration Plan

## Overview
Migrate from custom memory.json schema to standard LLM chat message format to eliminate unnecessary mapping and ensure consistency across the system.

## Current State Analysis

### Current Memory Schema
```json
{
  "conversationHistory": [
    {
      "type": "incoming|outgoing",
      "sender": "HUMAN|agent_id",
      "content": "string",
      "messageId": "uuid",
      "timestamp": "ISO string",
      "inResponseTo": "uuid"
    }
  ],
  "lastActivity": "ISO string"
}
```

### Target LLM Schema
```json
{
  "messages": [
    {
      "role": "system|user|assistant",
      "content": "string",
      "name": "optional sender name",
      "timestamp": "ISO string"
    }
  ],
  "lastActivity": "ISO string"
}
```

## Implementation Steps

### Step 1: Update Type Definitions
- [ ] Add LLM message schema types to `src/types.ts`
- [ ] Define standard ChatMessage interface
- [ ] Add Zod schemas for validation

### Step 2: Update Memory Storage Functions
- [ ] Modify `addToAgentMemory` in `src/world.ts` to use LLM schema
- [ ] Update `getAgentConversationHistory` to return LLM-compatible messages
- [ ] Update memory initialization to use messages array
- [ ] Map message types: user messages, assistant responses, system messages

### Step 3: Update Agent Message Processing
- [ ] Remove `buildPrompt` in `src/agent.ts` 
- [ ] Update conversation history processing to use messages array
- [ ] Pass messages directly to LLM providers
- [ ] Simplify context preparation

### Step 4: Update LLM Integration
- [ ] Modify `streamingChat` in `src/llm.ts` to accept message arrays
- [ ] Remove prompt-based approach, use messages parameter
- [ ] Update AI SDK calls to use messages instead of system/prompt
- [ ] Ensure compatibility with all providers (OpenAI, Anthropic, Google, XAI, Ollama)

### Step 5: Update Show Command
- [ ] Modify `/show` command to work with new message format
- [ ] Update Q/A display logic for role-based messages
- [ ] Ensure proper message type detection (user vs assistant)

### Step 6: Test and Validate
- [ ] Update all tests to use new schema
- [ ] Test with all supported LLM providers
- [ ] Verify conversation continuity

## File Changes Required

### Core Files
1. **`src/types.ts`**
   - Add ChatMessage interface
   - Add message role enums
   - Update memory-related types

2. **`src/world.ts`**
   - Update `addToAgentMemory` function
   - Update `getAgentConversationHistory` function
   - Update memory structure initialization
   - Add message role mapping logic

3. **`src/agent.ts`**
   - Remove `buildPrompt` function complexity
   - Update conversation history processing
   - Simplify LLM context preparation

4. **`src/llm.ts`**
   - Update `streamingChat` to accept messages array
   - Modify AI SDK integration calls
   - Remove system/prompt separation

### CLI Files
5. **`cli/commands/show.ts`**
   - Update message display logic
   - Handle role-based message formatting

### Migration
6. **`scripts/migrate-memory.ts`** (new)
   - Migration utility for existing data
   - Backup and transform functionality

### Tests
7. **All test files**
   - Update to use new message schema
   - Test migration functionality

## Migration Strategy

### Role Mapping
- `type: "incoming"` + `sender: "HUMAN"` → `role: "user"`
- `type: "incoming"` + `sender: agent_id` → `role: "user"` (from other agents)
- `type: "outgoing"` → `role: "assistant"`
- System messages → `role: "system"`

### Data Preservation
- Preserve `timestamp` field
- Use `name` field for sender identification when needed
- Maintain `messageId` as metadata if required
- Archive original format as backup

## Benefits Post-Migration

### Technical Benefits
- **Zero Transformation**: Messages pass directly from storage to LLM
- **Provider Consistency**: All LLM providers receive identical format
- **Simplified Code**: Remove custom mapping and prompt building
- **Better Debugging**: Messages match exactly what LLMs see

### Operational Benefits
- **Reduced Errors**: No transformation = no transformation bugs
- **Performance**: Eliminate mapping overhead
- **Maintainability**: Standard schema easier to work with
- **Compatibility**: Future LLM features work immediately

## Risk Mitigation

### Data Safety
- **Backup Strategy**: Archive original memory.json files
- **Gradual Migration**: Migrate one agent at a time
- **Rollback Plan**: Keep original format alongside new format initially
- **Validation**: Verify message integrity after migration

### Compatibility
- **Provider Testing**: Test with all supported LLM providers
- **Conversation Continuity**: Ensure no context loss during migration
- **CLI Compatibility**: Verify show command and other features work
- **Test Coverage**: Update all tests before migration

## Success Criteria

- [ ] All existing conversation history migrated successfully
- [ ] No data loss during migration
- [ ] All LLM providers work with new format
- [ ] Show command displays conversations correctly
- [ ] All tests pass with new schema
- [ ] Performance improvement measurable
- [ ] No regression in agent responses or behavior
