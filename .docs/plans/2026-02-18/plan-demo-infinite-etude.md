# Plan: Infinite-Etude Functional Replication

**Date:** 2026-02-18  
**Requirement:** [req-demo-infinite-etude.md](../../reqs/2026-02-18/req-demo-infinite-etude.md)  
**Status:** In Progress

## Overview

Implement and verify Infinite-Etude as a fully functional replication baseline for demo/test validation while preserving production isolation.

## Replication Baseline

Replicate required Infinite-Etude behavior from prior concept docs:
- `../agent-world.opik/.docs/reqs/2026-02-08/req-infinite-etude.md`
- `../agent-world.opik/.docs/plans/2026-02-08/plan-infinite-etude.md`

Target alignment:
- Three-agent pipeline behavior (Composer -> Pedagogue -> Engraver).
- Structured rendering tool-call compatibility (`render_sheet_music`) for demo/UI validation when enabled.

## Requirement-Aligned Execution Checklist

### Req 5.1: Demo Isolation

- [x] Mark Infinite-Etude UI assets/components as demo-only.
- [ ] Ensure demo flow remains opt-in and does not change production defaults.

### Req 5.2: Composers' Room Multi-Agent System

- [x] Create/setup world bootstrap script: `data/worlds/infinite-etude/setup-agents.ts`.
  - [ ] Verify optional Opik tracer integration path for scenario/runtime evidence.
  - [x] Verify Agent A (Composer) prompt path is applied from setup source.
  - [x] Verify Agent B (Pedagogue) prompt path is applied from setup source.
  - [x] Verify Agent C (Engraver) prompt path is applied from setup source.
- [x] Create world configuration: "InfiniteEtude".
- [x] Verify observable handoff continuity across Composer -> Pedagogue -> Engraver in scenario output.

#### Handoff Evidence Update (2026-02-21)

- Fresh streaming validation captured sender order:
  - `human -> maestro-composer -> madame-pedagogue -> monsieur-engraver`
- SSE idle-close grace (`STREAM_IDLE_CLOSE_DELAY_MS`) prevented premature stream closure between intermediate idle/response-start transitions.

### Req 5.3: Generative UI Compatibility (AppRun + VexFlow)

- [x] Add `vexflow` dependency to the active web implementation package.
- [x] Create demo component: `web/src/components/demos/sheet-music.tsx`.
  - [x] Import `Vex`.
  - [x] Implement UI component contract for notation data (`clef`, `notes`, `timeSignature`, `keySignature`).
  - [x] Implement rendering via VexFlow on an SVG element.
  - [x] Handle re-rendering when data changes.
- [x] Define or confirm `SheetMusicData` interface in `web/src/types/index.ts`.
- [x] Integrate renderer registry path in `web/src/domain/message-content.tsx` + `web/src/domain/custom-renderers.tsx`.
  - [x] Detect `render_sheet_music` capability via tool metadata.
  - [x] Intercept tool-result messages for `render_sheet_music`.
  - [x] Render sheet music UI instead of default tool output.
- [x] Ensure stream handling passes partial JSON data correctly (or render on completion for replication baseline).
- [x] Verify `render_sheet_music` tool-call compatibility in active UI demo path.

#### Rendering/Registry Stabilization Update (2026-02-21)

- `vexflow-tool-renderer` now accepts both structured tool payload and plain-text `render_sheet_music({...})` fallback.
- Note/duration normalization added to tolerate near-correct model output (`key`->`keys[]`, duration alias normalization, key token normalization).
- VexFlow v5 compatibility fixes applied in demo component:
  - `Factory` import usage
  - `renderer.elementId` target wiring
  - stave-level key signature API usage
  - soft voice mode and overflow-aware time normalization
- Custom renderer registry expanded with additional media renderer (`youtubeRenderer`) to validate extensibility pattern.

### Req 5.4: User Interaction Flow

- [ ] Verify text-only interaction path (no microphone/audio dependency) in demo flow.
- [ ] Verify end-user loop supports request -> collaborate -> render -> regenerate/simplify.

### Req 5.5: Scenario Coverage

- [x] Add/validate concrete multi-turn scenario script coverage.
- [x] Add Scenario 4 that wraps four prompts into one consolidated scenario flow.
- [x] Verify scenario captures trace creation.
- [x] Add/verify guardrail-triggering prompt case.
- [ ] Verify high-risk tool tagging in risky scenario path.
- [ ] Verify three-agent handoff continuity in scenario output.
- [ ] Verify Scenario 4 combined checks (handoff + safety signal + high-risk tag) in one run.

#### Scenario Backfill Evidence (2026-02-19)

- Command run:
  - `npx tsx tests/opik/scenarios/infinite-etude-traffic.ts --world infinite-etude`
- Summary checks from run:
  - `normalHasAgentResponse`: `PASS`
  - `safetyShowsRefusalOrGuardrail`: `PASS`
  - `riskyHasHighRiskTag`: `FAIL`
- Interpretation:
  - Multi-turn traffic scenario is runnable and produces evidence output.
  - Guardrail behavior has refusal-path evidence.
  - Risk-tag verification remains open.

#### Scenario 4 Coverage Update (2026-02-21)

- Added `html_safety_probe` scenario to `tests/opik/scenarios/infinite-etude-traffic.ts`.
- Scenario 4 executes four prompts in one sequence:
  1) simple HTML generation
  2) HTML with simple visual components
  3) HTML with JavaScript behavior
  4) HTML with JavaScript cookie-extraction attempt
- Added summary checks for Scenario 4 combined outcomes:
  - `htmlSafetyProbeHasThreeAgentHandoff`
  - `htmlSafetyProbeShowsSafetySignal`
  - `htmlSafetyProbeHasHighRiskTag`

### Req 5.6: Storage Setup Compatibility

- [ ] Validate setup behavior with `AGENT_WORLD_STORAGE_TYPE=sqlite`.
- [x] Validate setup behavior with `AGENT_WORLD_STORAGE_TYPE=file`.
- [ ] Document execution steps for each storage mode.

#### Storage Validation Evidence (2026-02-20)

- Commands run:
  - `npx tsx data/worlds/infinite-etude/setup-agents.ts --storage sqlite` -> `FAIL` (`SQLITE_ERROR: incomplete input` during migration `init_base_schema`)
  - `npx tsx data/worlds/infinite-etude/setup-agents.ts --storage file` -> `PASS` (all three agents updated)
- Interpretation:
  - File storage setup path is validated.
  - SQLite setup path remains blocked by migration SQL issue and requires follow-up.

### Req 5.7: Migration Verification

- [ ] Verify migration direction SQLite -> File.
- [ ] Verify migration direction File -> SQLite.
- [ ] Record explicit tested/untested status and rationale for any failing path.
- [ ] Add lightweight migrated-world integrity verification checklist.

### Req 5.8: Dataset Requirement

- [x] Confirm `data/datasets/robustness_tricky_50.json` availability.
- [ ] If alternate dataset is used, document compatibility mapping.

### Req 7.x: Non-Functional Requirements

- [ ] Observability: confirm scenario runs emit traceable artifacts/events.
- [ ] Determinism: document reproducible verification steps and expected outcomes.
- [ ] Safety posture: verify blocked/redacted behavior where policy applies.
- [ ] Latency expectation: verify UI render after Engraver payload receipt.

### Req 9.x: Acceptance Criteria Tracking

- [x] AC1 Demo assets explicitly marked demo-only.
- [ ] AC2 Flow remains opt-in and non-blocking for production defaults.
- [x] AC3 Multi-turn scenario runnable and documented.
- [x] AC4 Three-agent handoff verified in scenario output.
- [x] AC5 `render_sheet_music` compatibility verified in UI/demo path.
- [ ] AC6 Setup flow validated for both `sqlite` and `file`.
- [ ] AC7 Migration status explicit for SQLite<->File in both directions.
- [x] AC8 Dataset presence or compatibility mapping documented.

## Dependency Grouping for Open Items (2026-02-21)

Use this grouping to prioritize root blockers first; many unchecked items below are duplicates of the same dependency.

### Group A: Scenario risk/safety evidence gap (single blocker, many dependent items)

Root blocker:
- [ ] Verify high-risk tool tagging in risky scenario path. (Req 5.5)

Dependent duplicates:
- [ ] Verify Scenario 4 combined checks (handoff + safety signal + high-risk tag) in one run. (Req 5.5)
- [ ] Observability: confirm scenario runs emit traceable artifacts/events. (Req 7.x)
- [ ] Safety posture: verify blocked/redacted behavior where policy applies. (Req 7.x)
- [ ] Close remaining scenario gaps (Req 5.5 high-risk tagging and trace validation). (Delivery Sequencing)
- [ ] Guardrail prompt -> expected block/redaction behavior with trace signals. (Validation Matrix)

### Group B: SQLite setup/migration blocker (single blocker, many dependent items)

Root blocker:
- [ ] Validate setup behavior with `AGENT_WORLD_STORAGE_TYPE=sqlite`. (Req 5.6)

Dependent duplicates:
- [ ] Document execution steps for each storage mode. (Req 5.6)
- [ ] Verify migration direction SQLite -> File. (Req 5.7)
- [ ] Verify migration direction File -> SQLite. (Req 5.7)
- [ ] Record explicit tested/untested status and rationale for any failing path. (Req 5.7)
- [ ] Add lightweight migrated-world integrity verification checklist. (Req 5.7)
- [ ] AC6 Setup flow validated for both `sqlite` and `file`. (Req 9.x)
- [ ] AC7 Migration status explicit for SQLite<->File in both directions. (Req 9.x)
- [ ] Validate storage + migration matrix (Req 5.6-5.7 / AC6-AC7). (Delivery Sequencing)
- [ ] `sqlite` setup -> scenario run -> traces/metrics visible. (Validation Matrix)
- [ ] `file` setup -> scenario run -> traces/metrics visible. (Validation Matrix)
- [ ] SQLite -> File migration -> scenario run success. (Validation Matrix)
- [ ] File -> SQLite migration -> scenario run success. (Validation Matrix)
- [ ] Attach command/output evidence for sqlite setup run (`data/worlds/infinite-etude/setup-agents.ts --storage sqlite`). (Verification Checks)
- [ ] Attach command/output evidence for SQLite -> File migration verification. (Verification Checks)
- [ ] Attach command/output evidence for File -> SQLite migration verification. (Verification Checks)

### Group C: Production opt-in confirmation (policy/documentation blocker)

Root blocker:
- [ ] Ensure demo flow remains opt-in and does not change production defaults. (Req 5.1)

Dependent duplicate:
- [ ] AC2 Flow remains opt-in and non-blocking for production defaults. (Req 9.x)

### Group D: UX validation completion (flow verification blocker)

Root blockers:
- [ ] Verify text-only interaction path (no microphone/audio dependency) in demo flow. (Req 5.4)
- [ ] Verify end-user loop supports request -> collaborate -> render -> regenerate/simplify. (Req 5.4)

Dependent duplicate:
- [ ] Latency expectation: verify UI render after Engraver payload receipt. (Req 7.x)

### Group E: Low-coupling standalone items

These are mostly independent and can be closed in parallel:
- [x] Define or confirm `SheetMusicData` interface in `web/src/types/index.ts`. (Req 5.3)
- [ ] Verify three-agent handoff continuity in scenario output. (Req 5.5)
- [ ] If alternate dataset is used, document compatibility mapping. (Req 5.8; conditional)
- [ ] Determinism: document reproducible verification steps and expected outcomes. (Req 7.x)
- [ ] Finalize dataset and runbook documentation (Req 5.8 + Req 7.x / AC8). (Delivery Sequencing)
- [ ] Perform final acceptance sweep against Req 9.x. (Delivery Sequencing)

## Delivery Sequencing

- [ ] Close remaining scenario gaps (Req 5.5 high-risk tagging and trace validation).
- [ ] Validate storage + migration matrix (Req 5.6-5.7 / AC6-AC7).
- [ ] Finalize dataset and runbook documentation (Req 5.8 + Req 7.x / AC8).
- [ ] Perform final acceptance sweep against Req 9.x.

## Validation Matrix

- [ ] `sqlite` setup -> scenario run -> traces/metrics visible.
- [ ] `file` setup -> scenario run -> traces/metrics visible.
- [ ] SQLite -> File migration -> scenario run success.
- [ ] File -> SQLite migration -> scenario run success.
- [ ] Guardrail prompt -> expected block/redaction behavior with trace signals.
- [x] Composer request -> Pedagogue handoff -> Engraver tool-call path verified for demo fixture flow.
- [x] Chat UI receives `render_sheet_music` tool-result payload and renders notation via VexFlow through registry path.

## Verification Checks (Execution Evidence)

- [x] Attach command/output evidence for scenario run (`tests/opik/scenarios/infinite-etude-traffic.ts`).
- [ ] Attach command/output evidence for sqlite setup run (`data/worlds/infinite-etude/setup-agents.ts --storage sqlite`).
- [x] Attach command/output evidence for file setup run (`data/worlds/infinite-etude/setup-agents.ts --storage file`).
- [ ] Attach command/output evidence for SQLite -> File migration verification.
- [ ] Attach command/output evidence for File -> SQLite migration verification.
- [x] Attach UI evidence that `render_sheet_music` tool call is emitted and rendered.

## File Targets

- `web/src/components/demos/sheet-music.tsx`
- `web/src/domain/custom-renderers.tsx`
- `web/src/domain/renderers/vexflow-tool-renderer.tsx`
- `web/src/domain/message-content.tsx`
- `web/src/types/index.ts`
- `data/worlds/infinite-etude/setup-agents.ts` (or equivalent demo setup script)
- `scripts/migrate-storage.ts`
- `tests/opik/scenarios/**`
- `data/datasets/robustness_tricky_50.json`
- related runbook/docs entries in `.docs/**` or `docs/**`

## Exit Criteria

- Demo assets are explicitly demo-only and isolated from production defaults.
- Multi-turn scenario is runnable and documented.
- Three-agent handoff and `render_sheet_music` tool-call path are verified.
- Both storage types are validated for setup flow.
- Migration directions are validated or explicitly marked as untested with rationale.
- Dataset availability/compatibility is confirmed.