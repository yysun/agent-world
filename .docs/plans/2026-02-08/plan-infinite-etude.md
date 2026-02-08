# Implementation Plan: The Infinite Étude

This plan outlines the steps to build the "Generative Sight-Reading Trainer" PoC using `agent-world`, `AppRun`, and `VexFlow`.

## Phase 1: Frontend Infrastructure (VexFlow Integration)
- [x] **Install Dependencies**: Add `vexflow` to `web` workspace package.json.
- [x] **Create Component**: Implement `web/src/components/sheet-music.tsx`.
    - [x] Import `Vex`.
    - [x] Create an AppRun component that accepts `SheetMusicData` (clef, notes, timeSignature).
    - [x] Implement the rendering logic using `Vex.Flow.Renderer` on an SVG element.
    - [x] Handle re-rendering when data changes.
- [x] **Data Types**: Define `SheetMusicData` interface in `web/src/types/index.ts`.

## Phase 2: Chat Interface Integration
- [x] **Modify WorldChat**: Update `web/src/components/world-chat.tsx`.
    - [x] Add logic to detect `render_sheet_music` capability.
    - [x] Strategy: Intercept messages with `tool_calls` named `render_sheet_music`.
    - [x] Instead of showing the default `ToolCallRequestBox`, render the `SheetMusic` component.
- [x] **Stream Handling**: Ensure streaming updates pass the partial JSON data correctly to the component (optional for PoC, can render on completion).

## Phase 3: Agent Configuration (The Composers' Room)
- [x] **Create Setup Script**: Create `scripts/setup-infinite-etude.ts`.
    - [x] Use `OpikTracer` for observability.
    - [x] **Agent A (Composer)**: System prompt to generate ABC/MusicXML-like JSON structure.
    - [x] **Agent B (Pedagogue)**: System prompt to critique and "fix" the JSON.
    - [x] **Agent C (Engraver)**: System prompt to output the final `tool_call` format.
- [x] **World Setup**: Create a new World "InfiniteEtude".

## Phase 4: Validation & Tuning
- [x] **Manual Test**: Run the setup script.
- [ ] **Verify UI**: Open the AppRun frontend (`npm run dev --workspace=web`).
- [ ] **Interaction**:
    - [ ] Send message: "Create a simple C Major scale."
    - [ ] Verify Agent C calls the tool.
    - [ ] Verify `SheetMusic` component renders the SVG.
- [ ] **Opik Verification**: Check the opik dashboard for the agent traces.
