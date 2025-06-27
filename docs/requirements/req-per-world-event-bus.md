# Requirements: Per-World Event Bus Architecture

## What
Each world should have its own isolated event bus instead of sharing a global one.

## Current State
- Global event bus shared across all worlds
- Events from one world can potentially affect agents in other worlds
- Single event bus instance managed globally

## Requirements
1. **Isolation**: Each world must have its own event bus instance
2. **Event Scoping**: Events should only be visible within the same world
3. **Resource Management**: Event buses should be created/destroyed with worlds
4. **API Compatibility**: Maintain existing API signatures where possible
5. **Memory Management**: Clean up event bus resources when worlds are deleted

## Non-Requirements
- Cross-world messaging (explicitly excluded for isolation)
- Global event broadcasting across worlds
- Shared event history between worlds

## Benefits
- Complete isolation between worlds
- Prevents cross-world event pollution
- Better resource management per world
- Cleaner architecture with proper encapsulation
