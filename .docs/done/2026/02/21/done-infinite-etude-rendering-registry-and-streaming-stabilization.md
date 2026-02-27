# Done: Infinite-Etude Rendering, Registry, and Streaming Stabilization

**Date:** 2026-02-21  
**Related Requirement:** [.docs/reqs/2026-02-18/req-demo-infinite-etude.md](../../reqs/2026-02-18/req-demo-infinite-etude.md)  
**Related Plan:** [.docs/plans/2026-02-18/plan-demo-infinite-etude.md](../../plans/2026-02-18/plan-demo-infinite-etude.md)

## Summary

This update stabilizes the Infinite-Etude web path end-to-end by addressing stream lifecycle timing, handoff reliability, renderer robustness, and VexFlow v5 integration mismatches. It also extends the custom renderer registry with a YouTube renderer to prove the generalized media-render pipeline.

## What Was Implemented

### 1) Streaming lifecycle fix (prevents truncated multi-agent chains)

- Updated SSE handling to avoid premature close when world transitions through intermediate `idle` states.
- Added idle-close grace behavior and cancellation on subsequent `response-start` events.
- Result: web streaming reliably captures the full chain through Engraver.

Primary file:
- `server/sse-handler.ts`

### 2) Handoff reliability for Infinite-Etude

- Tightened Pedagogue/Engraver prompt contracts for deterministic paragraph-start mention behavior.
- Added runtime safeguard for Pedagogue->Engraver handoff continuity in Infinite-Etude flow.

Primary files:
- `data/worlds/infinite-etude/prompts/madame-pedagogue.md`
- `data/worlds/infinite-etude/agents/madame-pedagogue/system-prompt.md`
- `data/worlds/infinite-etude/prompts/monsieur-engraver.md`
- `data/worlds/infinite-etude/agents/monsieur-engraver/system-prompt.md`
- `core/events/memory-manager.ts`

### 3) Sheet music renderer hardening (tool payload + plain text fallback)

- Added fallback parsing for plain-text `render_sheet_music({...})` messages when strict tool payload is absent.
- Added normalization for malformed-but-close payloads:
  - `key` alias mapped to `keys[]`
  - duration aliases normalized to VexFlow-safe durations
  - note token cleanup/normalization
- Improved rendering resilience for overfull bars to avoid runtime failures.

Primary files:
- `web/src/domain/renderers/vexflow-tool-renderer.tsx`
- `web/src/components/demos/sheet-music.tsx`

### 4) VexFlow v5 debugging and API fixes

Addressed multiple runtime errors encountered in sequence:

1. `Cannot destructure property 'Factory' of 'Vex.Flow' as it is undefined`
   - Cause: legacy namespace usage with VexFlow v5
   - Fix: use v5 import style (`Factory`)

2. `BadElement: SVG context requires an HTMLDivElement`
   - Cause: renderer target mismatch
   - Fix: strict div guard + `renderer.elementId`

3. `BadArgument: Too many ticks`
   - Cause: malformed or overfull measure durations
   - Fix: non-strict/soft voice mode + overflow-aware time normalization

4. `system.addKeySignature is not a function`
   - Cause: method called on `System` instead of returned stave
   - Fix: apply key signature via stave API

### 5) Registry extensibility enhancement (YouTube)

- Added a reusable custom renderer for YouTube links/tool payloads.
- Supports extraction from `youtube.com`, `youtu.be`, `shorts`, and `embed` URL formats.
- Registered in the custom renderer pipeline (first-match resolution).

Primary files:
- `web/src/domain/renderers/youtube-renderer.tsx`
- `web/src/domain/custom-renderers.tsx`

## Debugging Highlights

- Verified sender continuity using fresh streaming runs and persisted event inspection.
- Confirmed presence of all agents in sender sequence:
  - `human -> maestro-composer -> madame-pedagogue -> monsieur-engraver`
- Searched event logs for persisted render-failure strings; no matching render-error text persisted server-side in latest validation runs.
- Built confidence through iterative typecheck/build validation after each patch.

## Validation Performed

- `npm run check --workspace=web` (re-run after each renderer/VexFlow patch)
- `npm run build --workspace=web`
- Scenario/stream checks in Infinite-Etude traffic and fresh web-style streaming path

## Current Status

Completed in this phase:
- Three-agent web-stream handoff continuity
- `render_sheet_music` compatibility in active web path
- VexFlow renderer stability improvements
- Registry extension pattern validated (YouTube renderer)

Still open from overall requirement/plan:
- Full storage matrix completion (`sqlite` path still blocked by migration issue)
- Explicit migration-direction verification (SQLite<->File)
- Optional loop-stop policy for Pedagogue/Engraver ping-pong after first successful engraving
