# REQ: load_skill User Feedback

**Date:** 2026-03-01
**Status:** Reviewed (AR Complete, Implementation Ready)
**Focus:** Core (`load-skill-tool.ts`, `utils.ts`)

> Historical note: references below to scripts running during `load_skill` reflect the older contract.
> Since 2026-03-22, `load_skill` is a pure load step, later explicit tool calls own task execution,
> and `load_skill` no longer emits assistant-displayable preview/synthetic result content.

---

## Architecture Review

### AR #1 — 2026-03-01

1. **R1–R6 are pure text injections.** All acknowledgment and narration changes are string edits inside `buildSuccessResult` and `prepareSkillsSystemPromptSection`. No behavioral logic changes.
2. **R3 thread-through.** `entry.description` exists on `SkillRegistryEntry` but is not currently passed to `buildSuccessResult`. The function signature needs one new field (`skillDescription: string`) and the call site must supply `entry.description`.
3. **R7 prerequisite.** `world.eventEmitter` in `LoadSkillToolContext` is typed `unknown`; `publishEvent` requires a typed `World`. Emitting events requires a narrow cast or a typed helper in the context. Mark as stretch with explicit prerequisite in the plan.
4. **Step renumbering.** Adding a mandatory announcement as "step 0" is awkward. Prefer clean renumbering: announcement = step 1, existing steps shift +1. Plan adopts renumbering.
5. **Test impact.** Tests asserting exact `execution_directive` text will break. Plan must include an explicit test-update task.

### AR #2 — 2026-03-01

1. **R3 fallback clarified.** Empty/whitespace descriptions must resolve to `skillId` before directive injection.
2. **R5 verification path clarified.** Prompt alignment assertions are covered in `tests/core/prepare-messages-for-llm.test.ts` and should be updated with the new rule.

---

## Overview

When `load_skill` executes, users currently have no visibility into what skill was loaded, what the model intends to do, or what is happening during execution. This requirement defines the feedback behaviors the system must provide to keep users informed throughout the skill loading and execution flow.

## Problem Statement

The `load_skill` flow has three dead zones from the user's perspective:

1. **After HITL approval**: No status while the skill file is read, scripts run, and instructions inject into context.
2. **After loading**: The model may silently begin executing the skill without telling the user which skill was activated or what it will do.
3. **During execution**: No systematic progress narration between steps — the model may execute silently through a multi-step workflow.

## Goals

1. **Skill Activation Acknowledgment**: The model must tell the user which skill was loaded and its purpose before taking any action.
2. **Pre-Execution Intent Declaration**: The model must state its intended approach before executing — for every workflow, not just multi-step ones.
3. **Step-level Progress Narration**: During multi-step workflows, the model must update the user after each significant step and indicate what comes next.
4. **Skill Description in Directive**: The model must have access to the skill's human-readable description so it can narrate meaningfully, not just recite the skill ID.
5. **System Prompt Alignment**: The `available_skills` guidance must reinforce the post-load acknowledgment rule at the system level.
6. **UI Status Events** *(stretch)*: The system emits structured events for `skill_loading` and `skill_loaded` states so frontends can show progress indicators independently of the model's response.

## Requirements

### R1 — Mandatory Skill Load Acknowledgment
When `load_skill` returns a successful result, the model's first response MUST include a statement telling the user:
- Which skill was activated (by name)
- What the skill is for (from its description)
- What the model intends to do next

The acknowledgment must appear before any tool calls or execution steps.

### R2 — Unconditional Pre-Execution Plan
The model MUST declare its intended approach before executing actions, regardless of whether the workflow is single-step or multi-step. The existing "if the workflow is multi-step" qualifier must be removed — plan declaration is always required.

### R3 — Skill Description Availability
The `execution_directive` injected in the `load_skill` tool result MUST include the skill's description field so the model has meaningful context to narrate with. If the description is empty, fall back to the skill ID.

### R4 — Step Completion Narration
For multi-step skill workflows, after each significant step the model MUST briefly confirm what was completed and what comes next before moving to the next step.

### R5 — System Prompt Alignment
The `available_skills` system prompt section MUST include a rule: after successfully loading a skill via `load_skill`, the model always acknowledges the loaded skill and its purpose to the user before proceeding.

### R6 — Tool Description Guidance *(low effort)*
The `load_skill` tool description string MUST include narration guidance so the model has the instruction available at planning time (before it decides to call the tool).

### R7 — UI Progress Events *(stretch)*
The `load_skill` execute function SHOULD emit structured events via `world.eventEmitter`:
- `skill_loading` before the HITL approval request
- `skill_loaded` after a successful result is built

This allows frontends to show a progress indicator during the approval + execution window, independent of model response text.

### R8 — Targeted Test Coverage (Required)
Implementation MUST add or update targeted deterministic unit tests for each modified behavior area:
- `load_skill` success directive changes in `tests/core/load-skill-tool.test.ts`
- skills system prompt section updates in `tests/core/prepare-messages-for-llm.test.ts`
- if R7 is implemented, add focused event emission tests covering `skill_loading` and `skill_loaded` payloads

Tests must assert behavior at the unit boundary (result payload text and emitted events), not internal implementation details.

## Non-Goals

- Do not change the HITL approval flow, options, or session approval caching.
- Do not change the skill registry, discovery, hash, or caching logic.
- Do not modify SKILL.md format or front-matter parsing.
- Do not add new UI components — frontends consume existing event channels.
- Do not change the declined/not-found/error result payloads.

## User Stories

1. As a user, after approving a skill, I immediately see a message telling me which skill is active and what it will do — before any actions are taken.
2. As a user, I always see the model's planned approach before it starts executing steps, even for simple single-step tasks.
3. As a user, during a long skill workflow, I receive brief progress updates after each major step.
4. As a developer, I can observe `skill_loading`/`skill_loaded` events from the world event emitter to build UI indicators.

## Edge Cases

1. **Declined skill**: No acknowledgment needed — the declined result communicates this already.
2. **Not-found or error**: No acknowledgment needed — error result communicates this.
3. **Duplicate suppression**: When a skill load is suppressed (already loaded in run), the continuation notice already informs the model the skill is active. No additional user notification is needed from `load_skill` itself.
4. **Empty description**: Model must still acknowledge — use the skill ID as fallback name.
5. **Script execution output**: If `<active_resources>` contains script output, the acknowledgment should mention that setup data was loaded.
