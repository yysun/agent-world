# Requirement: CLI UX Improvements Inspired by Electron App

**Date**: 2026-02-11  
**Type**: Feature Enhancement  
**Priority**: High  
**Inspired by**: [req-port-electron-ux-to-web.md](req-port-electron-ux-to-web.md)

## Overview

Improve the Agent World CLI interactive experience by porting the superior UX patterns from the Electron desktop app into terminal-appropriate equivalents. The Electron app has rich visual feedback (elapsed timers, tool icons, agent queue displays, thinking indicators) that can be adapted for the terminal using ANSI escape codes, Unicode symbols, and inline status updates.

## Goals

- Provide real-time, informative feedback during agent processing
- Show elapsed time counters for long-running operations
- Display tool execution status with Unicode icons and formatted names
- Show agent processing queue with clear active/waiting indicators
- Improve error and stderr visual distinction
- Add a thinking/spinner indicator while waiting for first response chunk
- Keep pipeline mode clean and unaffected (improvements are interactive-mode only)

## Current State Analysis

### CLI (Current)
- Basic `[World]` log lines for activity events (response-start, response-end, idle)
- Tool events show start/finish with duration but no icons or structured formatting
- No elapsed time counter
- No agent queue visualization
- No thinking/spinner animation while waiting
- Tool streaming (stdout/stderr) uses basic color coding
- Activity progress renderer tracks agents but doesn't produce rich output
- Streaming state is simple (content accumulation, no debounce needed for terminal)

### Electron App (Target Patterns)
- `ThinkingIndicator` — animated dots with "Thinking..." text
- `ElapsedTimeCounter` — mm:ss or hh:mm:ss elapsed time display
- `AgentQueueDisplay` — active agent highlighted, queued agents with initials and position
- `ToolExecutionStatus` — tool name (snake_case → Title Case), category icons, spinner, progress text
- `ActivityState` — unified busy/idle tracking with timer lifecycle
- `StreamingState` — 60fps debounce with RAF flush (not needed for terminal, but debounce pattern useful)

## Functional Requirements

### REQ-1: Thinking Indicator with Spinner
**Status**: Required  
**Description**: Show an animated spinner/dots indicator when waiting for the first response chunk from an agent.

**Behavior**:
- Appears when `response-start` event fires and no streaming chunks received yet
- Uses terminal spinner animation (e.g., `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` braille pattern or `⣾⣽⣻⢿⡿⣟⣯⣷` dots)
- Shows agent name: `⠋ AgentName is thinking...`
- Updates inline (same line) using `\r` carriage return
- Disappears when first streaming chunk arrives or message event received
- Clears on error or idle

**Acceptance Criteria**:
- [ ] Spinner animation visible while agent processes
- [ ] Shows which agent is thinking
- [ ] Spinner stops when first content arrives
- [ ] No spinner residue left in terminal after clearing
- [ ] Does not interfere with streaming output

### REQ-2: Elapsed Time Counter
**Status**: Required  
**Description**: Display elapsed time since processing started, updated every second.

**Behavior**:
- Timer starts on first `response-start` event (when world becomes busy)
- Displays as `[0:05]` or `[1:23]` or `[1:05:30]` next to activity indicator
- Updates every 1 second using `setInterval`
- Resets when world goes idle
- Integrated into the spinner/thinking line: `⠋ AgentName is thinking... [0:12]`

**Acceptance Criteria**:
- [ ] Elapsed time visible during agent processing
- [ ] Timer format: `m:ss` for < 1 hour, `h:mm:ss` for >= 1 hour
- [ ] Timer updates every second on the same line
- [ ] Timer stops and clears when processing completes
- [ ] Timer resets between separate operations

### REQ-3: Enhanced Tool Execution Display
**Status**: Required  
**Description**: Rich tool execution feedback with Unicode icons and formatted names.

**Icon Mapping** (Unicode equivalents of Electron SVG icons):
- File read/write: `📄`
- Edit/create: `✏️`
- Search/grep/find: `🔍`
- Terminal/shell/exec: `⚡`
- Web/fetch/http: `🌐`
- Default/unknown: `🔧`

**Name Formatting**:
- Convert `snake_case` to `Title Case` (e.g., `read_file` → `Read File`)
- Convert `camelCase` to `Title Case` (e.g., `shellCommand` → `Shell Command`)

**Display Format**:
```
  🔍 Search Files ⟳ running...
  📄 Read File ✓ done (245ms, 1.2K chars)
  ⚡ Shell Command ✗ error: command not found
```

**Acceptance Criteria**:
- [ ] Tool icon displayed based on tool name pattern matching
- [ ] Tool name formatted as Title Case
- [ ] Running tools show spinner symbol (⟳ or similar)
- [ ] Completed tools show duration and result size
- [ ] Failed tools show error indicator and message
- [ ] Multiple concurrent tools each displayed on their own line

### REQ-4: Agent Queue Display
**Status**: Required  
**Description**: Show which agents are currently processing or waiting, with clear visual hierarchy.

**Display Format**:
```
  ● AgentA (responding)  →  ○ AgentB (waiting #1)  ○ AgentC (waiting #2)
```

Or compact:
```
  Agents: [●AgentA] → [○AgentB] [○AgentC]
```

**Behavior**:
- `●` (filled circle) for active/processing agent
- `○` (empty circle) for queued/waiting agents
- Arrow `→` between active and waiting
- Agent names colored (active = green, waiting = gray)
- Updates in-place as agents start/finish
- Shows when `activeSources` has multiple entries in world events

**Acceptance Criteria**:
- [ ] Active agent clearly distinguished from waiting agents
- [ ] Queue updates as agents start and finish processing
- [ ] All active agents visible in queue display
- [ ] Queue clears when world goes idle
- [ ] Compact display fits single terminal line

### REQ-5: Improved Error and stderr Display
**Status**: Required  
**Description**: Better visual distinction for errors and stderr output.

**Features**:
- stderr output: Red-tinted text with `[stderr]` prefix
- stdout output: Normal/gray text (current behavior)
- Tool errors: Red bold with ✗ prefix and tool name
- LLM errors: Distinct error formatting with red background hint
- Large output truncation: 50K character limit with `[truncated]` notice

**Display Format**:
```
  [stderr] Permission denied: /etc/shadow
  [stdout] Hello, world!
  ✗ shell_cmd error: Command 'xyz' not found
```

**Acceptance Criteria**:
- [ ] stderr visually distinct from stdout (red text + prefix)
- [ ] Tool errors show tool name and error message
- [ ] Large outputs truncated with notice
- [ ] Error messages formatted for readability

### REQ-6: Unified Activity Status Line
**Status**: Required  
**Description**: Consolidate spinner, elapsed time, and agent info into a single dynamic status line.

**Combined Display**:
```
⠋ AgentA is thinking... [0:12] | 🔍 Search Files running
```

When multiple agents:
```
⠋ Processing [0:45] | Agents: ●AgentA →○AgentB | ⚡ Shell Command running
```

When idle:
```
✓ All processing complete [1:23 elapsed]
```

**Behavior**:
- Single status line updated in-place using `\r\x1b[K` (carriage return + clear line)
- Combines all active indicators into one line
- Falls back to multi-line when too many items to fit
- Preserves all permanent output (messages, tool results) above the status line

**Acceptance Criteria**:
- [ ] Single dynamic status line during processing
- [ ] Combines spinner + elapsed + agent queue + tool status
- [ ] Status line clears cleanly when processing completes
- [ ] Permanent output (messages) not affected by status line updates
- [ ] No visual artifacts when status line transitions

## Non-Functional Requirements

### Performance
- Status line updates at most every 100ms (10fps sufficient for terminal)
- Spinner animation at 80ms frame rate
- No blocking operations during status updates
- Proper cleanup of intervals/timers on exit or world switch

### Usability
- All improvements interactive-mode only (pipeline mode unchanged)
- Clear visual hierarchy: messages > tool results > status indicators
- Color-coded by role: agent=green, system=red, user=yellow, tool=amber
- Intuitive Unicode symbols that work in standard terminal emulators

### Compatibility
- Works with standard terminal emulators (iTerm2, Terminal.app, Windows Terminal, xterm)
- Graceful fallback for terminals without Unicode support (detect via `TERM` env)
- No dependency on specific terminal features beyond ANSI colors
- Compatible with existing readline interface

### Maintainability
- Function-based architecture (no classes per project convention)
- Modular: each indicator as a separate function in `stream.ts` or new `cli/display.ts`
- Reusable formatting utilities (formatToolName, formatElapsedTime, getToolIcon)
- TypeScript with proper types

### Testability
- Unit tests for formatting utilities (formatToolName, formatElapsedTime, getToolIcon)
- Unit tests for status line composition
- Mock timer tests for spinner and elapsed counter

## Technical Constraints

1. **Framework**: Node.js readline + raw ANSI escape codes
2. **No External Dependencies**: Use built-in ANSI codes, no `ora`, `chalk`, or `cli-spinners` packages
3. **Pipeline Safe**: All enhancements must check `isInteractiveMode` before rendering
4. **Terminal Width**: Respect `process.stdout.columns` for line wrapping
5. **Signal Safety**: Proper cleanup on SIGINT/SIGTERM (clear spinner, stop timer)

## Implementation Considerations

### Status Line Strategy
- Use `\r\x1b[K` to overwrite current status line
- Keep permanent output (messages, tool completions) printed with `console.log()` (newline-terminated)
- Status line sits at the bottom, redrawn periodically
- On new permanent output: clear status line → print output → redraw status line

### Spinner Implementation
- Array of braille spinner frames: `['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']`
- `setInterval` at 80ms cycling through frames
- Combined with agent name and elapsed time on same line
- Clear interval on stream start or idle event

### Tool Icon Mapping
```typescript
function getToolIcon(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name.includes('read') || name.includes('file')) return '📄';
  if (name.includes('write') || name.includes('edit') || name.includes('create')) return '✏️';
  if (name.includes('search') || name.includes('grep') || name.includes('find')) return '🔍';
  if (name.includes('terminal') || name.includes('shell') || name.includes('exec')) return '⚡';
  if (name.includes('web') || name.includes('fetch') || name.includes('http')) return '🌐';
  return '🔧';
}
```

### Elapsed Time Formatting
```typescript
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
```

## Out of Scope

- GUI components or TUI framework (e.g., blessed, ink)
- Changing pipeline mode behavior
- Adding new CLI commands
- Changing the core event system
- Adding external npm dependencies for terminal UI

## Acceptance Criteria Summary

✅ The CLI must have:
- [ ] Animated thinking/spinner indicator during agent processing
- [ ] Elapsed time counter (m:ss format) during operations
- [ ] Unicode tool icons with formatted tool names
- [ ] Agent queue display showing active and waiting agents
- [ ] stderr/stdout visual distinction with color coding
- [ ] Unified status line combining all indicators
- [ ] Clean transitions between busy and idle states
- [ ] No changes to pipeline mode behavior
- [ ] No visual artifacts or terminal corruption
- [ ] Proper cleanup on exit (no orphaned timers)

## Success Metrics

1. **Visual Clarity**: Users can immediately see what agents and tools are doing
2. **Elapsed Visibility**: Time tracking visible for all operations
3. **No Regressions**: Pipeline mode and existing commands unchanged
4. **Terminal Compatibility**: Works in major terminal emulators
5. **Clean Output**: No residual spinner frames or status artifacts

## References

- Electron Activity State: `/electron/renderer/src/activity-state.js`
- Electron Streaming State: `/electron/renderer/src/streaming-state.js`
- Electron Components: `/electron/renderer/src/components/`
- Current CLI Entry: `/cli/index.ts`
- Current CLI Streaming: `/cli/stream.ts`
- Current CLI Commands: `/cli/commands.ts`
- Electron UX Port Req: `/docs/reqs/2026-02-11/req-port-electron-ux-to-web.md`

---

## Architecture Review Notes (AR - 2026-02-11)

### AR Status: ✅ Approved with Recommendations

**Completeness**: All Electron UX patterns covered with appropriate terminal adaptations.

**Key Recommendations**:

1. **New `cli/display.ts` module** (AR Added): Separate display/formatting utilities from streaming data management in `stream.ts`. New module owns: `formatToolName`, `formatElapsed`, `getToolIcon`, `renderStatusLine`, `createSpinner`.

2. **ASCII icon fallback** (AR Added): Unicode emoji icons (📄, 🔍) may have inconsistent width across terminals. Add ASCII fallback detection based on `LANG`/`TERM` environment variables. Fallback icons: `[F]` file, `[S]` search, `[>]` terminal, `[W]` web, `[?]` default.

3. **Readline coordination** (AR Added): Spinner and status line must coordinate with readline prompt. Pattern: clear status line before `rl.prompt()`, resume after input. Failure to do this will corrupt the prompt display.

4. **Terminal width awareness** (AR Added): Truncate status line to `process.stdout.columns - 1` to prevent line wrapping artifacts.

5. **Max visible tools** (AR Added): Cap concurrent tool display at 3 lines, show `+N more` for overflow to prevent terminal flooding.

**Risks Identified**:
- Spinner/readline conflict (High) — mitigated by pause/resume pattern
- Emoji width inconsistency (Medium) — mitigated by ASCII fallback
- Timer leaks on SIGINT (Medium) — mitigated by cleanup in existing handler
- Status line flicker (Low) — mitigated by 100ms throttle
