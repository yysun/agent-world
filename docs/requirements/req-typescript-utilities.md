# TypeScript Utility Types Enhancement Requirements

## Overview
Enhance the Agent World codebase with advanced TypeScript utility types to improve type safety, reduce code duplication, and establish clear relationships between types.

## High Priority Requirements

### 1. Parameter Consolidation with `Partial`
- **Requirement**: Consolidate Create/Update parameter patterns using base interfaces and utility types
- **Target**: `CreateAgentParams`, `UpdateAgentParams`, `CreateWorldParams`, `UpdateWorldParams`
- **Benefit**: Single source of truth, reduced duplication, automatic consistency

### 2. Enhanced Type Safety with `Pick` and `Omit`
- **Requirement**: Derive AgentInfo from Agent interface using utility types
- **Target**: `AgentInfo` interface derivation from `Agent`
- **Benefit**: Automatic consistency, compile-time validation, clear relationships

### 3. Storage Types with `Omit`
- **Requirement**: Create method-free storage types for persistence
- **Target**: Agent storage without runtime methods
- **Benefit**: Clear separation between runtime and storage concerns

## Medium Priority Requirements

### 4. Event System Enhancement with Mapped Types
- **Requirement**: Type-safe event payload mapping
- **Target**: Event system with payload type safety
- **Benefit**: Compile-time event validation, better IDE support

### 5. Configuration Types with `Required` and `Partial`
- **Requirement**: Enhanced LLM provider configuration types
- **Target**: Provider-specific configuration validation
- **Benefit**: Type-safe configuration, clear requirements

## Implementation Strategy

### Phase 1: Base Interface Creation
1. Create base parameter interfaces
2. Derive Create/Update types using utility types
3. Update AgentInfo to derive from Agent

### Phase 2: Storage and Event Enhancement  
1. Create storage-safe types with Omit
2. Implement event payload mapping
3. Enhance configuration types

### Phase 3: Validation and Integration
1. Update all usage sites
2. Validate type safety improvements
3. Test compilation and runtime behavior

## Success Criteria
- ✅ Reduced interface duplication
- ✅ Improved type safety at compile time
- ✅ Clear type relationships and derivations
- ✅ No runtime behavior changes
- ✅ Better IDE autocomplete and error detection
