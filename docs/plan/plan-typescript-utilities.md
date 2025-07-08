# TypeScript Utility Types Implementation Plan

## Phase 1: Base Interface Creation and Parameter Consolidation

### 1.1 Agent Parameter Types Enhancement
- [ ] Create `BaseAgentParams` interface with core properties
- [ ] Derive `CreateAgentParams` using intersection types
- [ ] Derive `UpdateAgentParams` using `Partial<BaseAgentParams>`
- [ ] Update function signatures in managers.ts

### 1.2 World Parameter Types Enhancement  
- [ ] Create `BaseWorldParams` interface
- [ ] Derive `CreateWorldParams` and `UpdateWorldParams`
- [ ] Update world management functions

### 1.3 AgentInfo Derivation
- [ ] Convert `AgentInfo` to derived type using `Pick<Agent, ...>`
- [ ] Add computed properties (memorySize) as intersection
- [ ] Validate all AgentInfo usage sites

## Phase 2: Storage and Event System Enhancement

### 2.1 Storage-Safe Types
- [ ] Create `AgentStorage` type using `Omit<Agent, methods>`
- [ ] Create `WorldStorage` type for persistence
- [ ] Update storage module type signatures

### 2.2 Event System Type Safety
- [ ] Create `EventPayloadMap` with mapped types
- [ ] Implement `TypedEvent<T>` conditional type
- [ ] Update event functions with proper typing

### 2.3 Configuration Type Enhancement
- [ ] Enhance LLM provider config types with `Required`/`Partial`
- [ ] Create provider-specific configuration utilities
- [ ] Update configuration validation

## Phase 3: Integration and Validation

### 3.1 Update Core Types
- [ ] Update `core/types.ts` with new type definitions
- [ ] Ensure backward compatibility
- [ ] Update public API exports

### 3.2 Function Signature Updates
- [ ] Update `core/managers.ts` function signatures
- [ ] Update `core/events.ts` event functions
- [ ] Update storage module signatures

### 3.3 Validation and Testing
- [ ] Compile check for type safety
- [ ] Validate no runtime behavior changes
- [ ] Test IDE autocomplete improvements
- [ ] Update documentation

## Implementation Notes

### Type Safety Benefits
- Single source of truth for parameter definitions
- Compile-time validation of type relationships
- Automatic consistency between Create/Update operations
- Clear separation between runtime and storage types

### Backward Compatibility
- All changes are type-level enhancements
- No runtime behavior modifications
- Existing code continues to work
- Progressive enhancement approach

### File Targets
1. `core/types.ts` - Primary type definitions
2. `core/managers.ts` - Function signatures  
3. `core/events.ts` - Event system
4. `core/llm-config.ts` - Configuration types
5. `public/agent-world.d.ts` - Public API types
