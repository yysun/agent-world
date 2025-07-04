# Core Architecture Consolidation Requirements

**Version:** 1.0  
**Date:** July 4, 2025  
**Status:** Review Required  

## Overview

Consolidate the core module architecture to reduce complexity while preserving all existing functionality and ensuring tests continue to pass.

## Current Architecture Analysis

### Current Structure
- **15 files** in core folder with overlapping responsibilities
- **Multiple manager layers** with similar patterns
- **Scattered logging** across modules without centralization
- **Complex export structure** exposing internal APIs
- **Duplicated utility functions** across modules

### Key Findings
1. **Manager Pattern Redundancy**: `world-manager.ts`, `agent-manager.ts`, `message-manager.ts`, and `llm-manager.ts` share similar CRUD patterns
2. **Event System Fragmentation**: Events handled across `world-events.ts`, `agent-events.ts` with overlapping concerns
3. **Storage Layer Separation**: Good separation between storage and manager layers
4. **Validation Module**: Comprehensive but potentially over-engineered
5. **Export Pollution**: `index.ts` exports internal APIs that should be private

## Consolidation Requirements

### WHAT - Functions to Merge

#### 1. Manager Consolidation
- **Merge** `world-manager.ts` and `agent-manager.ts` into `managers.ts`
- **Preserve** all CRUD operations and business logic
- **Keep** world-agent relationship management intact
- **Maintain** dynamic import patterns for browser compatibility

#### 2. Event System Unification  
- **Merge** `world-events.ts` and `agent-events.ts` into `events.ts`
- **Preserve** World.eventEmitter isolation patterns
- **Keep** all event types and payload structures
- **Maintain** subscription and publishing logic

#### 3. Utility Consolidation
- **Merge** scattered utility functions into single `utils.ts`
- **Remove** duplicated helper functions
- **Preserve** all existing utility logic
- **Keep** ID generation and string manipulation functions

#### 4. Logging Standardization
- **Create** centralized logger in `logger.ts`
- **Use** pino logger consistently across all modules
- **Replace** console.log/warn/error with structured logging
- **Maintain** debug levels and formatting

#### 5. Export Cleanup
- **Remove** internal API exports from `index.ts`
- **Keep** only public APIs for external consumption
- **Maintain** type exports for TypeScript consumers
- **Preserve** version and metadata exports

### WHAT - Files to Keep Separate

#### Storage Layer (No Changes)
- `world-storage.ts` - File I/O operations
- `agent-storage.ts` - Agent persistence
- Keep isolated from business logic

#### Core Systems (Minimal Changes)  
- `types.ts` - Type definitions (cleanup only)
- `subscription.ts` - World subscription management
- `llm-manager.ts` - LLM integration (logging updates only)

#### Files to Remove
- `validation.ts` - No dependencies found, safe to delete
- `message-manager.ts` - High-level messaging (merge into managers.ts)

## Functional Preservation Requirements

### MUST Preserve
- **All CRUD operations** for worlds and agents
- **Event system isolation** per world instance
- **LLM integration** with streaming and queuing
- **Agent subscription logic** and message processing
- **File storage patterns** and atomic operations
- **Date serialization** and object reconstruction
- **Turn limit management** and conversation flow
- **Memory archiving** and persistence
- **Browser/Node.js compatibility** patterns

### MUST Maintain
- **All existing tests** must continue to pass
- **API compatibility** for external consumers
- **World-agent relationships** and isolation
- **EventEmitter patterns** and cleanup
- **Dynamic imports** for browser support
- **Error handling** and recovery mechanisms

## Non-Functional Requirements

### Non-Functional Requirements (EXCLUDED)

**Out of Scope for This Refactoring:**
- **Performance optimizations** - no timing or memory improvements
- **Security enhancements** - no additional validation or protection
- **Error handling improvements** - preserve existing error patterns exactly
- **Feature additions** - no new functionality beyond consolidation

### Maintainability (REFACTORING ONLY)  
- **Reduce** total lines of code by 15-20% through deduplication only
- **Eliminate** code duplication without changing logic
- **Improve** module cohesion through better organization
- **Maintain** clear separation of concerns exactly as currently implemented

### Testing
- **All integration tests** must pass unchanged
- **All unit tests** must pass with minimal updates
- **Test coverage** must not decrease
- **Add tests** for any new consolidated functions

## Success Criteria

### Quantitative
- [ ] Reduce core module files from 15 to 10 or fewer (remove validation.ts + consolidate)
- [ ] Eliminate duplicate utility functions (target: 0 duplicates)
- [ ] Centralize all logging to single logger module (console.* → logger)
- [ ] Reduce public API exports by 30% (keep only external APIs)
- [ ] All existing tests pass (100% compatibility - zero functional changes)

### Qualitative  
- [ ] Cleaner module dependencies and imports
- [ ] Consistent logging format across all modules
- [ ] Simplified public API surface
- [ ] Maintained type safety and error handling
- [ ] Preserved world isolation and event management

## Implementation Constraints

### Testing Requirements
- **Run full test suite** after each consolidation step
- **Maintain test compatibility** throughout process  
- **Fix any broken tests** immediately
- **No test deletion** without explicit approval

### Code Quality
- **Preserve all comment blocks** and documentation
- **Maintain TypeScript strict compliance**
- **Keep error handling patterns** intact
- **Follow existing coding standards**

### Backwards Compatibility
- **Public API** must remain unchanged
- **Type definitions** for external use preserved
- **Module imports** for consumers maintained
- **Configuration patterns** unchanged

## Out of Scope

- **Storage file formats** - no changes to JSON structures
- **LLM provider support** - no changes to AI SDK integration  
- **WebSocket/CLI interfaces** - no changes to transport layers
- **World/Agent data models** - no changes to core entities
- **Configuration management** - no changes to setup patterns

## Risk Mitigation

### High Risk Areas
- **Event system changes** - potential for cross-world interference
- **Manager consolidation** - risk of breaking CRUD operations
- **Export cleanup** - risk of breaking external consumers

### Mitigation Strategies  
- **Incremental consolidation** with testing at each step
- **Preserve existing interfaces** during internal reorganization
- **Run integration tests** after each major change
- **Maintain git history** for easy rollback if needed

## Dependencies

### Internal
- Existing test suite must be runnable
- Current file structure provides consolidation baseline
- Integration tests define functional requirements

### External
- TypeScript compiler compatibility
- AI SDK integration patterns
- Pino logger dependency
- Node.js/browser dual compatibility

## Acceptance Criteria

1. **Core module reduced** to 10 or fewer files
2. **All existing tests pass** without modification
3. **Public API unchanged** for external consumers  
4. **Logging standardized** using pino logger
5. **Code duplication eliminated** across utilities
6. **Documentation updated** to reflect new structure
7. **Performance maintained** or improved
8. **Type safety preserved** throughout consolidation

---

**Review Required**: This requirements document needs confirmation before implementation begins.
