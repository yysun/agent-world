# Requirement: The Infinite Étude (Generative Sight-Reading Trainer)

## 1. Overview
A "Proof of Concept" (PoC) for the Git'TAR project, leveraging `agent-world`'s Multi-Agent architecture and Generative UI features. The system acts as a "Generative Sight-Reading Trainer" where agents compose, finger, and engrave sheet music in real-time based on user requests, without requiring audio input.

## 2. Key Features

### 2.1. The "Composers' Room" (Multi-Agent System)
A coordinated team of three specialized AI agents working in a pipeline or debate format:
1.  **Agent A (The Composer)**:
    *   **Responsibility**: Generates musical compositions (notes, rhythm, harmony) based on user intent (e.g., "sad and slow", "C Major arpeggio").
    *   **Output format**: ABC Notation or MusicXML text.
2.  **Agent B (The Pedagogue/Fingerer)**:
    *   **Responsibility**: Validates playability and assigns biomechanically correct left-hand fingerings.
    *   **Critique**: Rewrites impossible passages (e.g., uncomfortable intervals) and optimizes for player skill level.
3.  **Agent C (The Engraver/UI)**:
    *   **Responsibility**: Translates the finalized composition into a structured JSON payload for the UI.
    *   **Output**: Streamed JSON commanding the frontend to render sheet music.

### 2.2. Generative UI (AppRun + VexFlow)
The frontend must render music dynamically rather than displaying static text or images.
*   **Rendering Engine**: Use **VexFlow** (JavaScript library) to render standard music notation (staves, notes, clefs) within the chat interface.
*   **Data Driven**: The UI listens for specific JSON tools/events from the agent stream (e.g., `tool: "render_sheet_music"`) and updates the DOM instantly.

### 2.3. User Interaction
*   **Text-Based**: Zero microphone input required.
*   **Interactive Flow**:
    *   User requests a specific exercise (style, key, technique).
    *   System "thinks" (agents collaborate).
    *   System displays the sheet music.
    *   System offers options to "Regenerate" or "Simplify" instantly.

## 3. Technical Constraints
*   **Core Platform**: `agent-world` (Node.js/TypeScript).
*   **Frontend**: `web/` workspace using **AppRun** (NOT React for this PoC, to demonstrate lightweight architecture).
*   **Music Logic**: Text-based generation (ABC/JSON), no audio synthesis or FFT required for this phase.
*   **Tracing**: Must be integrated with Opik for observability of the multi-agent reasoning chain.

## 4. Success Criteria
*   **Visual Proof**: User asks for "Sad D Minor Waltz", and a D Minor Key Signature w/ 3/4 Time Signature sheet music appears in the chat bubble.
*   **Playability**: The generated tablature/fingering is physically possible on a guitar (verified by Agent B).
*   **Latency**: UI renders immediately upon receipt of the agent's JSON payload.
