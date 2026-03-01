# AP: load_skill User Feedback

**Date:** 2026-03-01
**Status:** Ready for Implementation
**REQ:** `.docs/reqs/2026/03/01/req-load-skill-feedback.md`

---

## Architecture Review

### AR #1 — 2026-03-01

1. **Phases 1–2 are pure injected text changes.** `buildSuccessResult` and the system prompt helper are self-contained — no risk to approval, caching, or registry logic.
2. **Description thread-through is minimal.** One new param in `buildSuccessResult`, one extra field at the call site. No cascading changes.
3. **Phase 3 (UI events) has a gating prerequisite.** `world.eventEmitter` is typed `unknown` in `LoadSkillToolContext`. Must resolve typing before emitting — either narrow-cast in `load-skill-tool.ts` or add a typed `emitSkillEvent` helper. If typing is non-trivial, defer Phase 3.
4. **Tests must be updated.** Step renumbering in `execution_directive` will break snapshot/text assertions in `tests/core/load-skill-tool.test.ts`. Update as part of Phase 1.

### AR #2 — 2026-03-01

1. **R3 fallback gap identified and fixed in plan.** AP now requires normalization of empty `entry.description` to `entry.id` before injecting `skillDescription`.
2. **Phase 2 test target made explicit.** AP now points to `tests/core/prepare-messages-for-llm.test.ts` for exact-text prompt assertion updates.
3. **Success criteria tightened to R1.** Criteria now explicitly require announcing skill, purpose, and intended next action.

---

## Overview

Three-phase implementation to surface `load_skill` progress to users:

1. **Phase 1** — Execution directive rewrite + skill description thread-through (`load-skill-tool.ts`)
2. **Phase 2** — System prompt acknowledgment rule (`utils.ts`)
3. **Phase 3** *(stretch)* — UI progress events via `world.eventEmitter`

---

## Implementation Preflight (Blocking)

Before starting `SS`, confirm all items:

- [x] Implement only files listed in this AP; no unrelated refactors
- [x] Add/update targeted unit tests for every changed behavior area
- [x] Keep tests deterministic (no real network/time dependencies)
- [x] Run targeted test files first, then run full `npm test`
- [x] If Phase 3 runtime/event path is implemented, run `npm run integration` *(N/A in this SS pass; Phase 3 deferred)*

---

## Phase 1: Execution Directive + Description Thread-Through

**Files:** `core/load-skill-tool.ts`, `tests/core/load-skill-tool.test.ts`

### Tasks

- [x] **P1.1** Add `skillDescription: string` field to `buildSuccessResult` options type
- [x] **P1.2** Normalize description at the `buildSuccessResult` call site: pass `entry.description?.trim() || entry.id` as `skillDescription` (around line 1010)
- [x] **P1.3** Rewrite `execution_directive` in `buildSuccessResult`:
  - Add `Skill purpose: {escapedDescription}` line immediately after the protocol header line (using normalized fallback from P1.2)
  - **Step 1 (new):** REQUIRED — begin response by telling the user which skill was loaded, its purpose, and what you intend to do. Do this before any tool calls or execution.
  - **Step 2:** Prioritize the logic in `<instructions>` over generic behavior. *(was step 1)*
  - **Step 3:** Use `<active_resources>` data / skill instructions to complete the request. *(was step 2)*
  - **Step 4:** Always state your intended approach before executing — whether the workflow is single-step or multi-step. *(was step 3, remove "If" conditional)*
  - **Step 5:** When using tools, provide a brief intent statement first. *(was step 4)*
  - **Step 6:** After each significant step, briefly confirm what was completed and what comes next. *(new)*
  - **Step 7:** Script path guidance. *(was step 5, conditional on `hasReferencedScripts`)*
- [x] **P1.4** Update `load_skill` tool `description` string to end with: `"After loading, announce the active skill and its purpose to the user before proceeding."`
- [x] **P1.5** Update `tests/core/load-skill-tool.test.ts` to match new directive text (steps renumbered, new step 1 and step 6, description line added), including a regression assertion for empty-description fallback to skill ID
- [x] **P1.6 (Targeted Tests)** Add/adjust 1-3 focused assertions for:
  - acknowledgment-first instruction in step 1
  - unconditional plan declaration language (no multi-step conditional)
  - `Skill purpose` fallback to skill ID when description is empty

---

## Phase 2: System Prompt Alignment

**Files:** `core/utils.ts`, `tests/core/prepare-messages-for-llm.test.ts`

### Tasks

- [x] **P2.1** In the `available_skills` prompt section, add item 4: `"4. After successfully loading a skill, ALWAYS acknowledge it to the user: state which skill was loaded and briefly describe what you will do before taking any action."`
- [x] **P2.2** Update `tests/core/prepare-messages-for-llm.test.ts` exact-text assertions for `prepareSkillsSystemPromptSection` to include new item 4
- [x] **P2.3 (Targeted Tests)** Add/adjust focused assertion that item 4 appears in the generated `<available_skills>` section

---

## Phase 3: UI Progress Events *(stretch)*

**Files:** `core/load-skill-tool.ts`, `core/types.ts` (if typing change needed)

### Prerequisite
`world.eventEmitter` in `LoadSkillToolContext` is currently typed `unknown`. Before emitting, resolve one of:
- Narrow-cast in the execute function: `const emitter = context?.world?.eventEmitter as import('events').EventEmitter | undefined`
- Or add a typed `emitWorldEvent(world: unknown, type: string, payload: object): void` helper that internally guards the cast

### Tasks

- [ ] **P3.1** Choose and implement the typing resolution (cast vs. helper)
- [ ] **P3.2** Emit `{ type: 'skill_loading', skillId }` before the `requestSkillExecutionApproval` call in `execute`
- [ ] **P3.3** Emit `{ type: 'skill_loaded', skillId, scriptCount: scriptOutputs.length }` after `buildSuccessResult` is built, before returning the result
- [ ] **P3.4** Document the event payload shapes in a comment near the emit calls for frontend consumers
- [ ] **P3.5 (Targeted Tests)** If Phase 3 is implemented, add focused tests for `skill_loading` and `skill_loaded` emissions and payload shape

---

## File Impact

| File | Phase | Change |
|------|-------|--------|
| `core/load-skill-tool.ts` | 1, 3 | `buildSuccessResult` signature, directive text, tool description, optional events |
| `core/utils.ts` | 2 | `available_skills` prompt section — add post-load acknowledgment rule |
| `tests/core/load-skill-tool.test.ts` | 1 | Update directive text assertions |
| `core/types.ts` | 3 (optional) | Strengthen `world.eventEmitter` type if chosen approach requires it |

---

## Success Criteria

- [x] Model's first response after `load_skill` success includes which skill was loaded, its purpose, and what it will do next
- [x] Execution directive no longer has the "if multi-step" condition — plan narration is always required
- [x] Skill description is embedded in the directive so the model can narrate meaningfully (with empty-description fallback to skill ID)
- [x] Tool description includes post-load narration guidance
- [x] System prompt `available_skills` section includes the acknowledgment rule
- [x] Targeted tests are added/updated and passing in `tests/core/load-skill-tool.test.ts` and `tests/core/prepare-messages-for-llm.test.ts`
- [x] Full test suite passes via `npm test`
- [ ] *(stretch)* `skill_loading` and `skill_loaded` events fire on `world.eventEmitter` during execution
- [ ] *(stretch)* If Phase 3 is implemented, integration tests pass via `npm run integration`
