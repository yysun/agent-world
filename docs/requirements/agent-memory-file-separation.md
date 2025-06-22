# Agent Memory File Separation Requirement

## Requirement
- **Agent memory should be saved to a separate file**
- Store agent conversation history and memory as individual files for better organization and persistence
- File structure: `data/worlds/{world-name}/agents/{agent-name}/memory.json`
- Separate from config.json for cleaner data organization

## Implementation Details

### File Structure
```
data/worlds/{world-name}/agents/{agent-name}/
├── config.json          # Agent configuration (without memory content)
├── system-prompt.md     # System prompt as editable markdown
└── memory.json          # Agent memory and conversation history
```

### Memory File Contents
The memory.json file should contain:
- **Conversation History**: Recent messages for context
- **Agent Memory**: Facts, relationships, and learned information
- **Context Data**: Relevant information for maintaining conversation continuity
- **Timestamps**: When memory was last updated

### Benefits
- **Better Organization**: Separates configuration, prompts, and memory data
- **Performance**: Allows selective loading of memory data when needed
- **Maintenance**: Easier to manage and backup individual agent memory
- **Scalability**: Prevents config files from becoming large with conversation history
- **Debugging**: Easier to inspect agent memory and conversation state

### Integration Requirements
- Update agent saving logic to write memory to separate file
- Update agent loading logic to read memory from separate file
- Ensure memory persistence across agent restarts
- Maintain backward compatibility with existing agents
