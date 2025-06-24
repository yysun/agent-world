# File Structure Specification Requirements

## Overview
The Agent World system must maintain a hierarchical file structure with clear separation of concerns for worlds, agents, and their associated data.

## Required File Structure

```
data/
└── worlds/
    └── {worldName}/
        ├── config.json                    # World metadata and configuration
        └── agents/
            └── {agentName}/
                ├── config.json            # Agent configuration
                ├── system-prompt.md       # Editable system prompt
                └── memory.json            # Conversation history
```

## File Organization Requirements

### World Level (`data/worlds/{worldName}/`)
- **Directory naming**: Use kebab-case world identifiers as folder names
- **config.json**: Contains world metadata including:
  - World name
  - Creation timestamp
  - World-specific configuration
  - Metadata object for extensibility

### Agent Level (`data/worlds/{worldName}/agents/{agentName}/`)
- **Directory naming**: Use kebab-case agent identifiers as folder names
- **Three separate files per agent** (strict separation of concerns):

#### 1. `config.json` - Agent Configuration
- Core agent settings (name, model, provider, personality)
- Agent metadata (ID, type, status, timestamps)
- LLM provider configuration (model, temperature, maxTokens)

#### 2. `system-prompt.md` - Editable System Prompt
- Full system prompt in markdown format
- Human-readable and editable
- Separate from configuration for easy modification
- Default content: "You are {agentName}, an AI agent."

#### 3. `memory.json` - Conversation History
- Conversation history LLM
- LLM-compatible message format with roles (user, assistant, system)
- No Automatic cleanup - code will use last 20 messages - summarize if needed

## Additional Structure Requirements

### Optional Subdirectories
- **`archives/`** (within agent directories): For archived memory files
  - Format: `memory_archive_{timestamp}.json`
  - Created when memory is cleared
  - Preserves conversation history

### File Naming Conventions
- **World directories**: Use kebab-case conversion of world names
- **Agent directories**: Use kebab-case conversion of agent names/IDs
- **Config files**: Always `config.json`
- **System prompts**: Always `system-prompt.md`
- **Memory files**: Always `memory.json`
- **Archive files**: `memory_archive_{ISO-timestamp}.json`

## Data Separation Principles

1. **Configuration vs Content**: Agent config separate from system prompt content
2. **Static vs Dynamic**: Configuration is static, memory is dynamic
3. **Human-readable**: System prompts in markdown for easy editing
4. **Machine-readable**: Config and memory in structured JSON
5. **Archival**: Historical data preserved in separate archive files

## Implementation Requirements

### Directory Creation
- All directories must be created automatically when needed
- Use `ensureDirectory()` function for safe directory creation
- Handle race conditions and permission errors gracefully

### File Operations
- Atomic operations where possible (write to temp, then rename)
- Proper error handling with rollback capabilities
- Consistent UTF-8 encoding for all text files
- Proper JSON formatting with 2-space indentation

### Path Handling
- Use `path.join()` for cross-platform compatibility
- Validate paths before operations
- Handle special characters in names appropriately
- Support for kebab-case conversion from display names

## Validation Requirements

### World Structure Validation
- World config.json must contain required fields (name)
- Agent directories must contain all three required files
- JSON files must be valid and parseable
- Markdown files must be readable text

### Data Integrity
- Consistent agent naming between directory and config
- Proper timestamp formats (ISO 8601)
- Valid message structures in memory files
- Proper role assignments in conversation history

## Migration Considerations

### Backward Compatibility
- Support loading existing structures during transition
- Graceful handling of missing files (with defaults)
- Automatic migration of legacy formats
- Preservation of existing data during updates

### Forward Compatibility
- Extensible metadata objects
- Version tracking in config files
- Support for additional file types in the future
- Flexible agent directory structures

## Error Handling

### Missing Files
- Create default system-prompt.md if missing
- Create empty memory.json if missing
- Validate and repair corrupted config files
- Log warnings for missing but non-critical files

### Invalid Data
- Validate JSON structure before parsing
- Provide sensible defaults for missing config fields
- Handle corrupted memory files gracefully
- Maintain system stability despite file system issues

## Performance Considerations

### File System Efficiency
- Minimize file system operations
- Cache frequently accessed data in memory
- Batch operations where possible
- Use asynchronous file operations

### Memory Management
- Limit memory file sizes (max 50 messages)
- Archive old conversations automatically
- Clean up temporary files
- Efficient loading of large agent directories

## Security Requirements

### File Access
- Validate file paths to prevent directory traversal
- Proper file permissions for created directories
- Safe handling of user-provided names
- Protection against malformed file names

### Data Privacy
- Secure storage of conversation history
- Proper cleanup of temporary files
- No sensitive data in file names
- Appropriate file permissions for data directories
