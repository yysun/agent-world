# Done: Skill Editor

**Date:** 2026-03-08  
**Story:** `req-editor-skill-editor` / `plan-editor-skill-editor`  
**Status:** Complete — all tests passing, no regressions.

---

## What Was Built

A full-area skill editor for the Electron desktop app. Users can click a pencil icon on any skill in System Settings to open a dedicated editor, modify the skill's `SKILL.md` content in a large textarea, and save it back to disk.

---

## Deliverables

### IPC Plumbing

| File | Change |
|------|--------|
| `electron/shared/ipc-contracts.ts` | Added `skill:readContent` and `skill:saveContent` channels, `SkillContentPayload`, `SkillSavePayload` interfaces, and `readSkillContent`/`saveSkillContent` to `DesktopApi` |
| `core/index.ts` | Exported `getSkillSourcePath` from `skill-registry` |
| `electron/main-process/ipc-handlers.ts` | Added `readSkillContent` and `saveSkillContent` handler functions; `getSkillSourcePath` dep injected via factory |
| `electron/main-process/ipc-routes.ts` | Added both handlers to `MainIpcHandlers` interface and route list |
| `electron/preload/bridge.ts` | Added bridge methods for both channels |
| `electron/main.ts` | Wired `getSkillSourcePath` and both handlers into `buildMainIpcRoutes` |

### UI Components (New)

| File | Description |
|------|-------------|
| `electron/renderer/src/components/BaseEditor.tsx` | Two-column layout shell: `flex-[3]` left content + `flex-[1]` right AI pane |
| `electron/renderer/src/components/EditorChatPane.tsx` | Placeholder AI assistant pane (right 1/4 column) |
| `electron/renderer/src/components/SkillEditor.tsx` | Toolbar (Back + skillId label + Save), full-height `<textarea>`, wraps `BaseEditor` |

### UI Wiring

| File | Change |
|------|--------|
| `electron/renderer/src/components/index.ts` | Exported `BaseEditor`, `EditorChatPane`, `SkillEditor` |
| `electron/renderer/src/components/MainWorkspaceLayout.tsx` | Added `editorContent?: React.ReactNode` slot; replaces `MainContentArea` when set |
| `electron/renderer/src/components/RightPanelContent.tsx` | Added `onEditSkill` prop; each skill row wrapped with hover-reveal pencil button |
| `electron/renderer/src/utils/app-layout-props.ts` | Passed `onEditSkill` through `createMainContentRightPanelContentProps` |
| `electron/renderer/src/App.tsx` | Added editor state (`editorMode`, `editingSkillEntry`, `editingSkillContent`, `savingSkillContent`), `onOpenSkillEditor`/`onCloseSkillEditor`/`onSaveSkillContent` handlers, and `editorContent` prop render |

### Tests

| File | Description |
|------|-------------|
| `tests/electron/ipc-handlers.test.ts` | 3 new tests: `readSkillContent` happy path, skill-not-found error, `saveSkillContent` write path |
| `tests/electron/main/main-ipc-routes.test.ts` | Updated canonical channel list + mocks for both new channels |
| `tests/electron/renderer/skill-editor.test.ts` | 4 new tests: toolbar renders, back button wired, save button wired, saving=true disables all inputs |

---

## Test Results

```
Test Files  3 passed (3)
Tests       11 passed (11) — all new tests
Full suite  178 passed, 1 pre-existing failure (main-header-view-selector.test.ts)
```

---

## Architecture Notes

- **Security**: `skillId` is resolved exclusively through the trusted `getSkillSourcePath` registry — no path traversal risk.
- **State isolation**: All editor state (`editorMode`, `editingSkillEntry`, `editingSkillContent`) lives in `App.tsx`; components are stateless.
- **Backward compatibility**: `MainWorkspaceLayout` renders `MainContentArea` unchanged when `editorContent` is `undefined`.
- **Future extension**: `BaseEditor` + `EditorChatPane` are designed to be reused for `WorldEditor`, `AgentEditor`, etc.

---

## Pre-existing Issue (Not Introduced Here)

`tests/electron/renderer/main-header-view-selector.test.ts` — 4 failing tests with `Cannot read properties of null (reading 'useState')` in `MainHeaderBar.tsx:69`. Confirmed via `git stash` + re-run to be pre-existing before any changes in this story.
