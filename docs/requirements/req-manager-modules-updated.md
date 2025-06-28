# Manager Modules Requirements - Updated

## Overview
Create dedicated manager modules for agent and world operations with standardized CRUD interfaces that handle file system operations, directory management, and data persistence using brand new storage modules.

## Requirements

### Agent Manager (`src/managers/agent-manager.ts`)
- **getAllAgents(worldId)**: Return Agent[] - Get all agents for a specific world using worldId (kebab-case)
- **getAgent(worldId, agentId)**: Return Agent - Get single agent by agentId from specific world  
- **deleteAgent(worldId, agentId)**: Delete agent folder and all contents using agentId (kebab-case)
- **updateAgent(worldId, agent)**: Save agent changes to file system using agent.id from object
- **createAgent(worldId, agent)**: System generates agentId from agent.name using kebab-case, create directory structure, save all agent files

### World Manager (`src/managers/world-manager.ts`)  
- **getAllWorlds(root)**: Return World[] - Get all worlds from root directory with generated worldIds
- **getWorld(root, worldId)**: Return World - Get single world by worldId (kebab-case) from root directory
- **deleteWorld(root, worldId)**: Delete world folder and all contents using worldId (kebab-case)
- **updateWorld(root, world)**: Save world changes to file system using world.id from object
- **createWorld(root, world)**: System generates worldId from world.name using kebab-case, create directory structure, save world config

### Storage Modules Requirements
- **Agent Storage (`src/managers/agent-storage.ts`)**: Brand new file handling all agent file operations
- **World Storage (`src/managers/world-storage.ts`)**: Brand new file handling all world file operations
- **No Dependencies**: Do not use world-persistence.ts, storage.ts, or world-state.ts
- **Self-contained**: Each storage module handles its own file I/O operations independently

### Integration Requirements
- World manager should import and use agent manager for agent operations
- Agent manager should use agent-storage.ts for file operations
- World manager should use world-storage.ts for file operations
- Both managers should be completely independent of existing storage systems
- Use function-based approach (not class-based)
- Follow existing error handling patterns with rollback support
- Use kebab-case for directory names from agent/world names

### File System Operations
- Agent directory structure: `{worldDir}/agents/{agentId}/[config.json, system-prompt.md, memory.json]`
- World directory structure: `{root}/{worldId}/[config.json, agents/]`
- **Automatic ID Generation**: System generates kebab-case IDs from names for all operations
- **Object-based Updates**: updateAgent and updateWorld use IDs from the objects themselves
- Atomic operations with error rollback
- Safe directory creation and deletion
- Proper error handling for missing files/directories

### Data Flow
- **ID Generation**: System automatically converts names to kebab-case IDs (world.name → worldId, agent.name → agentId)
- **Object-based Keys**: Update operations extract IDs from the objects (agent.id, world.id)
- Agent operations should work directly with file system through agent-storage.ts
- World operations should coordinate agent data through agent-manager
- Both storage modules should handle file I/O independently
- No dependency on existing in-memory state systems

## Implementation Strategy
1. Create brand new agent-storage.ts with core file operations
2. Create brand new world-storage.ts with core file operations
3. Create agent-manager.ts using agent-storage.ts for persistence
4. Create world-manager.ts using world-storage.ts and agent-manager for operations
5. Implement comprehensive error handling and rollback mechanisms
6. Ensure complete independence from existing storage systems
