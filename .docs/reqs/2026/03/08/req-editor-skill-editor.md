# REQ: Base Editor + Skill Editor (Electron Renderer)

**Date:** 2026-03-08  
**Scope:** `electron/renderer/src/`

---

## What (Requirements)

### 1. Base Editor Component

A **two-column editor layout** used as the foundation for editing system entities (system settings, world, agent, skill, etc.).

- **Left column (3/4 width):** The primary editable content area. Extensible for different entity types in the future.
- **Right column (1/4 width):** A chat/conversation interface for AI-assisted editing. This panel sends messages to an AI assistant to help shape the content, **not** to the active world.

The base editor replaces the current `MainContentArea` (message list + composer + right panel) when opened, taking up the full workspace body.

---

### 2. Skill Editor (First Implementation)

A **concrete editor** built on top of the base editor, for viewing and editing skill `.md` files.

- **Top row (toolbar):**
  - `←` back button on the **left** to close the editor and restore the previous main content area (message list + chat right panel).
  - **Save** button on the **left** (near the back button) to persist changes to the SKILL.md file.
  - Skill name / title displayed in the center or prominently.

- **Content row:**
  - A **textarea** (full-height within left column) displaying the raw content of the selected skill's `SKILL.md` file.
  - The textarea is editable; users can freely modify the skill markdown.

- **Right panel:**
  - When the skill editor is active, **the right panel is hidden** (the main content area takes full width, or shows the base editor's 1/4 AI chat pane).
  - Actually: the right panel (agent/world settings panel shell) is hidden. The base editor's own 1/4 right column serves as the AI-assisted editing chat pane.

---

### 3. Skill Entry Click in System Settings

- In the system settings panel (`panelMode === 'settings'`), each skill entry in the global/project skill list becomes **clickable**.
- Clicking a skill entry **opens the skill editor** in the main content area.
- The existing right panel (settings/agent/world) is hidden while the skill editor is shown.
- The `←` back button closes the skill editor and restores the normal chat main content area + restores the right panel to its previous state.

---

### 4. Read/Save Skill Content via IPC

- A new IPC channel `skill:readContent` that returns the raw text content of a skill's `SKILL.md` file given a `skillId`.
- A new IPC channel `skill:saveContent` that writes new content back to the skill's `SKILL.md` file given a `skillId` and new content string.

---

## Out of Scope

- No AI chat functionality in the right column of the base editor (wired up UI only, chat pane may be a placeholder).
- No other entity editors (world editor, agent editor via base editor) in this iteration.
- No validation of SKILL.md format/front-matter before saving.
