# Architecture Plan: Command Line Streaming Flag

**Date:** 2026-01-09  
**Requirement:** [req-streaming-flag.md](../../reqs/2026-01-09/req-streaming-flag.md)  
**Status:** Not Started

---

## Overview

Implement a command line flag (`--streaming` / `--no-streaming`) to give users explicit control over streaming behavior, replacing the current hard-coded TTY-based detection logic.

**Key Design Decisions:**
- Use commander.js boolean option with default `undefined` for auto-detection
- Maintain backward compatibility (no flag = current behavior)
- Apply streaming configuration before mode-specific functions are called
- Support both positive (`--streaming`) and negative (`--no-streaming`) forms
- **No shorthand flag** to avoid conflict with `-s, --server`

---

## Architecture Validation

### Verified Assumptions

✓ **Global Streaming State**: Streaming control in `core/events/publishers.ts` is process-wide
  - `globalStreamingEnabled` flag controls SSE event publishing
  - Acceptable for CLI (single-user, single process)
  - Functions: `enableStreaming()`, `disableStreaming()`, `isStreamingEnabled()`

✓ **No Side Effects**: Changing streaming state before mode execution is safe
  - State is set once at startup
  - No runtime toggles or concurrent access concerns
  - Mode functions don't reset or modify streaming state

✓ **Commander.js Auto-negation**: `--no-streaming` automatically created
  - Boolean options get automatic negation forms
  - No manual implementation needed

### Identified Issues & Solutions

**Issue 1: Flag Shorthand Conflict**
- Problem: `-s` is already used by `--server` option
- Solution: Use long-form only (`--streaming`)
- Impact: None (long-form is clearer anyway)

**Issue 2: Existing Hard-coded Calls**
- Location: Lines 855 and 1554 in `cli/index.ts`
- Solution: Remove after global config applied in `main()`
- Verification: Grep for any other direct calls

### Risk Assessment

**Low Risk:**
- Minimal code changes
- Clear rollback path
- Backward compatible by design
- Well-defined scope

**Medium Risk:**
- User confusion if streaming behavior differs from expectation
- Mitigation: Clear help text and documentation

---

## Phase 1: Add Command Line Option

### 1.1 Add Commander.js Option
- [ ] Add `--streaming` boolean option to program configuration (line ~1979)
- [ ] Set default value to `undefined` (not `true` or `false`)
- [ ] Add help text: "Enable/disable streaming responses (auto-detected by default)"
- [ ] Test option parsing with various inputs
- [ ] **NO shorthand** to avoid conflict with existing `-s, --server`

**Location:** `cli/index.ts` - `program` configuration block

**Implementation:**
```typescript
.option('--streaming', 'Enable streaming responses (default: auto-detected from TTY)')
```

**Note:** Commander.js automatically creates `--no-streaming` negation

**Why no shorthand:** The `-s` flag is already used by `--server` option

---

## Phase 2: Extract Streaming Logic

### 2.1 Create Streaming Decision Function
- [ ] Create `determineStreamingMode()` function before `main()`
- [ ] Accept parameters: `streamingFlag: boolean | undefined`, `isTTY: boolean`
- [ ] Implement logic:
  - If flag is `true` → return `true` (explicit enable)
  - If flag is `false` → return `false` (explicit disable)
  - If flag is `undefined` → return `isTTY` (auto-detect)
- [ ] Add JSDoc documentation

**Location:** `cli/index.ts` - before `main()` function

**Implementation:**
```typescript
/**
 * Determine whether streaming should be enabled based on flag and TTY detection
 * 
 * @param streamingFlag - Explicit streaming flag from CLI options (undefined = auto-detect)
 * @param isTTY - Whether stdin is a TTY (interactive terminal)
 * @returns true to enable streaming, false to disable
 */
function determineStreamingMode(streamingFlag: boolean | undefined, isTTY: boolean): boolean {
  // Explicit flag overrides auto-detection
  if (streamingFlag !== undefined) {
    return streamingFlag;
  }
  
  // Auto-detect: enable streaming for interactive (TTY), disable for pipeline
  return isTTY;
}
```

---

## Phase 3: Refactor Main Function

### 3.1 Update Mode Detection Logic
- [ ] Get `streaming` option from `program.opts()`
- [ ] Calculate `shouldStream` using `determineStreamingMode()`
- [ ] Apply streaming configuration before mode functions
- [ ] Remove hard-coded calls from mode functions

**Location:** `cli/index.ts` - `main()` function (lines ~2010-2021)

**Current Code:**
```typescript
const isPipelineMode = !process.stdin.isTTY;

if (isPipelineMode) {
  await runPipelineMode(options, messageFromArgs);
} else {
  await runInteractiveMode(options);
}
```

**New Code:**
```typescript
const isTTY = process.stdin.isTTY;
const isPipelineMode = !isTTY;

// Determine streaming configuration from flag or auto-detect
const shouldStream = determineStreamingMode(options.streaming, isTTY);

// Apply streaming configuration globally
if (shouldStream) {
  enableStreaming();
} else {
  disableStreaming();
}

// Run appropriate mode (streaming is already configured)
if (isPipelineMode) {
  await runPipelineMode(options, messageFromArgs);
} else {
  await runInteractiveMode(options);
}
```

### 3.2 Remove Hard-coded Streaming Calls
- [ ] Remove `disableStreaming()` from `runPipelineMode()` (line ~855)
- [ ] Remove `enableStreaming()` from `runInteractiveMode()` (line ~1554)
- [ ] Verify no other direct calls to these functions in CLI code
- [ ] Grep search: `grep -n "enableStreaming\|disableStreaming" cli/index.ts`
- [ ] Ensure only import statement and main() config remain

**Location:** `cli/index.ts` - mode functions

**Verification Command:**
```bash
grep -n "enableStreaming\|disableStreaming" cli/index.ts
# Expected: Only import (line ~90-91) and main() usage
```

---

## Phase 4: Update Documentation

### 4.1 Update Help Text
- [ ] Verify commander.js generates proper help output
- [ ] Add example usage to program description or `addHelpText()`
- [ ] Document default behavior clearly

**Examples to add:**
```bash
# Interactive mode with streaming disabled
cli --world myworld --no-streaming

# Pipeline mode with streaming enabled
echo "Hello" | cli --world myworld --streaming

# Auto-detect (default behavior)
cli --world myworld
```

### 4.2 Update File Header Comment
- [ ] Add streaming flag to features list (line ~47-57)
- [ ] Update examples section with streaming flag examples (line ~73-75)
- [ ] Add to recent changes log (top of file)

**Location:** `cli/index.ts` - file header comment block

---

## Phase 5: Testing

### 5.1 Manual Testing
- [ ] Test `--streaming` in interactive mode
- [ ] Test `--no-streaming` in interactive mode
- [ ] Test `--streaming` in pipeline mode (echo input)
- [ ] Test `--no-streaming` in pipeline mode
- [ ] Test with `--command` flag in both modes
- [ ] Test default behavior (no flag) in both modes

**Test Commands:**
```bash
# Interactive with streaming enabled (default)
npm run cli:dev -- --world test-world

# Interactive with streaming disabled
npm run cli:dev -- --world test-world --no-streaming

# Pipeline with streaming disabled (default)
echo "Hello" | npm run cli:dev -- --world test-world

# Pipeline with streaming enabled
echo "Hello" | npm run cli:dev -- --world test-world --streaming

# Command mode with explicit flags
npm run cli:dev -- --world test-world --command "Hello" --streaming
npm run cli:dev -- --world test-world --command "Hello" --no-streaming
```

### 5.2 Verification
- [ ] Verify SSE events are displayed when streaming enabled
- [ ] Verify complete messages displayed when streaming disabled
- [ ] Verify no duplicate output in either mode
- [ ] Verify backward compatibility (no flag = current behavior)
- [ ] Check help output displays flag correctly

---

## Phase 6: Code Review and Cleanup

### 6.1 Code Quality
- [ ] Verify all TypeScript types are correct
- [ ] Ensure consistent code style with project conventions
- [ ] Add comments for complex logic
- [ ] Remove any dead code from refactoring

### 6.2 Final Checks
- [ ] Run `npm test` to verify no regressions
- [ ] Test with different world configurations
- [ ] Test with different LLM providers (if applicable)
- [ ] Verify error handling remains intact

---

## Rollback Plan

If issues are discovered:
1. Revert changes to `main()` function
2. Restore hard-coded `enableStreaming()` / `disableStreaming()` calls
3. Remove `determineStreamingMode()` function
4. Remove `--streaming` option from commander configuration

---

## Dependencies

**Functions:**
- `enableStreaming()` - from `core/index.js`
- `disableStreaming()` - from `core/index.js`

**Libraries:**
- `commander` - CLI argument parsing

**Files:**
- `cli/index.ts` - Main implementation file

---

## Success Metrics

✓ Flag appears in `--help` output  
✓ `--streaming` enables streaming in both modes  
✓ `--no-streaming` disables streaming in both modes  
✓ No flag specified = current behavior (auto-detect)  
✓ No duplicate output in any configuration  
✓ All existing tests pass  
✓ Manual testing confirms expected behavior

---

## Estimated Effort

- **Phase 1-3:** 30 minutes (implementation)
- **Phase 4:** 15 minutes (documentation)
- **Phase 5:** 30 minutes (testing)
- **Phase 6:** 15 minutes (review)
- **Total:** ~90 minutes

---

## Implementation Notes

- Keep changes minimal and focused
- Maintain backward compatibility as primary concern
- Test each phase before proceeding
- Document any unexpected behavior or edge cases
- Follow existing code patterns and conventions
