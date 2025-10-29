# Architecture Plan: Fix MCP Schema Validation System

**Date**: 2024-10-28  
**Priority**: LOW (preventive enhancement for unused API)  
**Estimated Effort**: 1-2 hours (minimal) or 3-4 hours (full infrastructure)  
**Risk Level**: Very Low (zero breaking changes - no callers exist)

## Problem Statement

**DISCOVERY FROM CODEBASE REVIEW**: The initial problem statement was based on incomplete analysis. After tracing through the actual code:

### Actual Architecture (Discovered)

**Path 1 (AI SDK Tool Execution)** - Used by OpenAI, Anthropic, Google:
```typescript
// In openai-direct.ts, anthropic-direct.ts, google-direct.ts:
const tool = mcpTools[toolName];  // Tools from mcpToolsToAiTools
await tool.execute(args, sequenceId, parentToolCall);  // ✅ HAS VALIDATION
```

**Path 2 (Direct executeMCPTool)** - Currently NOT USED:
```typescript
// In mcp-server-registry.ts line 1353:
export async function executeMCPTool(...) { /* ... */ }
// ❌ This function is exported but has ZERO callers in the codebase
```

### Key Finding
**executeMCPTool is NOT called anywhere** - it's a public API that's currently unused. All MCP tool execution flows through the `mcpToolsToAiTools` wrapper which already has proper validation.

### Call Site Analysis
```bash
# Actual callers found in codebase:
- core/openai-direct.ts (line ~547): tool.execute(args, sequenceId, parentToolCall)
- core/anthropic-direct.ts (line ~470): tool.execute(toolUse.input, sequenceId, parentToolCall)  
- core/google-direct.ts: tool.execute(args, sequenceId, parentToolCall)

# executeMCPTool callers: NONE (grep search returned zero matches)
```

## Current Architecture Analysis

### ✅ Working Schema Pipeline (mcpToolsToAiTools)
```typescript
// CURRENT WORKING FLOW:
MCP Tool Schema (t.inputSchema) → validateAndCorrectToolArgs() → WORKS CORRECTLY
     ↓
bulletproofSchema() → validateToolSchema() → AI SDK (for schema compatibility)
```

### ❌ Broken Schema Pipeline (executeMCPTool)
```typescript
// CURRENT LIMITED FLOW:
executeMCPTool() → translateOllamaArguments(args, null) → NO SCHEMA VALIDATION
```

### Root Cause Analysis (CORRECTED)
1. **Unused Public API**: `executeMCPTool` is exported but never called internally or externally
2. **Single Execution Path**: All current tool execution uses `mcpToolsToAiTools` wrapper with validation
3. **Future-Proofing Need**: If external code or future features call `executeMCPTool` directly, validation would be missing
4. **API Consistency**: Public API should have same validation as internal paths for good design

## Proposed Solution Architecture (REVISED)

### Phase 0: Codebase Analysis (COMPLETED ✅)
- [x] **Traced all tool execution paths**: Found all execution goes through mcpToolsToAiTools  
- [x] **Searched for executeMCPTool callers**: Found ZERO internal or external callers
- [x] **Verified validation in execute wrapper**: Confirmed validateAndCorrectToolArgs is used (line 720)
- [x] **Identified actual issue**: executeMCPTool lacks validation for API consistency

### New Problem Scope
This is now a **preventive enhancement** rather than a critical bug fix:
- ✅ Current system works correctly for all actual use cases
- ❌ executeMCPTool needs validation for API consistency and future use  
- 📉 Priority downgraded from MEDIUM to LOW
- ⚡ Effort reduced from 3-4 hours to 1-2 hours (minimal approach)

### Phase 1: Add Schema Support to executeMCPTool (COMPLETED ✅)
- [x] **Modify executeMCPTool signature** to accept optional tool schema parameter
- [x] **Implement validation** using existing validateAndCorrectToolArgs function
- [x] **Add logging** consistent with mcpToolsToAiTools path
- [x] **Document the API** for external/future use

### Phase 2: Schema Lookup Infrastructure (Optional - 1-2 hours)
Only needed if we want executeMCPTool to auto-fetch schemas:
- [ ] **Add schema storage** to ToolCacheEntry interface
- [ ] **Cache schemas** during mcpToolsToAiTools conversion  
- [ ] **Create lookup function**: getToolSchemaFromCache(serverName, toolName)
- [ ] **Integrate lookup** into executeMCPTool as fallback

### Phase 3: API Hardening (COMPLETED ✅)
- [x] **Add validation tests** for executeMCPTool with/without schema
- [x] **Document usage patterns** in JSDoc comments
- [x] **Consider deprecation** if API remains unused after review

**Decision**: API enhanced for consistency. Deprecation not needed - serves as clean public API for future use.

## Implementation Plan

### Step 0: Investigation and Verification
```typescript
// Create test to demonstrate current inconsistency
describe('MCP Schema Validation Consistency', () => {
  test('should validate parameters consistently in both execution paths', async () => {
    const invalidArgs = { limit: "5", sort: "", languages: "English" };
    
    // Test mcpToolsToAiTools path - should work
    const aiToolResult = await testAiToolExecution(invalidArgs);
    
    // Test executeMCPTool path - currently fails validation
    const directResult = await testDirectExecution(invalidArgs);
    
    // Both should have corrected parameters
    expect(aiToolResult.correctedArgs).toEqual(directResult.correctedArgs);
  });
});
```

### Step 1: Enhanced executeMCPTool
```typescript
// File: core/mcp-server-registry.ts
// UPDATE: Add schema parameter and validation
export async function executeMCPTool(
  serverId: string,
  toolName: string,
  args: any,
  sequenceId?: string,
  parentToolCall?: string,
  toolSchema?: any  // ✅ NEW: Optional schema for validation
): Promise<any> {
  // ... existing server validation code ...

  // ✅ NEW: Add proper parameter validation if schema available
  let validatedArgs = translateOllamaArguments(args || {}, toolSchema);
  if (toolSchema) {
    validatedArgs = validateAndCorrectToolArgs(validatedArgs, toolSchema);
    logger.debug(`Applied parameter validation in direct execution`, {
      executionId,
      originalArgs: args,
      validatedArgs,
      hasSchema: !!toolSchema
    });
  }

  const requestPayload = { name: toolName, arguments: validatedArgs };
  // ... rest of existing code ...
}
```

### Step 2: Schema Registry Enhancement
```typescript
// UPDATE: Cache schemas alongside tools
export interface ToolCacheEntry {
  tools: Record<string, any>;           // AI-compatible tools
  schemas: Record<string, any>;         // ✅ NEW: Tool schemas for validation
  cachedAt: Date;
  serverConfigHash: string;
  serverName: string;
  ttl?: number;
}

// UPDATE: Store schemas during tool conversion
async function fetchAndCacheTools(serverConfig: MCPServerConfig): Promise<Record<string, any>> {
  // ... existing code ...
  
  const toolSchemas: Record<string, any> = {};
  
  // Extract and cache original schemas
  for (const tool of tools) {
    const key = nsName(serverConfig.name, tool.name);
    toolSchemas[key] = tool.inputSchema; // ✅ Cache original schema
  }

  const cacheEntry: ToolCacheEntry = {
    tools,
    schemas: toolSchemas,  // ✅ NEW: Cache schemas
    cachedAt: new Date(),
    serverConfigHash: generateServerId(serverConfig),
    serverName: serverConfig.name,
    ttl: DEFAULT_TTL
  };
  
  // ... rest of caching logic ...
}
```

### Step 3: Integration Points

#### Update Tool Registry Lookup
- [ ] **Add schema lookup function**: `getToolSchema(serverId: string, toolName: string)`
- [ ] **Integrate with executeMCPTool**: Pass schema from registry when available
- [ ] **Handle cache misses gracefully**: Fallback to schema-less validation

#### Update Callers of executeMCPTool
- [ ] **Identify call sites**: Find where executeMCPTool is called directly
- [ ] **Add schema passing**: Update calls to include schema parameter
- [ ] **Maintain backward compatibility**: Make schema parameter optional

#### Validation Consistency
- [ ] **Extract validation logic**: Create shared validation function
- [ ] **Use in both paths**: Apply same validation in mcpToolsToAiTools and executeMCPTool
- [ ] **Add validation logging**: Consistent logging for both execution paths

## Testing Strategy

### Unit Tests
- [ ] **Test executeMCPTool with schema**: Verify parameter validation works with schema
- [ ] **Test executeMCPTool without schema**: Verify graceful fallback behavior
- [ ] **Test schema caching**: Verify schemas are stored and retrieved correctly
- [ ] **Test validation consistency**: Compare results between both execution paths

### Integration Tests
- [ ] **End-to-end validation parity**: Both paths produce same validated parameters
- [ ] **Schema lookup integration**: Registry provides correct schemas for tools
- [ ] **Error handling**: Graceful handling when schemas unavailable
- [ ] **Performance impact**: Ensure schema caching doesn't degrade performance

### Regression Tests
- [ ] **Existing AI SDK path**: Verify mcpToolsToAiTools continues working
- [ ] **Direct execution path**: Verify executeMCPTool maintains compatibility
- [ ] **Azure OpenAI compatibility**: Ensure no breaking changes to AI SDK integration
- [ ] **Tool execution results**: Verify tool outputs remain consistent

## Risk Assessment

### Medium Risk Items
- [ ] **Backward compatibility**: Ensure optional schema parameter doesn't break existing calls
- [ ] **Cache performance**: Schema caching may increase memory usage
- [ ] **Tool execution consistency**: Ensure both paths produce equivalent results

### Low Risk Items
- [ ] **Schema availability**: Most tools have schemas, fallback exists for those without
- [ ] **Validation logic**: Reusing existing validateAndCorrectToolArgs function
- [ ] **Registry integration**: Minimal changes to existing cache structure

### Mitigation Strategies
- [ ] **Optional parameters**: Make all new parameters optional for compatibility
- [ ] **Memory monitoring**: Track cache size increase from schema storage
- [ ] **Gradual rollout**: Test with individual MCP servers before full deployment
- [ ] **Fallback validation**: Maintain current behavior when schemas unavailable

## Success Criteria

### Functional Requirements
- [ ] **Validation consistency**: Both execution paths apply same parameter corrections
- [ ] **Direct execution validation**: executeMCPTool validates enum, numeric, and array parameters
- [ ] **Backward compatibility**: All existing functionality continues to work
- [ ] **Schema availability**: Tool schemas accessible for direct execution when cached

### Non-Functional Requirements
- [ ] **Performance**: Minimal impact from schema caching and lookup
- [ ] **Maintainability**: Clear separation between execution paths with shared validation
- [ ] **Reliability**: Graceful fallback when schemas unavailable

## Implementation Timeline

### Day 1 (2-3 hours)
- [ ] Complete Phase 0 investigation and create failing test cases
- [ ] Implement enhanced executeMCPTool with schema parameter
- [ ] Test direct execution validation manually

### Day 2 (1-2 hours)
- [ ] Implement schema caching in registry
- [ ] Create schema lookup functionality
- [ ] Add comprehensive unit and integration tests

## Dependencies

### Code Dependencies
- [ ] **MCP SDK**: No changes needed to external dependencies
- [ ] **Existing validation functions**: Reuse validateAndCorrectToolArgs
- [ ] **Registry cache structure**: Minor enhancement to ToolCacheEntry interface

### Internal Dependencies
- [ ] **Tool cache system**: Must be functioning for schema storage
- [ ] **executeMCPTool callers**: Need to identify and potentially update call sites
- [ ] **Validation logging**: Leverage existing logging infrastructure

## Rollback Plan

### Quick Rollback
```typescript
// Emergency rollback: Make schema parameter optional and unused
export async function executeMCPTool(
  serverId: string,
  toolName: string,
  args: any,
  sequenceId?: string,
  parentToolCall?: string,
  toolSchema?: any  // Keep parameter but don't use it
): Promise<any> {
  // Revert to original validation logic
  let translatedArgs = translateOllamaArguments(args || {}, null);
  // ... rest of original code
}
```

### Gradual Rollback
- [ ] **Disable schema lookup**: Return null from schema lookup functions
- [ ] **Cache rollback**: Temporarily disable schema caching in ToolCacheEntry
- [ ] **Call site rollback**: Remove schema parameters from executeMCPTool calls

## Monitoring and Validation

### Metrics to Track
- [ ] **Validation consistency rate**: Percentage of calls where both paths produce same results
- [ ] **Direct execution validation rate**: Percentage of executeMCPTool calls that get schema validation
- [ ] **Schema cache hit rate**: Percentage of schema lookups that find cached schemas
- [ ] **Parameter correction rate**: How often validation corrects parameters in direct execution

### Success Indicators
- [ ] **Consistent parameter validation**: Both execution paths apply same corrections
- [ ] **Increased validation coverage**: More tool calls receive proper parameter validation
- [ ] **Maintained performance**: No significant increase in execution time
- [ ] **Backward compatibility**: No breaking changes to existing functionality