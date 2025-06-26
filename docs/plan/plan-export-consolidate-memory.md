# Implementation Plan: Export Command, Display Consolidation, and Memory Management

## Overview
This plan implements three key features:
1. `/export <filename>` command to save all messages in markdown format
2. Consolidate display functions for user input, system messages, and agent messages
3. Save all messages in memory for persistence and export functionality

## 1. Message Memory System

### 1.1 CLI Message Store
- Create a CLI-specific message store in `cli/message-store.ts`
- Structure: Array of message objects with standardized format
- Message format:
  ```typescript
  interface StoredMessage {
    id: string;
    timestamp: Date;
    sender: string;
    senderType: 'human' | 'agent' | 'system';
    content: string;
    worldName: string;
  }
  ```

### 1.2 Message Capture Points
- Capture ALL messages through the Unified Display Function
- Single capture point ensures consistency and accuracy
- Automatically captures human input, agent responses, system messages
- No need for multiple capture points across different modules

### 1.3 Storage Functions
- `addMessageToStore(message: StoredMessage): void`
- `getMessagesForWorld(worldName: string): StoredMessage[]`
- `getMessagesSinceTime(worldName: string, since: Date): StoredMessage[]`
- `clearMessagesForWorld(worldName: string): void`

## 2. Display Function Consolidation

### 2.1 Unified Display Function
- Replace `displayUserInput`, `displayMessage`, and system message displays
- Single function: `displayFormattedMessage(message: DisplayMessage)`
- Structure:
  ```typescript
  interface DisplayMessage {
    sender: string;
    senderType: 'human' | 'agent' | 'system';
    content: string;
    dotColor?: string; // Override default dot color
  }
  ```

### 2.2 Color and Emoji Mapping
- Human messages: Orange dot `●`
- Agent messages: Green dot `●` (or cyan during streaming)
- System messages: Red dot `●`
- Error messages: Red X `✗`
- Success messages: Green checkmark `✓`

### 2.3 Update Call Sites
- Update CLI `index.ts` to use unified display
- Update streaming display to use unified function
- Update all command modules to use unified display

## 3. Export Command Implementation

### 3.1 Command Structure
- Command: `/export <filename>`
- Optional extension: If no `.md` extension, append it
- Save location: Current working directory or configurable export directory

### 3.2 Markdown Format
```markdown
# Agent World Conversation Export
**World:** {worldName}  
**Exported:** {timestamp}  
**Total Messages:** {count}

---

## Conversation History

### {timestamp} - {senderType}: {sender}
{content}

### {timestamp} - agent: agent1
{response content}

---

*Exported from Agent World CLI*
```

### 3.3 Export Function
- `exportConversation(worldName: string, filename: string): Promise<void>`
- Format messages as markdown
- Include metadata (world name, export time, message count)
- Handle file writing with error handling
- Show success/error feedback

### 3.4 Command Integration
- Add export command to CLI command registry
- Validate filename parameter
- Handle file exists scenarios (overwrite/append options)
- Display export location and success message

## 4. Implementation Steps

### Step 1: Create Message Store System
- [x] Create `cli/message-store.ts` with interfaces and functions
- [ ] Add message store initialization to CLI startup
- [ ] Test basic add/get functionality

### Step 2: Integrate Message Capture
- [ ] Add message capture to unified display function in streaming-display.ts
- [ ] Ensure all message types flow through the unified display function
- [ ] Test message capture from single source point

### Step 3: Consolidate Display Functions
- [ ] Create unified `displayFormattedMessage()` in streaming-display.ts
- [ ] Replace `displayUserInput()` calls with unified function
- [ ] Replace `displayMessage()` calls with unified function
- [ ] Update system message displays to use unified function
- [ ] Test display formatting consistency

### Step 4: Implement Export Command
- [ ] Create `cli/commands/export.ts` with export logic
- [ ] Add markdown formatting function
- [ ] Add file writing with error handling
- [ ] Register export command in CLI command registry
- [ ] Test export functionality with sample conversations

### Step 5: Integration Testing
- [ ] Test full workflow: conversation → memory → export
- [ ] Test export with different message types
- [ ] Test export file format and readability
- [ ] Test error scenarios (invalid filenames, permissions)

### Step 6: Documentation Update
- [ ] Update CLI help command with export command
- [ ] Update file header comments in modified files
- [ ] Add export format documentation

## 5. File Modifications Required

### New Files:
- `cli/message-store.ts` - CLI session message storage system
- `cli/commands/export.ts` - Export command implementation

### Modified Files:
- `cli/streaming/streaming-display.ts` - Consolidate display functions and add message capture
- `cli/index.ts` - Update to use unified display and add export command
- `cli/commands/help.ts` - Add export command documentation

## 6. Dependencies and Considerations

### File System Access:
- Use Node.js `fs.promises` for async file operations
- Handle file permissions and disk space errors
- Validate filename for filesystem compatibility

### Memory Management:
- Consider message store size limits for long-running sessions
- Optional message pruning for old conversations
- Memory-efficient message formatting for large exports

### Security:
- Sanitize filenames to prevent path traversal
- Validate export directory permissions
- Handle sensitive content in exported files

## 7. Testing Strategy

### Unit Tests:
- Message store add/get/clear functions
- Markdown formatting with various message types
- Filename validation and sanitization

### Integration Tests:
- Full conversation capture and export workflow
- Display function consistency across message types
- Export with concurrent streaming scenarios

### Manual Testing:
- Export large conversations
- Test with special characters in messages
- Test file overwrite scenarios
- Verify markdown format in different viewers
