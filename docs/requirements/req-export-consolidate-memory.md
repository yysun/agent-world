# Requirements: Export Command, Display Consolidation, and Memory Management

## Overview
Enhance the CLI with conversation export capabilities, unified message display, and comprehensive message memory persistence.

## 1. Export Command Requirements

### 1.1 Command Syntax
- Command: `/export <filename>`
- Auto-append `.md` extension if not provided
- Save to current working directory
- Display export location and success confirmation

### 1.2 Export Format
- Markdown format with proper structure
- Include conversation metadata (world name, export timestamp, message count)
- Chronological message ordering with timestamps
- Clear sender identification with message type indicators
- Readable format suitable for documentation and sharing

### 1.3 Export Content
- All messages from current session for the active world
- Human input messages with "you" as sender
- Agent responses with agent names
- System messages (turn limits, pass commands, errors)
- Timestamp for each message entry
- Exclude debug messages unless explicitly included

## 2. Display Function Consolidation Requirements

### 2.1 Unified Interface
- Single display function for all message types
- Consistent formatting across human, agent, and system messages
- Standardized color coding and emoji indicators
- Support for both streaming and final message display

### 2.2 Message Type Handling
- **Human messages**: Orange dot `●` with "you" as sender
- **Agent messages**: Green dot `●` with agent name
- **System messages**: Red dot `●` with "system" as sender
- **Error messages**: Red X `✗` for failures
- **Success messages**: Green checkmark `✓` for completions

### 2.3 Display Consistency
- Same visual format whether message is from streaming or direct input
- Proper spacing and line breaks for readability
- Handle special characters and long content gracefully

## 3. Message Memory System Requirements

### 3.1 Memory Persistence
- Store all conversation messages in memory during session
- Maintain message order and timestamps
- Associate messages with specific world contexts
- Persist across CLI commands within same session

### 3.2 Message Structure
- Unique message identifier
- Timestamp (creation time)
- Sender name and type classification
- Message content (full text)
- World association
- Optional metadata (message source, type flags)

### 3.3 Memory Operations
- Add new messages from all sources automatically
- Retrieve messages by world, time range, or sender
- Clear messages for specific world or entire session
- Memory-efficient storage for long conversations

## 4. Integration Requirements

### 4.1 Message Capture Points
- Human input from CLI interface
- Agent responses from LLM processing
- System notifications (turn limits, control passing)
- Command execution results and errors
- Streaming status updates (start/end notifications)

### 4.2 Backward Compatibility
- Existing CLI functionality unchanged
- Current streaming display behavior preserved
- No breaking changes to command interface
- Maintain current error handling patterns

### 4.3 Performance
- Memory storage should not impact CLI responsiveness
- Export operation should complete quickly for normal conversation sizes
- Display updates should remain real-time during streaming

## 5. Error Handling Requirements

### 5.1 Export Error Cases
- Invalid filename characters or path
- File permission errors
- Disk space limitations
- Network interruptions during export

### 5.2 Memory Error Cases
- Memory allocation failures for large conversations
- Corrupted message data
- Missing world context
- Timestamp parsing errors

### 5.3 Display Error Cases
- Terminal control sequence failures
- Long message content truncation
- Special character encoding issues
- Concurrent display updates

## 6. User Experience Requirements

### 6.1 Export Feedback
- Clear success confirmation with file location
- Progress indication for large exports
- Helpful error messages with suggested solutions
- File overwrite warnings and options

### 6.2 Display Quality
- Clean, readable message formatting
- Proper alignment and spacing
- Consistent visual hierarchy
- Real-time updates without flickering

### 6.3 Memory Transparency
- Memory usage should be invisible to user
- No noticeable performance impact
- Automatic cleanup when appropriate
- Optional memory status in debug mode

## 7. Technical Constraints

### 7.1 File System
- Cross-platform filename compatibility
- UTF-8 encoding for international characters
- Reasonable file size limits (configurable)
- Safe file operation practices

### 7.2 Memory Management
- Configurable message retention limits
- Efficient string storage and retrieval
- Garbage collection friendly implementation
- Optional persistence to disk for recovery

### 7.3 CLI Integration
- Function-based implementation (no classes)
- Static imports only (no dynamic modules)
- TypeScript compatibility with existing codebase
- Minimal external dependencies

## 8. Success Criteria

### 8.1 Export Functionality
- ✅ User can export conversation to readable markdown file
- ✅ Export includes all message types with proper formatting
- ✅ Export completes successfully for conversations up to 1000 messages
- ✅ Error handling provides clear feedback and recovery options

### 8.2 Display Consolidation
- ✅ All message types use consistent visual formatting
- ✅ Display functions are unified and maintainable
- ✅ No regression in streaming display quality
- ✅ Color coding and indicators work across all message sources

### 8.3 Memory Management
- ✅ All messages captured automatically without user intervention
- ✅ Memory storage supports full session conversation history
- ✅ Message retrieval is fast and accurate
- ✅ Memory usage remains reasonable for extended sessions

## 9. Future Considerations

### 9.1 Export Enhancements
- Multiple export formats (JSON, CSV, HTML)
- Selective export by time range or sender
- Automatic periodic exports
- Cloud storage integration

### 9.2 Memory Features
- Persistent storage across CLI sessions
- Message search and filtering
- Conversation analytics and statistics
- Message encryption for sensitive content

### 9.3 Display Improvements
- Customizable color themes
- Message threading and grouping
- Enhanced streaming visualizations
- Accessibility features for screen readers
