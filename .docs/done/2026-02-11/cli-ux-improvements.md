# CLI UX Improvements — Electron-Inspired Terminal Display

**Date**: 2026-02-11  
**Type**: Feature Enhancement  
**Status**: Complete

## Overview

Ported the rich visual feedback patterns from the Electron desktop app into the CLI interactive mode using ANSI escape codes, Unicode symbols, and a single rewritable status line. Users now see animated spinners, elapsed time counters, tool icons, agent queue indicators, and structured tool output — all without external dependencies.

## Implementation

### New Module: `cli/display.ts`

Leaf module with zero internal imports. Contains all display logic:

- **`formatToolName(name)`** — Converts `snake_case`/`camelCase` to Title Case  
  `read_file` → `Read File`, `searchAndReplace` → `Search And Replace`

- **`formatElapsed(ms)`** — Human-readable duration  
  `5000` → `0:05`, `65000` → `1:05`, `3661000` → `1:01:01`

- **`getToolIcon(name)`** — Pattern-matched Unicode icons with priority ordering  
  write `▹` → delete `✕` → move `↔` → shell `⚡` → search `◈` → web `◇` → read `▸` → default `●`

- **`truncateToWidth(text, max)`** — Terminal-safe truncation with `…`

- **`createSpinner()`** — Braille character spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) at 80ms intervals

- **`createStatusLineManager()`** — Unified status line combining spinner + elapsed timer + agent queue + active tools on a single `\r\x1b[K` rewritable line  
  Example: `⠋ AgentA is thinking... [0:12] | ▸ Read File ⟳`

- **`log(statusLine, ...args)`** — Console.log wrapper that pauses/resumes the status line to prevent prompt corruption

### Modified: `cli/index.ts`

- **Removed** `ActivityProgressRenderer` class (~40 lines)
- **Added** `createStatusLineManager()` instance in `runInteractiveMode()`
- **Wired** activity events (`response-start`, `response-end`, `idle`) to status line setters
- **Wired** tool events (`tool-start`, `tool-result`, `tool-error`) to `addTool()`/`removeTool()`
- **Wrapped** message `console.log()` calls with `statusLog()` for clean output
- **Added** `statusLine.cleanup()` in SIGINT, close, and error handlers
- **Added** `statusLine.clear()` before `rl.prompt()` on idle
- **Fixed** streaming conflict: `statusLine.resume()` now gated behind `!streaming.isActive` to prevent the elapsed timer from overwriting streaming output

### Modified: `cli/stream.ts`

- **Enhanced** `handleToolEvents()` with icons (`getToolIcon`), formatted names (`formatToolName`), and elapsed time (`formatElapsed`)
- **Enhanced** `handleToolStreamEvents()` with `[stderr]`/`[stdout]` prefixes and 50K character truncation
- **Added** `resetToolStreamTracking()` for per-tool-execution counter reset
- **Added** optional `statusLine` parameter to `handleStreamingEvents()` — stops spinner on first chunk, pauses during streaming, resumes on end/error
- **Changed** `handleActivityEvents()` to use `process.stderr.write` for debug-level output

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Leaf module (`display.ts`) | No circular dependencies; testable in isolation |
| Factory functions, no classes | Project convention: function-based architecture |
| Fixed-width Unicode symbols, no emoji | Consistent terminal rendering across emulators |
| Pause/resume pattern | Prevents readline prompt corruption during status line updates |
| Pipeline mode untouched | All enhancements gated behind interactive mode (`statusLine` null check) |
| Module-level stream tracking | Simple single-tool-at-a-time counter; documented limitation for concurrent tools |

## Usage

The status line activates automatically in interactive mode:

```
> tell a1 to search for config files

⠋ a1 is thinking... [0:05] | ◈ Search Files ⟳

a1 ✓ ◈ Search Files (0:02, 1240 chars)
a1 ✓ ▸ Read File (0:01, 856 chars)

⠋ a1 is thinking... [0:12]

● a1: I found 3 config files...

>
```

In pipeline mode the status line is `null` and all output remains unchanged.

## Testing

38 unit tests in `tests/cli/display.test.ts` — all passing:

| Group | Count | Coverage |
|-------|-------|----------|
| `formatToolName` | 6 | snake_case, camelCase, mixed, single word, empty, acronyms |
| `formatElapsed` | 6 | 0ms, seconds, minutes, hours, negative, boundary |
| `getToolIcon` | 8 | All 7 icon patterns + default |
| `truncateToWidth` | 6 | Short, exact, over-width, zero, one, negative |
| `createSpinner` | 4 | Start, stop, idempotent, cleanup |
| `createStatusLineManager` | 7 | Render, pause/resume, reset, tools, agents, elapsed, cleanup |
| `log` helper | 1 | Pause→log→resume ordering |

Tests use `vi.useFakeTimers()` for timer-based tests and mock `process.stdout.write`/`process.stdout.columns`.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `cli/display.ts` | Created | ~310 |
| `cli/index.ts` | Modified | ~162 changed |
| `cli/stream.ts` | Modified | ~91 changed |
| `tests/cli/display.test.ts` | Created | ~300 |

## Related Work

- **REQ**: [.docs/reqs/2026-02-11/req-cli-ux-improvements.md](../../reqs/2026-02-11/req-cli-ux-improvements.md)
- **Plan**: [.docs/plans/2026-02-11/plan-cli-ux-improvements.md](../../plans/2026-02-11/plan-cli-ux-improvements.md)
- **Inspiration**: Electron desktop app UX patterns (`electron/renderer/src/components/`)
