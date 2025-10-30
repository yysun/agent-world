# REQ: Targeted Event Type Enhancement (REVISED)

**Date:** 2025-10-30  
**Status:** Revised after Architecture Review  
**Priority:** Medium  
**Original Approach:** ~~Centralized discriminated union registry~~ **REJECTED**  
**Revised Approach:** Targeted enhancement with enums and layer independence  

## Architecture Review Summary

**Original Proposal Rejected** due to critical flaws:
- Discriminated union explosion (65+ members) causing TypeScript performance issues
- Cross-layer coupling breaking modularity
- Runtime overhead from EventEmitter wrappers
- Unrealistic migration complexity

**Recommended Approach:** Targeted enhancement providing 90% of benefits with 20% of complexity.

## Overview

Enhance event type safety through targeted improvements to **existing** typed event systems while preserving performance and layer independence. **Core infrastructure already exists** in `core/types.ts` - this approach focuses on enhancement, documentation, and strategic adoption rather than building from scratch.

**Key Discovery:** EventType enum, EventPayloadMap, and TypedEventBridge are already implemented and functional. This effort targets documentation, strategic CLI modernization, and comprehensive testing.

## Goals

### Primary Goals
1. **Targeted Type Safety** - Add compile-time validation where most beneficial without system-wide changes
2. **Performance Preservation** - Zero runtime overhead for event emission and handling
3. **Layer Independence** - Maintain clean separation between core, API, and frontend
4. **Incremental Adoption** - Enable gradual enhancement without breaking existing functionality

### Secondary Goals
1. **Developer Experience** - Improve IDE support for core event types
2. **Enum-based Organization** - Replace magic strings with organized enums
3. **Optional Enhancement** - Provide typed utilities without forcing adoption
4. **Documentation** - Self-documenting event contracts through organized types

## Current State Analysis

## Current State Analysis

### What Works Well (Keep)
1. **Frontend Events** (`web/src/types/events.ts`):
   - ✅ 40+ discriminated union events working excellently
   - ✅ AppRun native typed events with compile-time validation
   - ✅ Domain module organization for maintainability
   - ✅ Zero performance overhead

2. **Core Events** (`core/events.ts`):
   - ✅ Simple, performant EventEmitter usage
   - ✅ Clear event names: `message`, `sse`, `world`, `system`
   - ✅ Well-defined payload structures (WorldMessageEvent, etc.)
   - ✅ High-frequency streaming without bottlenecks

3. **API Events** (`server/api.ts`):
   - ✅ Structured payload interfaces already defined
   - ✅ Clear separation by event type
   - ✅ Consistent forwarding patterns

### Enhancement Opportunities (Target)
1. **Core Event Names** - Replace magic strings with enums
2. **API Type Safety** - Enhance existing payload types with mapped types
3. **Cross-layer Bridging** - Optional utilities for type-safe forwarding
4. **Development Tooling** - Better IDE support for core events

## Requirements

### Functional Requirements

#### FR1: Core Event Type Enums
- **MUST** replace magic strings with organized enums for core events
- **MUST** maintain exact string values for backward compatibility
- **MUST** provide mapped types for payload validation
- **SHOULD** include comprehensive JSDoc documentation

#### FR2: Enhanced API Type Safety  
- **MUST** enhance existing payload interfaces with mapped types
- **MUST** provide type-safe event handler interfaces
- **MUST** maintain current API contract without breaking changes
- **SHOULD** add optional typed utilities for common patterns
- **MUST** enhance SSE streaming event handling with type safety
- **MUST** update `server/api.ts` event listener patterns

#### FR3: Web Frontend Type Integration
- **MUST** preserve existing excellent frontend typed events (40+ discriminated unions)
- **MUST** integrate core event types with frontend SSE client
- **MUST** enhance `web/src/utils/sse-client.ts` with typed event handling
- **SHOULD** provide optional typed utilities for SSE data processing
- **MUST** maintain zero breaking changes to existing WorldEvents system

#### FR4: CLI Event Type Enhancement
- **MUST** replace CLI magic string constants (`WORLD_EVENTS`) with core enums
- **MUST** enhance `cli/index.ts` event listener attachment with type safety
- **MUST** update CLI command processing with typed event handling
- **SHOULD** provide typed utilities for CLI event management
- **MUST** maintain backward compatibility with existing CLI functionality

#### FR5: Optional Typed Utilities
- **MUST** provide optional enhanced functions alongside existing APIs
- **MUST** allow gradual adoption without forcing changes
- **MUST** maintain zero runtime overhead for enhanced functions
- **SHOULD** include development-time validation helpers

#### FR6: Layer Independence Preservation
- **MUST** keep core, API, and frontend event systems independent
- **MUST** avoid cross-layer type dependencies
- **MUST** support independent testing of each layer
- **SHOULD** provide optional bridging utilities

### Non-Functional Requirements

#### NFR1: Performance Preservation
- **MUST** maintain exact current performance for event emission
- **MUST** add zero runtime overhead for type checking
- **MUST** not impact high-frequency SSE streaming performance
- **SHOULD** provide benchmarks proving performance preservation

#### NFR2: Incremental Enhancement
- **MUST** allow existing code to work unchanged
- **MUST** enable optional adoption of enhanced types
- **MUST** avoid forcing migration of working systems
- **SHOULD** provide migration utilities for teams that want them

#### NFR3: TypeScript Performance
- **MUST** avoid large discriminated unions that impact IDE performance
- **MUST** keep type complexity manageable (max 10 types per enum)
- **MUST** provide fast compilation times
- **SHOULD** include TypeScript performance testing

## Proposed Architecture (Targeted Enhancement)

### Core Event Type System
```typescript
// core/event-types.ts - New file
export enum CoreEventType {
  MESSAGE = 'message',
  SSE = 'sse', 
  TOOL = 'world',    // Keep existing 'world' value for compatibility
  SYSTEM = 'system'
}

export interface CoreEventPayload {
  [CoreEventType.MESSAGE]: WorldMessageEvent;
  [CoreEventType.SSE]: WorldSSEEvent;
  [CoreEventType.TOOL]: WorldToolEvent;
  [CoreEventType.SYSTEM]: WorldSystemEvent;
}

// Optional typed utilities (zero overhead)
export function createTypedEventBridge(world: World) {
  return {
    emit<T extends CoreEventType>(
      event: T, 
      payload: CoreEventPayload[T]
    ): void {
      world.eventEmitter.emit(event, payload);
    },
    
    on<T extends CoreEventType>(
      event: T,
      handler: (payload: CoreEventPayload[T]) => void
    ): () => void {
      world.eventEmitter.on(event, handler);
      return () => world.eventEmitter.off(event, handler);
    }
  };
}
```

### API Enhancement
```typescript
// server/event-types.ts - New file
export interface ApiEventHandler<T extends CoreEventType> {
  handle(event: T, payload: CoreEventPayload[T]): Promise<void> | void;
}

export type TypedEventListener<T extends CoreEventType> = 
  (payload: CoreEventPayload[T]) => void;

// Enhanced existing interfaces
export interface TypedMessageEventPayload extends MessageEventPayload {
  readonly type: CoreEventType.MESSAGE;
}
```

### Frontend Integration (No Changes)
```typescript
// web/src/types/events.ts - Keep existing excellent system
export type WorldEvents = 
  | { name: 'send-message'; payload: void }
  | { name: 'toggle-agent-filter'; payload: string }
  // ... 40+ events already working well
```

## Implementation Plan

### Phase 1: Infrastructure Audit & Enhancement (1 day)
**Goal:** Audit existing implementation and establish baselines

**Tasks:**
- [ ] Audit current EventType enum completeness in `core/types.ts`
- [ ] Validate TypedEventBridge implementation functionality
- [ ] Establish performance baselines for EventEmitter operations
- [ ] Enhance existing documentation and JSDoc comments
- [ ] Create performance benchmarking infrastructure

**Files:**
- `core/types.ts` (audit and enhance existing)
- `tests/performance/baseline.test.ts` (new)

### Phase 2: Strategic Layer Enhancement (2 days)
**Goal:** Sequential enhancement of highest-impact layers

**Day 1: CLI Modernization**
- [ ] Audit all CLI magic string usage (`WORLD_EVENTS` constants)
- [ ] Replace CLI constants with core EventType enums
- [ ] Update event listener attachment patterns
- [ ] Validate CLI functionality preservation

**Day 2: Optional API Enhancement**
- [ ] Create optional typed utilities for API handlers
- [ ] Enhance SSE streaming type safety (optional adoption)
- [ ] Add type-safe event forwarding patterns
- [ ] Maintain backward compatibility

**Files:**
- `cli/index.ts` (replace WORLD_EVENTS with EventType)
- `cli/commands.ts` (optional type enhancements)
- `server/event-types.ts` (new optional utilities)
- `server/api.ts` (minimal optional enhancements)

### Phase 3: Documentation & Examples (1 day)
**Goal:** Comprehensive documentation for existing and enhanced systems

**Tasks:**
- [ ] Create migration guide from magic strings to enums
- [ ] Document existing TypedEventBridge usage patterns
- [ ] Create working examples for all layers
- [ ] Add performance impact documentation

**Files:**
- `.docs/features/typed-event-system.md` (comprehensive guide)
- `examples/typed-events/` (working examples)

### Phase 4: Testing & Performance Validation (1 day)
**Goal:** Comprehensive validation and performance verification

**Tasks:**
- [ ] Validate performance claims with empirical testing
- [ ] Cross-layer integration testing
- [ ] Backward compatibility verification
- [ ] Type system compile-time validation

**Files:**
- `tests/performance/event-overhead.test.ts` (performance validation)
- `tests/types/compile-time-validation.test.ts` (type safety)
- `tests/integration/cross-layer-events.test.ts` (integration)

## Success Criteria

### Infrastructure Validation
- [ ] Existing EventType enum functionality verified and documented
- [ ] TypedEventBridge performance validated (<0.5% overhead)
- [ ] Core event payload types properly mapped and tested
- [ ] Performance baselines established and documented

### Strategic Enhancement
- [ ] CLI magic strings replaced with core EventType enums
- [ ] Optional API type utilities available for gradual adoption
- [ ] Sequential implementation reduces coordination complexity
- [ ] All existing functionality preserved across layers

### Developer Experience
- [ ] Enhanced IDE support for core events demonstrable
- [ ] Clear migration path from magic strings to enums
- [ ] Comprehensive documentation and working examples
- [ ] Optional adoption strategy validated

### System Integrity
- [ ] Zero runtime performance impact (±0.5% variance)
- [ ] Backward compatibility maintained (100% existing code works)
- [ ] Layer independence preserved
- [ ] TypeScript compilation impact minimal (±2% variance)

## Risks and Mitigations

### Technical Risks
1. **Enum Value Conflicts** - Risk of breaking existing string-based code
   - *Mitigation*: Use exact same string values in enums, add compatibility tests
2. **Type Complexity Creep** - Risk of adding too many types over time
   - *Mitigation*: Set hard limits (max 10 events per enum), regular reviews
3. **IDE Performance** - Risk of slower TypeScript processing
   - *Mitigation*: Use simple enums vs unions, performance testing in CI

### Adoption Risks
1. **Low Adoption Rate** - Teams may not use optional enhancements
   - *Mitigation*: Make benefits clear, provide easy migration examples
2. **Inconsistent Usage** - Mix of old and new patterns
   - *Mitigation*: Document both patterns as valid, focus on new code

### Maintenance Risks
1. **Documentation Drift** - Types may become out of sync
   - *Mitigation*: Generate docs from types, add linting rules
2. **Test Coverage Gaps** - New type system may lack edge case testing
   - *Mitigation*: Comprehensive type tests, compile-time validation tests

## Dependencies

### Internal Dependencies
- Current EventEmitter implementation in `core/events.ts` (no changes)
- Existing event type definitions in `core/types.ts` (enhanced)
- Frontend WorldEvents in `web/src/types/events.ts` (unchanged)
- API event handling in `server/api.ts` (minimal enhancements)

### External Dependencies
- TypeScript 4.9+ for enum and mapped type support (already available)
- Node.js EventEmitter (no changes required)
- AppRun typing system (no integration needed - keep separate)

## Alternative Approaches Considered

### Approach 1: Centralized Discriminated Union (REJECTED)
- **Problem**: 65+ union members cause TypeScript performance issues
- **Problem**: Creates cross-layer coupling
- **Problem**: Requires complex migration strategy

### Approach 2: Namespace-Based Registry (CONSIDERED)
- **Pros**: Better organization than massive unions
- **Cons**: More verbose syntax, still creates coupling
- **Decision**: Not needed - enums provide sufficient organization

### Approach 3: Runtime-Only Validation (CONSIDERED)  
- **Pros**: Maximum flexibility
- **Cons**: No compile-time benefits, adds runtime overhead
- **Decision**: Compile-time validation is the primary goal

## Acceptance Criteria

1. **Core Type Safety**: Core event names use enums with compile-time validation
2. **Performance Preservation**: Zero measurable runtime performance impact
3. **Backwards Compatibility**: All existing code works without modification
4. **Optional Enhancement**: Teams can adopt typed utilities gradually
5. **Layer Independence**: Core, API, and frontend remain decoupled
6. **Documentation**: Complete examples and migration guidance
7. **Testing**: 100% coverage for enum types and optional utilities

## Timeline

**Total Duration:** 5 days (reduced from 6 - infrastructure already exists)
- Phase 1 (Infrastructure Audit): 1 day
- Phase 2 (Strategic Enhancement): 2 days  
- Phase 3 (Documentation): 1 day
- Phase 4 (Testing & Validation): 1 day

**Resource Requirements:** 1 developer, familiar with TypeScript and existing codebase
**Reduced Scope Rationale:** Core EventType enum, EventPayloadMap, and TypedEventBridge already implemented

## Open Questions

1. Should we add lint rules to encourage enum usage over string literals?
2. How many core events should we target for the initial enum (current 4 vs future additions)?
3. Should the optional bridge utilities be in core or a separate package?
4. What performance benchmarks should we establish as baselines?

## References

- [TypeScript Enums](https://www.typescriptlang.org/docs/handbook/enums.html)
- [TypeScript Mapped Types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- [Node.js EventEmitter](https://nodejs.org/api/events.html#class-eventemitter)
- Current implementation: `core/events.ts`, `core/types.ts`
- Frontend typed events: `web/src/types/events.ts`
- Architecture review: `.docs/reqs/2025-10-30/architecture-review-typed-events.md`