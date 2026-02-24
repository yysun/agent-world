# Requirement: Remove and Redesign Auth/HITL System

**Date**: 2026-02-06  
**Type**: Refactoring + Feature Redesign  
**Requestor**: Core team  
**Priority**: High

## Overview

Clean up the existing agent-world implementation by first removing the current authentication and Human-in-the-Loop (HITL) systems, then redesigning them with a cleaner, more maintainable architecture that follows SDK/framework patterns.

## Problem Statement

The current auth/HITL implementation has several issues:
1. **Scattered logic** - Spread across 3+ files (approval-checker.ts, tool-utils.ts, orchestrator.ts)
2. **Manual state tracking** - ~500 lines of JSON parsing and message history scanning
3. **Tight coupling** - Approval logic embedded in tool execution flow
4. **No clear API boundary** - Hard to test, modify, or extend
5. **Complex protocol** - Multiple approval formats and transformations

Current implementation locations:
- `core/events/approval-checker.ts` (~200 lines)
- `core/tool-utils.ts` (createHumanInterventionTool, ~150 lines)
- `core/mcp-server-registry.ts` (approval tool registration)
- `core/message-prep.ts` (filtering approval messages)
- `core/events/orchestrator.ts` (approval flow integration)

## Initial Setup

**Branch Strategy**: Start from clean `main` branch
- Checkout `main` branch as baseline
- Create feature branch `remove-auth-hitl` from `main`
- This avoids conflicts with pi-agent-core integration work on `pi` branch
- Can merge back to both `main` and `pi` after completion

## Goals

### Primary Goals
1. **Remove current auth/HITL** - Clean slate for redesign
2. **Simplify codebase** - Reduce complexity and maintenance burden
3. **Establish clean boundaries** - Separate concerns properly
4. **Improve testability** - Make auth/HITL independently testable

### Second0: Setup
- **REQ-0.1**: Checkout `main` branch for clean baseline
- **REQ-0.2**: Create feature branch `remove-auth-hitl` from `main`
- **REQ-0.3**: Verify all tests pass on `main` branch before starting

### Phase 1: Pre-Removal Analysis
- **REQ-1.0.1**: Document current tool execution flow with approval checks
- **REQ-1.0.2**: Run grep to find ALL approval references (create file list)
- **REQ-1.0.3**: Define interim tool execution behavior: **Option A - Auto-execute all tools**
4. Keep MCP integration working during transition

## Functional Requirements

### Phase 1: Pre-Removal Analysis
- **REQ-1.0.1**: Document current tool execution flow with approval checks
- **REQ-1.0.2**: Run grep to find ALL approval references (create file list)
- **REQ-1.0.3**: Identify tool execution default behavior without approval
- **REQ-1.0.4**: Check storage schema for approval-related fields
- **REQ-1.0.5**: Save examples of current approval behavior for redesign reference

### Phase 2: Removal
- **REQ-2.1**: Remove approval-checker.ts and all approval validation logic
- **REQ-2.2**: Remove client.approveToolUse tool definition and protocol
- **REQ-2.3**: Remove human_intervention.request tool and HITL infrastructure
- **REQ-2.4**: Remove approval message filtering from message-prep.ts
- **REQ-2.5**: Remove approval-related state tracking (toolCallStatus)
- **REQ-2.6**: Update orchestrator.ts to remove approval flow integration
- **REQ-2.7**: Remove approval-related test files
- **REQ-2.8**: Update types.ts to remove approval-related types

### Phase 3: Codebase Cleanup & Verification
- **REQ-3.1**: Verify all MCP tools execute correctly without approval
- **REQ-3.2**: Remove dead code and unused imports
- **REQ-3.3**: Add tests for tool execution without approval layer
- **REQ-3.4**: Run full test suite and fix any regressions
- **REQ-3.5**: Verify no approval keywords remain (automated check)
- **REQ-3.4: Architecture Design (Future - Separate REQ)
- **REQ-4.1**: Design new approval system with clear API boundaries
- **REQ-4.2**: Design new HITL system following agent framework patterns
- **REQ-4.3**: Consider integration with pi-agent-core steering messages
- **REQ-4.4**: Plan for approval persistence and session management
- **REQ-4.5**: Evaluate LangGraph for HITL patterns
- **REQ-4.6**: Design approval manager class with clean API
- **REQ-3.2**: Design new HITL system following agent framework patterns
- **REQ-3.3**: Consider integration with pi-agent-core steering messages
- **REQ-3.4**: Plan for approval persistence and session management

## Non-Functional Requirements

### Code Quality
- All existing tests (except approval tests) must continue passing
- No regression in core agent functionality
- Clean git history with atomic commits per component

### Performance
- No performance degradation in agent message processing
- Faster agent initialization (less code to load)

### Maintainability
- Reduced codebase complexity (target: -500 lines)
- Clearer separation of concerns
- Easier to understand control flow

### Documentation
- Document removal in `.docs/done/`
- Update any affected documentation
- Add migration notes if needed

## Out of Scope

- Implementing the new auth/HITL system (Phase 3+)
- Changing MCP server infrastructure
- Modifying agent orchestration logic (except approval removal)
- Changes to LLM provider integrations

## Constraints

### Technical Constraints
- Must not break existing MCP tool execution
- **Define interim tool execution behavior** (auto-execute vs. require flag)

### Business Constraints
- Work happens on feature branch off `pi` (suggest: `pi-remove-auth`)
- Must be completed before pi-agent-core full integration
- Should not block other development work
- Coordinate with any work on copilot/replace-core-agent-logic branch
- Must be completed before pi-agent-core full integration
- Should not block other development work

## Dependencies

### Internal Dependencies
- Understanding of current approval flow
- Knowledge of tool execution pipeline
- Access to test suite to verify no regressions

### External Dependencies
- None (pure refactoring)

## Risks & Mitigation

### Risks
1. **Risk**: Accidentally breaking tool execution
   - **Mitigation**: Remove approval checks incrementally, run tests after each change
   
2. **Risk**: Losing approval functionality users depend on
   - **Mitigation**: Document current behavior, save examples for redesign reference
   
3. **Risk**: Merge conflicts with other branches
   - **Mitigation**: Work on pi branch, coordinate with team

4. **Risk**: Incomplete removal leaving dead code
   - **Mitigation**: Use grep to find all references, verify with linter

## Success Metrics

- [ ] All approval-related code removed (grep for "approval", "approveToolUse", "HITL", "humanIntervention")
- [ ] All non-approval tests passing
- [ ] Codebase reduced by ~500 lines
- [ ] No mentions of approval in core agent flow
- [ ] Documentation updated
- [ ] Clean commit history documenting removal

## Acceptance Criteria

### Phase 0 (Setup) Complete When:
- [ ] On `main` branch with clean working directory
- [ ] Feature branch `remove-auth-hitl` created
- [ ] All tests passing on baseline (npm test)

### Phase 1 (Analysis) Complete When:
- [ ] Current approval flow fully documented
- [ ] All approval-related files identified (comprehensive list)
- [ ] Tool behavior decision documented: **Auto-execute (Option A)**
- [ ] Storage schema checked for approval fields
- [ ] Approval behavior examples saved for redesign

### Phase 2 (Removal) Complete When:
- [ ] No references to `checkToolApproval` in codebase
- [ ] No `client.approveToolUse` tool exists
- [ ] No `human_intervention.request` tool exists
- [ ] No `approval-checker.ts` file exists
- [ ] No approval filtering in `message-prep.ts`
- [ ] No `toolCallStatus` tracking in messages
- [ ] All approval types removed from types.ts

### Phase 3 (Cleanup) Complete When:
- [ ] All core agent tests pass (npm test)
- [ ] Tool execution tests added and passing
- [ ] No dead code from approval system remains
- [ ] ESLint shows no unused imports or variables
- [ ] Automated grep check passes (no approval keywords)

## Related Work

- **Starting Branch**: main (clean baseline)
- **Feature Branch**: remove-auth-hitl
- **Related Features**: Tool execution, MCP registry, agent orchestration
- **Future Work**: New approval system design (separate REQ document)
- **Merge Target**: Both main and pi branches after completion
- [ ] Architecture options evaluated

## Related Work

- **Current Branch**: pi (with pi-agent-core integration)
- **Related Features**: Tool execution, MCP registry, agent orchestration
- **Future Work**: New approval system design (separate REQ document)

## References

### Files to Modify
```
# Phase 1: Analysis (grep and document)
core/events/approval-checker.ts          (DELETE in Phase 2)
core/tool-utils.ts                       (ANALYZE approval functions)
core/mcp-server-registry.ts              (ANALYZE approval tool registration)
core/message-prep.ts                     (ANALYZE approval filtering)
core/events/orchestrator.ts              (ANALYZE approval flow)
core/types.ts                            (ANALYZE toolCallStatus types)
core/events/memory-manager.ts            (CHECK for approval handling)
web/src/**/*                             (CHECK for approval UI)
server/api.ts                            (CHECK for approval endpoints)
tests/core/hitl-tool-phase1.test.ts      (DELETE or MODIFY in Phase 2)

# Tool execution flow to document
core/events/orchestrator.ts             (Current approval integration)
core/mcp-server-registry.ts             (Tool execution pipeline)
```

### Search Patterns
```bash
# Phase 1: Analysis - Find ALL approval references
grep -r "approval\|approveToolUse" core/ --include="*.ts"
grep -r "HITL\|humanIntervention" core/ --include="*.ts"
grep -r "toolCallStatus" core/ --include="*.ts"
grep -r "approval_\|hitl_" core/ --include="*.ts"
grep -r "client\.approve" core/ --include="*.ts"

# Check web UI
grep -r "approval\|approveToolUse" web/src/ --include="*.ts" --include="*.tsx"
-3 of a larger effort to improve auth/HITL. The redesign (Phase 4) will be covered in a separate requirements document after we have a clean foundation.

The removal should be surgical - only approval/HITL code, nothing else. Core agent functionality, MCP integration, and tool execution must continue working perfectly.

**Tool Execution Decision - APPROVED**: After approval removal, all tools will auto-execute (Option A)
- **Rationale**: Simplest approach, minimizes code changes
- **Use Case**: Development and testing environments
- **Warning**: Not recommended for production until Phase 4 redesign complete
- **Documentation**: Add warning in README that tool approval is disabled

**Branch Strategy - APPROVED**: Start from `main` branch
- **Rationale**: Clean baseline without pi-agent-core complexity
- **Benefit**: Changes can be merged to both `main` and `pi` branches independently
- **Process**: Create `remove-auth-hitl` branch from `main`, merge when done

**Examples to Save**: Before removal, capture examples of:
1. Session approval in action (chat logs)
2. Once approval usage
3. HITL intervention flow
4. Approval denial behavior

These will inform Phase 4 redesign.

---

**Status**: Requirements Complete, Architecture Review Complete, Decisions Approved  
**Next Step**: Create Architecture Plan (AP) then implement with Step-by-Step (SS)  
**Estimated Effort**: 6-8 hours (including analysis)  
**Complexity**: Medium-High  
**Review Date**: 2026-02-06  
**Reviewed By**: Architecture Review (AR) process  
**Updated**: 2026-02-06 - Added Phase 0 (branch setup), approved Option A (auto-execute)  

## Architecture Review Summary

**Status**: ✅ **APPROVED WITH CHANGES**  

**Key Changes Made**:
1. Added Phase 0 (Setup) for branch initialization from `main`
2. Added Phase 1 (Pre-Removal Analysis) with 5 requirements
3. Approved interim tool behavior: **Option A - Auto-execute**
4. Approved branch strategy: Work from `main` branch clean baseline
5. Expanded file list to include web/ and server/
6. Added storage schema check requirement
7. Enhanced acceptance criteria with phase-specific checks
8. Added requirement to save approval behavior examples

**Critical Issues Addressed**:
- Tool execution flow must be documented before removal
- Tool behavior decision: **Auto-execute (Option A) - APPROVED**
- Branch strategy: Start from `main`, create `remove-auth-hitl` branch
- Comprehensive file list needed (grep analysis required)
- Storage schema check required

**Decisions Finalized**:
- ✅ Interim behavior: Auto-execute all tools (no approval checks)
- ✅ Branch: Start from `main` branch (clean baseline)
- ✅ Merge strategy: Can merge to both `main` and `pi` after completion

**Recommendation**: **PROCEED** with Phase 0 (Setup) first to checkout `main` and create feature branch. Then continue with Phase 1 (Analysis) before any code removal.
- Comprehensive file list needed (grep analysis required)
- Storage schema check required
- Branch strategy clarified

**Recommendation**: **PROCEED** with Phase 1 (Analysis) first. Do NOT start removal until analysis is complete and tool behavior is decided.

The removal should be surgical - only approval/HITL code, nothing else. Core agent functionality, MCP integration, and tool execution must continue working perfectly.

Consider this an opportunity to simplify before rebuilding better.

---

**Status**: Draft  
**Next Step**: Architecture Review (AR)  
**Estimated Effort**: 4-6 hours  
**Complexity**: Medium
