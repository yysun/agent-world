# Requirement: Infinite-Etude Functional Replication

## 1. Context

Infinite-Etude is a demo/test capability in this repository. It must be fully functional for scenario validation and UI demonstration, while remaining isolated from production-default behavior.

This requirement is treated as a replication baseline (not a merge): reproduce required behavior from the prior Infinite-Etude concept within this repo's current architecture and constraints.

## 2. Product Overview

Infinite-Etude is a generative sight-reading trainer concept, leveraging `agent-world` multi-agent architecture and generative UI features.

The system composes, fingers, and engraves sheet music in real time based on user requests, without requiring audio input.

## 3. Objectives

1. Deliver a working end-to-end Infinite-Etude flow for text-driven music exercise generation.
2. Preserve the three-agent Composers' Room behavior:
   - `Maestro Composer` -> `Madame Pedagogue` -> `Monsieur Engraver`.
3. Support demo UI rendering compatibility through Engraver tool output (`render_sheet_music`) when UI path is enabled.
4. Keep all demo assets and flows opt-in and non-blocking for production runtime.
5. Validate setup, migration, and scenario execution under both storage backends.

## 4. Scope

### 4.1 In Scope

- Multi-agent composition, pedagogical revision/fingering, and engraving handoff flow.
- Text-only interaction flow (no microphone/audio capture dependency).
- Structured sheet-music render payload generation and compatibility checks for UI path.
- Scenario execution for trace creation, risk tagging, and guardrail outcomes.
- Setup and migration validation across:
  - `AGENT_WORLD_STORAGE_TYPE=sqlite`
  - `AGENT_WORLD_STORAGE_TYPE=file`
- Dataset availability/compatibility checks for `data/datasets/robustness_tricky_50.json`.

### 4.2 Out of Scope

- Making Infinite-Etude a required production startup dependency.
- Enabling Infinite-Etude UI by default in production UX paths.
- Audio synthesis, pitch detection, or DSP/FFT features.

## 5. Functional Requirements

### 5.1 Demo Isolation

- Infinite-Etude assets/components are marked demo-only.
- Demo flow is opt-in and does not change production defaults.

### 5.2 Composers' Room Multi-Agent System

A coordinated team of three specialized AI agents works in a pipeline or debate format.

1. **Agent A (The Composer)**
   - Responsibility: generates musical compositions (notes, rhythm, harmony) based on user intent (for example, "sad and slow", "C Major arpeggio").
   - Output format: ABC Notation or MusicXML text.

2. **Agent B (The Pedagogue/Fingerer)**
   - Responsibility: validates playability and assigns biomechanically correct left-hand fingerings.
   - Critique behavior: rewrites impossible passages (for example, uncomfortable intervals) and optimizes for player skill level.

3. **Agent C (The Engraver/UI)**
   - Responsibility: translates the finalized composition into a structured JSON payload for the UI.
   - Output behavior: streams JSON that commands the frontend to render sheet music.

Required pipeline outcomes:
- Composer generates exercise content from user intent.
- Pedagogue validates playability and improves fingering/ergonomics.
- Engraver produces render-ready structured output for UI path.
- Handoff progression across all three agents is observable in scenario output.

### 5.3 Generative UI Compatibility (AppRun + VexFlow)

- The frontend renders music dynamically rather than static text/images.
- Rendering engine: VexFlow renders standard music notation (staves, notes, clefs) within chat.
- Data-driven rendering: UI listens for JSON tools/events (for example, `tool: "render_sheet_music"`) and updates immediately.
- `render_sheet_music` tool-call path is verifiable when demo UI is enabled.
- Rendering behavior is data-driven (from agent/tool output), not static content.

### 5.4 User Interaction Flow

- Text-based operation only; zero microphone input required.
- Interactive flow includes:
  - User requests a specific exercise (style, key, technique).
  - System performs multi-agent collaboration.
  - System displays generated sheet music.
  - System offers options to regenerate or simplify.

### 5.5 Scenario Coverage

- Concrete multi-turn scenario exists and is runnable.
- Scenario set validates, at minimum:
  - Scenario 1: normal traffic/handoff continuity
  - Scenario 2: safety/guardrail-refusal behavior
  - Scenario 3: risky-tool high-risk tagging
  - Scenario 4: `html_safety_probe` flow combining simple HTML, visual-components HTML, JavaScript HTML, and JavaScript test-cookie extraction attempt prompts
- Scenario validation covers, at minimum:
  - trace creation
  - guardrail/refusal behavior for unsafe prompts
  - high-risk tool tagging when applicable
  - three-agent handoff continuity

### 5.6 Storage Setup Compatibility

- Setup flow (for example, `data/worlds/infinite-etude/setup-agents.ts`) works for both storage types.
- Execution steps are documented for each storage mode.

### 5.7 Migration Verification

- Migration flow status is explicitly documented for:
  - SQLite -> File
  - File -> SQLite
- Untested or failing directions are clearly marked and not assumed valid.

### 5.8 Dataset Requirement

- `data/datasets/robustness_tricky_50.json` is present, or compatible replacement mapping is documented.

## 6. Technical Constraints

- Core platform: `agent-world` (Node.js/TypeScript).
- Frontend: `web/` workspace using **AppRun** for this PoC, to demonstrate lightweight arechitecture.
- Music logic: text-based generation (ABC/JSON), no audio synthesis or FFT in this phase.
- Tracing: integrated with Opik for observability of the multi-agent reasoning chain.

## 7. Non-Functional Requirements

- Observability: scenario runs produce traceable artifacts/events for verification.
- Determinism for validation: expected outcomes and verification steps are documented to be reproducible.
- Safety posture: guardrail checks confirm blocked/redacted outcomes where policy applies.
- Latency expectation: UI renders immediately upon receipt of the agent JSON payload.

## 8. Success Criteria

- Visual proof: when user asks for "Sad D Minor Waltz," the UI shows D minor key signature with 3/4 time signature sheet music in chat.
- Playability: generated tablature/fingering is physically possible on a guitar (verified by Pedagogue).
- Latency: UI renders immediately once Engraver payload is received.

## 9. Acceptance Criteria

- [x] Infinite-Etude assets are explicitly marked demo-only.
- [ ] Infinite-Etude remains opt-in and not required for production runtime startup/default UX.
- [x] Multi-turn scenario is runnable and documented.
- [x] Three-agent handoff (Composer -> Pedagogue -> Engraver) is verified in scenario output.
- [x] `render_sheet_music` compatibility is verified for the UI/demo path.
- [ ] Setup flow is validated for both `sqlite` and `file` storage types.
- [ ] Migration status is explicit for SQLite<->File in both directions.
- [x] `data/datasets/robustness_tricky_50.json` presence or compatibility mapping is documented.

## 10. Status Update (2026-02-21)

- Verified web-stream sender continuity includes all three agents (`human -> maestro-composer -> madame-pedagogue -> monsieur-engraver`) in fresh scenario runs.
- Verified `render_sheet_music` compatibility in active web UI path after renderer/parser normalization and VexFlow API fixes.
- Scenario runner now includes Scenario 4 (`html_safety_probe`) to execute four prompts as one consolidated validation flow.
- Remaining open items are storage/migration matrix completion and explicit production-default opt-in confirmation.


