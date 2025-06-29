# World-Centric Agent Operations - Architectural Improvement Plan

## Overview
Transform CLI commands to use World object methods instead of calling core manager functions directly, creating a cleaner separation of concerns and better encapsulation.

## Current Pattern Issues
- Commands call core manager functions directly (`clearAgentMemory(agent.id)`)
- Commands still manage environment variables (`process.env.AGENT_WORLD_ID = world.id`)
- World object is just passed for context, not used as the primary interface
- Separation between World interface and core managers is unclear

## Target Pattern
- Commands use World object methods (`world.clearAgentMemory(agentName)`)
- World object encapsulates all agent operations
- Core managers become internal implementation details
- Clean API surface on World object

## Implementation Plan

### Phase 1: Extend World Interface with Agent Methods
1. **Add Agent Operation Methods to World Type**
   - `world.createAgent(params: CreateAgentParams): Promise<Agent>`
   - `world.getAgent(agentName: string): Promise<Agent | null>`
   - `world.updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null>`
   - `world.deleteAgent(agentName: string): Promise<boolean>`
   - `world.clearAgentMemory(agentName: string): Promise<Agent | null>`
   - `world.listAgents(): Promise<AgentInfo[]>`
   - `world.updateAgentMemory(agentName: string, messages: AgentMessage[]): Promise<Agent | null>`

2. **Update World Interface in types.ts**
   - Add method signatures to World interface
   - Keep existing properties (id, agents, config, eventEmitter)

### Phase 2: Implement World Methods in World Manager
1. **Create World Method Implementations**
   - Add actual method implementations to World objects
   - Methods internally call core agent-manager functions
   - Handle agent name to ID conversion (kebab-case) internally
   - Set proper world context automatically

2. **Update World Creation Process**
   - Attach methods to World objects when created/loaded
   - Ensure all World instances have consistent method implementations

### Phase 3: Update CLI Commands to Use World Methods
1. **Update Command Implementations**
   - Remove direct core manager imports from commands
   - Replace `clearAgentMemory(agent.id)` with `world.clearAgentMemory(agentName)`
   - Remove environment variable management from commands
   - Use agent names instead of IDs in command calls

2. **Simplify Command Logic**
   - Commands focus on UI/UX and argument parsing
   - World object handles all business logic
   - Cleaner separation of concerns

### Phase 4: Validation and Cleanup
1. **Remove Environment Variable Dependencies**
   - Commands no longer manage `process.env.AGENT_WORLD_ID`
   - World context passed implicitly through object methods

2. **Update Imports and Dependencies**
   - Remove core manager imports from CLI commands
   - Commands only import World types and UI utilities

## Example Transformation

### Before (current):
```typescript
// cli/commands/clear.ts
import { clearAgentMemory } from '../../core/agent-manager';

export async function clearCommand(args: string[], world: World): Promise<void> {
  process.env.AGENT_WORLD_ID = world.id;
  const clearedAgent = await clearAgentMemory(agent.id);
}
```

### After (target):
```typescript
// cli/commands/clear.ts
export async function clearCommand(args: string[], world: World): Promise<void> {
  const clearedAgent = await world.clearAgentMemory(agentName);
}
```

## Benefits
1. **Cleaner API**: World object becomes the single interface for all operations
2. **Better Encapsulation**: Core managers are implementation details
3. **Simplified Commands**: No environment variable management needed
4. **Type Safety**: All operations strongly typed through World interface
5. **Consistency**: All agent operations follow the same pattern
6. **Testability**: Easy to mock World object for testing

## Files to Modify
1. `core/types.ts` - Add method signatures to World interface
2. `core/world-manager.ts` - Implement World methods
3. `cli/commands/*.ts` - Update all commands to use World methods
4. Remove environment variable dependencies from commands

## Step-by-Step Implementation Order
1. ✅ Update World interface in types.ts
2. ✅ Implement World methods in world-manager.ts
3. ✅ Update clear command to use world.clearAgentMemory()
4. ✅ Update add command to use world.createAgent()
5. ✅ Update show command to use world.getAgent()
6. ✅ Update stop command to use world.updateAgent()
7. ✅ Update use command to use world.updateAgent()
8. ✅ Update export command to use world.listAgents() (already compliant)
9. ✅ Remove core manager imports from all commands
10. ✅ Test all CLI functionality
