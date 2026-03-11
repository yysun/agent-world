# REQ: Web Tool Message Compact Display

**Date:** 2026-03-11
**Status:** Draft

---

## Summary

Improve web-app tool message presentation so tool activity no longer appears as a normal assistant chat message.

Tool-related transcript entries must render as a compact, status-oriented UI with a one-line summary, a visible open/collapse control, and a flashing dot indicator for active execution.

---

## Problem

Current web chat rendering makes tool activity easy to confuse with regular assistant replies:

1. Tool request rows still inherit assistant message framing in the transcript.
2. The transcript shows agent-style avatar/meta chrome around tool activity even when the content is operational state, not assistant prose.
3. Tool details are visually heavy relative to their value during normal reading.
4. The current collapse affordance is not explicit enough to communicate that the row is an expandable tool-status item.

This makes it harder to scan a conversation, distinguish assistant responses from tool execution, and understand whether a tool is still running or has already finished.

---

## Goals

1. Make tool activity visually distinct from assistant replies.
2. Reduce tool rows to a compact one-line summary by default.
3. Preserve access to arguments and result/output through an explicit open/collapse interaction.
4. Make active tool execution recognizable at a glance.
5. Keep existing tool lifecycle semantics and transcript reconstruction behavior intact.

---

## Functional Requirements

### FR-1: Tool Rows Must Not Present as Assistant Messages

- Tool-related transcript entries in the web app must not use normal assistant message presentation.
- Merged assistant tool-call rows and standalone tool-result or tool-stream rows must follow the same tool-row presentation rules.
- Tool rows must be visually distinguishable from assistant replies even when they are produced by assistant tool calls.
- Tool rows must not rely on assistant-style framing as the primary visual signal for status or meaning.

### FR-2: Compact One-Line Default State

- Tool rows must render in a compact default state that emphasizes a single-line summary.
- The summary line must be readable without opening the tool details.
- The summary must identify the tool activity in plain language and reflect current execution state.
- Tool rows must remain compact even when backing payloads contain verbose arguments or output.

### FR-3: Explicit Open/Collapse Control

- Each compact tool row must provide an explicit user-visible open/collapse control.
- The control must clearly communicate the current state (`Open` when collapsed, `Collapse` when expanded, or equivalent wording with the same meaning).
- The control must work consistently for both running and completed tool rows where details are available.

### FR-4: Flashing Dot for Active Tool Execution

- A currently running tool row must display a flashing dot indicator adjacent to the one-line summary.
- The flashing dot must communicate active work without requiring the details panel to be opened.
- Terminal states must stop the flashing behavior once the tool finishes or fails.

### FR-5: Expandable Detail View

- Opening a tool row must reveal the relevant details for that tool activity, including request arguments and available result/output content.
- Expanded detail presentation may remain verbose, but it must stay visually subordinate to the compact summary state.
- Multi-tool assistant calls must remain understandable when expanded.

### FR-6: Distinct Status Semantics

- Tool rows must distinguish at least these states in the summary UI:
  - running
  - done
  - failed
- Status presentation must remain deterministic across live streaming and restored chat history.

### FR-7: Transcript Behavior Must Stay Stable

- Tool request/result merging behavior in the web app must continue to produce one coherent tool activity row per tool call group where that behavior already exists.
- Streaming lifecycle ordering must remain intact.
- Completed tool rows must still be reconstructable from canonical persisted assistant tool-call plus tool-result records.

### FR-8: Accessibility and Scanability

- The open/collapse control must expose correct accessibility state.
- The compact summary row must remain understandable without depending only on color.
- The active indicator and summary layout must remain legible in the existing web chat layout on desktop and mobile widths.

---

## Non-Functional Requirements

### NFR-1: No Event Contract Regression

- This UI change must not alter SSE event shape, ordering, or persistence contracts.

### NFR-2: No Transcript Identity Ambiguity

- A user scanning the chat must be able to distinguish assistant prose from tool execution state without opening tool details.

### NFR-3: Compact-by-Default Behavior

- Tool rows must reduce visual noise in long conversations by keeping verbose content hidden until explicitly opened.

---

## Acceptance Criteria

1. A tool call in the web chat no longer looks like a normal assistant reply row.
2. Merged assistant tool-call rows and standalone tool rows both render with tool-specific presentation rather than mixed assistant/tool treatment.
3. A collapsed tool row shows a one-line summary and an explicit open/collapse affordance.
4. A running tool row shows a flashing dot while active.
5. The flashing indicator stops after terminal completion or failure.
6. Opening a tool row reveals its arguments and any available result/output details.
7. Completed tool rows still render correctly after chat reload using existing persisted tool-call and tool-result records.
8. Tool status remains readable and distinguishable for `running`, `done`, and `failed`.
9. At least one targeted unit test must cover the compact summary rendering/state classification boundary.
10. At least one targeted unit test must cover the expand/collapse behavior for tool rows.
11. If transport/runtime path behavior changes while implementing this story, `npm run integration` remains required by project policy.

---

## Assumptions

1. The existing tool message merge model in the web app remains the correct transcript-level model for completed tool activity.
2. The request is focused on transcript presentation, not on changing core tool contracts or persistence shape.
3. The flashing dot is intended for active execution state, not for already completed tool rows.

---

## Out of Scope

1. Changing Electron tool message UI.
2. Changing tool persistence schema or core tool result contracts.
3. Redesigning unrelated assistant, user, or system message presentation.
4. Changing non-tool streaming assistant text behavior.

---

## AR Findings and Resolutions

1. High: Treating this as a pure style tweak would miss the actual confusion source, which is transcript identity and not only color or spacing.
   - Resolution: require tool rows to stop presenting as normal assistant messages.
2. High: Restricting the change to raw `type='tool'` rows would leave merged assistant tool-call rows inside assistant chrome, so the main confusion would remain.
   - Resolution: require merged assistant tool-call rows and standalone tool rows to share the same tool-row presentation contract.
3. Medium: A flashing indicator without a compact default summary would still leave verbose tool payloads dominating the chat.
   - Resolution: require one-line summary-first rendering with details hidden behind explicit open/collapse.
4. Medium: An icon-only chevron can be too subtle to communicate the row’s interaction model.
   - Resolution: require an explicit open/collapse control or equivalent wording with the same clarity.
5. Medium: Over-specifying completed-state visuals could constrain implementation unnecessarily.
   - Resolution: require flashing only for active execution and stable status distinction for terminal states, without forcing one exact final visual treatment.
