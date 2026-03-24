# Web App — Styling, Events, and Async Generator Rules

Rules for anyone writing or modifying the AppRun-based web frontend.

These rules apply to:

- App shell code in `web/src/app-shell/*`
- Foundations in `web/src/foundations/*`
- Primitives in `web/src/primitives/*`
- Patterns in `web/src/patterns/*`
- Feature-owned UI in `web/src/features/*`
- CSS in `web/src/styles.css`
- Transitional UI compatibility modules in `web/src/components/*`
- AppRun event/update flows in `web/src/pages/World.update.ts`
- Routed page state in `web/src/pages/*`

---

## Layered UI Architecture

The web app follows a layered UI architecture adapted for AppRun:

```text
Foundations <- Primitives <- Patterns <- Feature views <- Pages / App shell
```

Use these ownership rules when adding or moving UI code:

1. Foundations hold shared visual tokens and base styles only. No JSX belongs here.
2. Primitives hold generic single-purpose controls such as buttons, inputs, selects, and textareas.
3. Patterns hold reusable UI compositions built from primitives, such as labeled fields, modal shells, empty states, and shared action rows.
4. Features hold business-specific views, route-local UI, and AppRun flow helpers for one domain area.
5. Pages remain AppRun route entry points. They may assemble feature views and patterns, but they should not own generic control implementations.
6. App shell code owns top-level layout and route composition.
7. `web/src/components/*` is transitional compatibility surface only. Do not add new feature UI there unless it is a temporary shim preserving an existing import path.

### UI dependency rules

Treat the UI layers as an adjacent-only chain:

- Foundations must not import from Primitives, Patterns, Features, Pages, App shell, or transitional Components.
- Primitives may depend on Foundations, but not on Patterns, Features, Pages, App shell, or transitional Components.
- Patterns may depend on Foundations and Primitives, but not on Features, Pages, App shell, or transitional Components.
- Feature-owned UI may depend on Patterns, plus non-UI modules such as `api`, `types`, `domain`, and `utils`.
- Pages and App shell may assemble Features and Patterns, but must not import Primitives or Foundations directly.
- Feature-owned UI must not import sibling feature UI directly. Cross-feature assembly belongs in Pages or App shell.
- Feature-owned UI must not import from the transitional `components/` folder except when preserving an existing public surface during migration.

### Placement guidance

- If a control is generic and reusable, place it in Primitives.
- If a UI structure composes primitives and is reusable across domains, place it in Patterns.
- If a component is specific to one route, workflow, or domain concept, keep it in the owning Feature.
- If a module wires multiple features together, keep that composition in a Page or the App shell.
- If you need to preserve an old import path while moving ownership, leave a thin compatibility re-export in `web/src/components/*` and move the real implementation into the correct feature or layer.

### Layering review checklist

- Prefer importing shared UI from the nearest allowed layer instead of reaching past it.
- Do not add new raw button/input/select/textarea implementations directly in Features or Pages when an existing Primitive or Pattern already covers the need.
- Keep AppRun route classes and update handlers as route/feature owners, not as generic design-system modules.
- When changing layer boundaries, update the corresponding architectural tests in `tests/web-domain/*layer*` or other targeted boundary coverage.

---

## Critical: `body` Always Has Class `doodle`

`index.html` sets `<body class="doodle">`. This means **every element on the page is a descendant of `.doodle`** and is subject to doodle.css rules at all times — not just in a "doodle theme" mode.

### What doodle.css does automatically

| Selector | Property | Value | Effect |
|---|---|---|---|
| `body` (via our `styles.css`) | `font-family` | `'Short Stack', cursive` | All text is handwritten unless overridden |
| `body` (via our `styles.css`) | `font-size` | `2em` | Base font is 2× browser default (≈32px) |
| `.doodle button, .doodle input, .doodle select` (doodle.css) | `font-size` | `0.5em` | Controls shrink to 0.5×body = ≈0.95rem |
| `.doodle button, .doodle input, .doodle select` (doodle.css) | `font-family` | `'Short Stack', cursive` | Controls inherit handwritten font |
| `.doodle button, .doodle input, .doodle select` (doodle.css) | `border-style/width/image` | `url(button.svg)` | Adds a hand-drawn border frame to every form control |
| `.doodle select` (doodle.css) | `appearance: none` | — | Removes native OS select chrome |
| `.doodle select` (doodle.css) | `background` | `url(caret.svg)` | Replaces native arrow with its own hand-drawn caret |
| `.doodle select` (doodle.css) | `background-position-x` | `calc(100% - 10px)` | Positions the caret 10px from the right |

---

## Overriding Doodle for Composer Controls

Composer toolbar controls (textarea, buttons, select) live in `.composer-toolbar` and need to look clean (no hand-drawn border, consistent font). All overrides must use `!important` because doodle.css specificity matches or exceeds single-class selectors.

### Established override pattern

```css
/* Step 1: Kill border-image for all composer controls */
.doodle .my-control {
  border: none !important;
  border-image: none !important;
}

/* Step 2: For <select> elements — also kill caret.svg and reset font */
.doodle .my-select-control {
  border-style: none !important;
  border-width: 0 !important;
  border-image: none !important;
  /* Replace doodle's caret.svg with a custom inline SVG arrow */
  background: transparent url("data:image/svg+xml,...") no-repeat right 0.5rem center !important;
  /* Match font to sibling button controls (Short Stack wins via .doodle button specificity) */
  font-family: 'Short Stack', cursive !important;
  font-size: var(--interactive-control-font-size, 0.95rem) !important;
  color: <your-token> !important;
  /* Ensure enough right padding so text doesn't overlap the arrow */
  padding-right: 1.6rem !important;
}
```

> **Why `'Short Stack'` not `'Inter'`?**
> `.doodle button` (specificity 0,1,1) beats `.composer-project-button` (0,1,0), so buttons
> actually render in Short Stack. A `<select>` in the same toolbar must use the same font
> to visually match — even though the base `.composer-tool-permission-select` rule says Inter.

### Do NOT use `background-position-x: unset !important`

Doodle sets `background-position-x: calc(100% - 10px)` on `.doodle select`. Overriding it with
`unset` resolves to `0%` (left edge), which moves the arrow to the left side of the control.
Instead, override the entire `background` shorthand with `!important` — the shorthand already
encodes `right 0.5rem center`.

---

## CSS Custom Properties for Interactive Controls

All composer toolbar controls use these CSS variables for sizing consistency:

| Variable | Default | Used by |
|---|---|---|
| `--interactive-control-height` | `2rem` | composer textarea, project button, permission select |
| `--interactive-control-font-size` | `0.95rem` | all toolbar controls and their doodle overrides |
| `--interactive-submit-button-size` | `2.05rem` | submit/stop button |

To resize controls globally, override these variables on `.composer-toolbar` or a parent.

---

## Adding a New `<select>` to the Composer Toolbar

Checklist:
1. Add base CSS class (e.g., `.composer-my-select`) with `appearance: none`, `border: none`, custom SVG arrow via `background` shorthand, and `padding-right` to clear the arrow.
2. Add a `.doodle .composer-my-select` override block with **all** doodle-clobbered properties as `!important` (see pattern above).
3. Add the class to the existing border-reset group:
   ```css
   .doodle .composer-textarea,
   ...
   .doodle .composer-my-select {
     border: none !important;
     border-image: none !important;
   }
   ```
4. Verify font matches `.composer-project-button` (Short Stack wins in doodle context).

---

## AppRun Event Handling Rules

The web app uses AppRun with typed events and generator-based state transitions.

### Required event-handling rules

1. Keep AppRun update handlers as the source of truth for web UI state.
2. Prefer pure synchronous handlers for single-step state changes.
3. Use typed event names and payloads from `web/src/types/events.ts`; do not introduce ad-hoc event strings without updating the shared event types.
4. Do not call `app.run(...)` from one AppRun update handler to trigger another AppRun update handler as part of normal control flow.
5. When one handler needs another handler's multi-step behavior, extract a shared local flow helper and compose it directly.
6. Preserve chat scoping, SSE event ordering, HITL scoping, and world hydration semantics when changing handlers in `World.update.ts`.
7. Keep scheduler or external-source dispatches distinct from handler composition.

### `app.run(...)` rule

Inside AppRun update handlers:

- Do not use `app.run(...)` for handler-to-handler chaining.
- Prefer `yield*` into a shared async-generator flow when the next state transition belongs to the current handler.
- Prefer a shared synchronous helper when the flow is single-step.

Outside AppRun update handlers:

- `app.run(...)` remains acceptable for external event sources such as SSE callbacks, timers, resize listeners, or browser APIs that need to publish into AppRun.

### Event-flow expectations for `World.update.ts`

- `key-press` and click-triggered send paths must stay behaviorally aligned.
- World refresh flows must preserve transient messages that are intentionally carried across refresh.
- System events must stay chat-scoped.
- Streaming lifecycle semantics must remain `start -> chunk -> end` with explicit error handling.
- Queue/HITL state must remain scoped to the active chat and reconstructable after refresh.

---

## Async Generator Rules

Async generators are the preferred mechanism for multi-step UI state transitions in the web app.

### Use `async function*` when

- A handler must yield an intermediate state before awaiting async work.
- A flow has a clear sequence such as `loading -> success`, `optimistic -> settled`, or `queued -> hydrated`.
- Multiple triggers need to share the same multi-step state logic.
- One handler should compose another multi-step flow directly with `yield*`.

Examples in the current codebase:

- `initWorld`
- `sendMessageFlow`
- `handleSystemEvent`
- `create-new-chat`
- modal save/delete flows in `agent-edit.tsx` and `world-edit.tsx`

### Do not use `async function*` when

- The update is a single synchronous state change.
- The logic is a simple async fetch that belongs to a top-level routed page's initial state.
- The code is an external event producer rather than an AppRun state owner.

### `state = async` rule

Use `state = async` only for top-level routed page initialization, such as loading route data on first render.

- Good fit: `web/src/pages/Home.tsx`
- Do not use `state = async` for JSX-embedded modal or leaf components
- For embedded components, use `mounted(...)` plus handler-based updates

### Generator composition rules

1. Prefer local reusable helpers that return `AsyncGenerator<State>`.
2. Prefer `yield* helper(state, payload)` over dispatching another AppRun event.
3. Validate blocking conditions before yielding optimistic UI when the action must not create transient state.
4. Keep yielded states at the production boundary:
   - loading flags
   - optimistic transcript rows
   - hydrated world/chat state
   - error state visible to the user
5. Keep side effects narrow and explicit after the yielded state sequence is clear.

### Testing requirements for generator flows

- Add targeted unit coverage for each changed generator flow.
- Assert yielded states in order, not internal implementation details.
- Cover at least:
  - optimistic or loading first yield
  - final success/error yield
  - an edge case that must not emit an invalid intermediate state
