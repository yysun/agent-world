# Requirement: Command Line Flag for Streaming Control

**Date:** 2026-01-09  
**Status:** Pending Implementation  
**Priority:** Medium

---

## Problem Statement

Currently, streaming is enabled/disabled based on whether the CLI is in pipeline mode (non-TTY stdin) or interactive mode (TTY stdin). This is hard-coded logic:

- **Pipeline Mode** (`!process.stdin.isTTY`): Streaming is **disabled** via `disableStreaming()`
- **Interactive Mode** (`process.stdin.isTTY`): Streaming is **enabled** via `enableStreaming()`

This approach lacks flexibility for users who want to:
- Disable streaming in interactive mode (for cleaner output or testing)
- Enable streaming in pipeline mode (for progress visibility in automated scripts)
- Test different streaming configurations without modifying code

---

## Current Implementation

Located in `cli/index.ts`:

```typescript
// Line ~2012-2021
const isPipelineMode = !process.stdin.isTTY;

if (isPipelineMode) {
  // Disable streaming only for non-interactive stdin
  await runPipelineMode(options, messageFromArgs);  // calls disableStreaming()
} else {
  // Enable streaming for all interactive sessions
  await runInteractiveMode(options);  // calls enableStreaming()
}
```

The `runPipelineMode()` function (line ~855) hard-codes:
```typescript
disableStreaming();
```

The `runInteractiveMode()` function (line ~1554) hard-codes:
```typescript
enableStreaming();
```

---

## Requirements

### 1. Command Line Flag

**MUST** provide a command line flag that allows users to explicitly control streaming behavior:

- `--streaming` or `--stream`: Enable streaming (default for interactive mode)
- `--no-streaming` or `--no-stream`: Disable streaming (default for pipeline mode)

The flag should accept boolean values:
- `--streaming=true` or `--streaming`
- `--streaming=false` or `--no-streaming`

### 2. Behavior Requirements

**Mode Detection and Defaults:**
- When **no flag is specified**: Use current behavior (streaming based on TTY detection)
- When **flag is specified**: Override automatic detection and use flag value explicitly

**Interactive Mode (TTY detected):**
- Default: Streaming **enabled**
- With `--no-streaming`: Streaming **disabled**
- With `--streaming`: Streaming **enabled** (explicit)

**Pipeline Mode (no TTY):**
- Default: Streaming **disabled**
- With `--streaming`: Streaming **enabled**
- With `--no-streaming`: Streaming **disabled** (explicit)

### 3. User Experience Requirements

**Help Documentation:**
- MUST include the flag in `--help` output
- MUST explain when streaming is useful vs. not useful
- MUST document default behavior (auto-detect based on TTY)

**Example Usage:**
```bash
# Interactive mode with streaming disabled
cli --world myworld --no-streaming

# Pipeline mode with streaming enabled (for visibility)
echo "Hello" | cli --world myworld --streaming

# Explicit streaming control
cli --world myworld --streaming=true
cli --world myworld --streaming=false
```

### 4. Technical Requirements

**Configuration:**
- Add `--streaming` boolean option to commander.js configuration
- Default value should be `undefined` (to allow auto-detection)

**Implementation:**
- Replace hard-coded `enableStreaming()` / `disableStreaming()` calls
- Determine streaming state from flag (if provided) or TTY detection (if not)
- Apply streaming configuration before calling mode-specific functions

**Consistency:**
- MUST work consistently across both pipeline and interactive modes
- MUST NOT break existing functionality when flag is not specified
- MUST respect flag value over automatic detection

---

## Success Criteria

✓ Users can explicitly enable/disable streaming via command line flag  
✓ Flag works in both pipeline and interactive modes  
✓ Default behavior (no flag) remains unchanged from current implementation  
✓ Flag is documented in help output  
✓ Flag overrides automatic TTY-based detection  
✓ All existing CLI tests pass with new flag implementation  
✓ New tests verify flag behavior in both modes

---

## Out of Scope

- Changing streaming protocol or SSE event handling
- Modifying LLM provider streaming implementation
- Adding streaming configuration to world settings
- Per-agent streaming control
- Runtime streaming toggle (only startup configuration)

---

## Dependencies

- `core/index.js`: `enableStreaming()` and `disableStreaming()` functions
- `cli/index.ts`: Mode detection and initialization logic
- Commander.js: CLI argument parsing

---

## Architecture Review

**Date:** 2026-01-09

### Issues Identified

1. **Flag Shorthand Conflict**: The `-s` shorthand is already used by `--server` option
   - **Solution**: Use full form only (`--streaming`) or choose different shorthand (e.g., `-S`)
   - **Recommendation**: Use `--streaming` without shorthand for clarity

2. **Global Streaming State**: `enableStreaming()` / `disableStreaming()` modify global state in `core/events/publishers.ts`
   - State is process-wide, not per-world or per-connection
   - **Validation**: This is acceptable for CLI (single process, single user)
   - **Caution**: Multiple concurrent operations would share state

3. **Streaming Scope**: Current implementation affects SSE event publishing globally
   - Located in `core/events/publishers.ts` with flag `globalStreamingEnabled`
   - Used by `publishSSEEvent()` to decide whether to emit SSE events
   - **Validation**: Correct scope for CLI use case

### Design Validations

✓ Commander.js auto-generates `--no-streaming` negation (no manual work needed)  
✓ Global streaming state is appropriate for single-user CLI context  
✓ Applying config before mode functions is clean separation of concerns  
✓ No side effects from changing streaming state mid-execution  
✓ Backward compatibility maintained with `undefined` default

### Implementation Refinements

**Updated Flag Syntax:**
```bash
--streaming          # Enable streaming (no shorthand)
--no-streaming       # Disable streaming (auto-generated)
```

**Alternative Options Considered:**
- `-S, --streaming`: Uses capital S to avoid conflict (more complex)
- `--stream`: Shorter alias (less explicit)
- **Selected**: `--streaming` only (clearest, no conflicts)

## Notes

- This change makes streaming behavior **explicit and controllable** rather than implicit
- Maintains backward compatibility (existing behavior when flag not specified)
- Provides flexibility for advanced users and testing scenarios
- Aligns with CLI best practices for explicit configuration options
- **No shorthand** to avoid conflict with existing `-s, --server` option
