# Approval System Analysis

**Date**: 2026-02-06  
**Purpose**: Document current approval system before removal  

## Summary Statistics

- **Core references**: 218 occurrences of "approval" or "approveToolUse"  
- **Web UI references**: 169 occurrences  
- **Server references**: 15 occurrences  
- **Test files**: 7 approval/HITL test files  

## Files Affected

### Core Files (18 files with approval code)
1. `core/events/approval-checker.ts` - **DELETE** (~200 lines)
2. `core/message-prep.ts` - MODIFY (remove approval filtering)
3. `core/utils.ts` - MODIFY (remove approval mention)
4. `core/storage/eventStorage/validation.ts` - MODIFY (remove approvalScope)
5. `core/storage/eventStorage/types.ts` - MODIFY (remove approvalScope type)
6. `core/shell-cmd-tool.ts` - MODIFY (remove approval config)
7. `core/types.ts` - MODIFY (remove toolCallStatus, approval types)
8. `core/llm-manager.ts` - MODIFY (remove approval mentions)
9. `core/events/subscribers.ts` - MODIFY (remove approval flow)
10. `core/mcp-server-registry.ts` - MODIFY (remove approval tools)
11. `core/tool-utils.ts` - MODIFY (remove HITL tool creation)

### Test Files to Remove/Modify
1. `tests/core/hitl-tool-phase1.test.ts` - DELETE or modify
2. `tests/core/hitl-tool-phase2.test.ts` - DELETE or modify
3. `tests/core/hitl-tool-phase3-web.test.ts` - DELETE or modify
4. `tests/core/approval-broadcast-bug.test.ts` - Check if still relevant
5. `tests/manual/09-tool-approval.md` - DELETE
6. `tests/e2e/test-approval-flow.ts` - DELETE
7. `tests/e2e/test-approval-none.ts` - DELETE
8. `tests/core/approval/` - DELETE directory

### Web UI Files (Significant cleanup needed)
- 169 references in `web/src/` need investigation
- Likely has approval UI components

### Server Files
- 15 references in `server/` - likely API endpoints

## Current Approval Flow (from code analysis)

### Flow 1: Tool Approval Request
```
1. LLM generates tool call with client.approveToolUse
2. subscribers.ts detects hasApprovalRequest 
3. Creates approval request message in agent memory
4. Publishes tool-start event with approval metadata
5. UI displays approval prompt
6. Human responds with approve/deny + scope (once/session/always)
7. Response saved as tool result message
8. subscribers.ts parses approval decision
9. If approved: execute original tool
10. If denied: skip execution
```

### Flow 2: HITL (Human-in-the-Loop)
```
1. Tool calls client.humanIntervention
2. subscribers.ts detects hasHITLRequest
3. Creates HITL request in memory  
4. Publishes HITL event
5. UI displays intervention prompt
6. Human provides choice/input
7. Choice returned as tool result
8. Agent continues with human input
```

### Key Components

#### approval-checker.ts
- `checkToolApproval()` - Main validation function
- `findSessionApproval()` - Check for session-wide approval
- `findOnceApproval()` - Check for one-time approval
- Uses enhanced protocol with `__type='tool_result'`

#### subscribers.ts
- Detects `client.approveToolUse` in tool_calls
- Detects `client.humanIntervention` in tool_calls
- Parses approval decisions from tool results
- Executes tools based on approval status

#### message-prep.ts
- Filters out `approval_` prefixed tool results
- Filters out `hitl_` prefixed tool results
- Prevents approval messages from going to LLM context

#### tool-utils.ts
- `createHumanInterventionTool()` - Creates HITL tool
- Transforms to `client.humanIntervention` protocol

## Approval Metadata Structure

### Tool Call (Request)
```typescript
{
  id: "approval_123",
  type: "function",
  function: {
    name: "client.approveToolUse",
    arguments: JSON.stringify({
      toolName: "shell_cmd",
      toolArgs: {...},
      message: "Execute shell command?",
      workingDirectory: "/path"
    })
  }
}
```

### Tool Result (Response)
```typescript
{
  role: "tool",
  tool_call_id: "approval_123",
  content: JSON.stringify({
    __type: "tool_result",
    content: JSON.stringify({
      decision: "approve" | "deny",
      scope: "once" | "session" | "always",
      toolName: "shell_cmd",
      toolArgs: {...},
      workingDirectory: "/path"
    })
  })
}
```

## Storage Schema Check

Need to check:
- AgentMessage.toolCallStatus type definition
- Database columns for approval data
- Migration files for approval fields

## Approval Behavior Examples (for Phase 4 redesign)

### Example 1: Session Approval
```
User: Run npm install
Agent: (tool call to client.approveToolUse for shell_cmd)
User: approve + session scope
Agent: (executes npm install)
User: Run npm test  
Agent: (auto-executes without asking - session approval applies)
```

### Example 2: Once Approval
```
User: Delete this file
Agent: (tool call to client.approveToolUse for shell_cmd)
User: approve + once scope
Agent: (executes delete)
User: Delete another file
Agent: (asks for approval again - once was consumed)
```

### Example 3: HITL Intervention
```
User: Choose the best approach
Agent: (calls human_intervention.request)
User: (sees options A, B, C)
User: Choose B
Agent: (continues with choice B)
```

## Next Steps

1. ✅ Document flow (this file)
2. ⏳ Save examples (above)
3. ⏳ Check storage schema
4. ⏳ Create comprehensive removal plan
5. ⏳ Begin systematic removal

---

**Status**: Analysis Phase  
**Complexity**: Higher than expected (384+ references across core/web/server)  
**Recommendation**: Careful, incremental removal with frequent testing
