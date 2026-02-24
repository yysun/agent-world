# Requirement: Electron App Folder World Loading

**Date**: 2026-02-09  
**Type**: Feature Enhancement  
**Component**: Electron Desktop App - Workspace & World Management  
**Related**: World selection, sidebar UI, folder opening

## Overview

Restructure the Electron app's world management to match CLI workflow: load worlds from current environment on startup, provide create/import world actions in sidebar, move folder selection to chat input area as "Project" button, and display selected project path without automatic workspace switching.

## Goals

- Load worlds from current environment/workspace on app startup
- Display all available worlds in dropdown selector in sidebar
- Provide "Create New World" and "Import World" actions in sidebar
- Move folder/project selection to chat input area (project button)
- Display selected project path below input area without workspace switching
- Show comprehensive world information when world is selected
- Show session list in sidebar for quick access
- Provide world creation capability inline
- Match CLI user experience and workflow

## Functional Requirements

### REQ-1: Initial World Loading from Environment

When app starts:

- **MUST** load all worlds from current environment/workspace path
- **MUST** display worlds in a dropdown selector labeled "Worlds" in sidebar
- **MUST** show world count in dropdown (e.g., "Worlds (3)")
- **MUST** handle the case when no worlds exist (show empty state)
- **MUST** NOT auto-select any world (user must explicitly select)
- **MUST** display loading state during world detection
- **SHOULD** cache world list for performance

### REQ-2: World Information Display in Sidebar

Once a world is loaded, the left sidebar **MUST** display:

- **World Name** (prominently displayed, similar to CLI output)
- **World Description** (if available)
- **Agent Count** (e.g., "Agents: 3")
- **Turn Limit** (e.g., "Turn Limit: 5")
- **Total Messages** (e.g., "Messages: 127")
- **World ID** (in smaller/muted text for reference)
- **Storage Path** (showing where world data is stored)

Display format should mirror CLI world selection output:
```
World: MyWorld
Description: A world for testing agents
Agents: 3 | Turn Limit: 5 | Messages: 127
```

### REQ-3: Session List Display

Below the world information, the sidebar **MUST** display:

- **Session List Header** ("Chat Sessions" or "Sessions")
- **List of all sessions/chats** in the loaded world
- **Each session showing**:
  - Session name
  - Message count
  - Last updated time (optional)
  - Visual indicator for currently selected session
- **"New Session" button** to create additional sessions
- **Empty state** message when no sessions exist

### REQ-4: World Actions in Sidebar

The sidebar **MUST** include world action buttons:

- **"Create New World" icon button** next to worlds dropdown
  - Icon: Plus (+) or similar creation icon
  - Opens inline world creation form
  - Form includes: name, description, turn limit
  - On success: new world added to dropdown and auto-selected
  
- **"Import World" icon button** next to create button
  - Icon: Folder open or import icon
  - Opens file picker to select world folder (similar to CLI "open from file")
  - On success: imports world and adds to dropdown
  - Shows error if import fails

- **Dropdown button** shows:
  - Currently selected world name, or
  - "Select a world" placeholder if none selected
  - Chevron/arrow icon indicating dropdown

### REQ-5: Project Selection in Chat Input Area

The chat input area **MUST** include project/folder selection:

- **"Project" icon button** in same row as attach button
  - Icon: Folder or briefcase icon
  - Located to the right of attach button
  - Opens folder picker dialog
  
- **Selected project path display**:
  - Shown in row below attach/project buttons
  - Shows full or relative path to selected folder
  - Truncated with ellipsis if too long
  - Small text size with muted color
  - **No automatic workspace switching** when folder selected
  - **No automatic world loading** from selected folder
  - Path is for reference/context only

- **Clear/remove button** (optional):
  - Icon: X or close icon
  - Removes selected project path
  - Small button next to path display

## Non-Functional Requirements

### Performance
- World detection and loading SHOULD complete within 2 seconds for typical worlds
- Sidebar UI updates SHOULD be smooth without flickering
- Session list SHOULD load incrementally for worlds with many sessions

### Usability
- World information SHOULD be clearly readable with proper typography hierarchy
- Session list SHOULD be scrollable if it exceeds available space
- Error messages SHOULD be actionable (suggest what user should do)
- Loading states SHOULD prevent user confusion

### Compatibility
- MUST work with both SQLite and file-based storage
- MUST respect AGENT_WORLD_STORAGE_TYPE from .env if set
- MUST respect AGENT_WORLD_DATA_PATH from .env if set
- MUST default to SQLite storage if AGENT_WORLD_STORAGE_TYPE not set (matches CLI)
- MUST default to workspace path if AGENT_WORLD_DATA_PATH not set
- MUST work with worlds created in CLI and web interfaces
- MUST handle legacy world formats gracefully

## Constraints

### Technical Constraints
- Must use existing IPC bridge between main and renderer processes
- Must reuse existing world loading functions from core module
- Cannot modify core world loading logic
- Must maintain workspace preference persistence

### Design Constraints
- Must follow existing Tailwind-based design system
- Must maintain consistent theming (light/dark/system modes)
- Must keep sidebar collapsible functionality
- Icons and visual style should match current Electron app aesthetic

## Acceptance Criteria

- [ ] App loads all worlds from current environment on startup
- [ ] Worlds dropdown in sidebar shows all available worlds
- [ ] Dropdown shows "Select a world" when none selected
- [ ] Worlds dropdown label shows count (e.g., "Worlds (3)")
- [ ] "Create New World" icon button opens inline creation form
- [ ] "Import World" icon button opens file picker
- [ ] World creation form works correctly (name, description, turn limit)
- [ ] Created worlds appear in dropdown immediately
- [ ] Imported worlds appear in dropdown immediately
- [ ] User can select world from dropdown
- [ ] World information displayed when world selected
- [ ] Session list displayed when world selected
- [ ] "Project" button in chat input area opens folder picker
- [ ] Selected project path displayed below attach/project buttons
- [ ] Project path display shows truncated path if too long
- [ ] Selecting project folder does NOT switch workspace
- [ ] Selecting project folder does NOT reload worlds
- [ ] Path display is informational only
- [ ] Loading indicator shown during world loading
- [ ] Error messages shown with clear descriptions
- [ ] Empty state shown when no worlds exist
- [ ] All functionality works in both light and dark themes
- [ ] Sidebar remains collapsible and functional

## User Stories

### Story 1: User Opens App and Sees Available Worlds
**As a** user  
**I want to** see all my available worlds when I open the app  
**So that** I can quickly select which world to work with

**Acceptance**:
- App opens → Worlds load from environment → Dropdown shows all worlds → User selects world

### Story 2: User Creates New World
**As a** user  
**I want to** create a new world directly from the sidebar  
**So that** I can quickly start working without using CLI

**Acceptance**:
- Click create button → Form appears → Fill details → World created and selected

### Story 3: User Imports Existing World
**As a** user  
**I want to** import an existing world folder  
**So that** I can work with worlds created elsewhere or shared by others

**Acceptance**:
- Click import button → Select folder → World imported and appears in dropdown

### Story 4: User Selects Project Context
**As a** user  
**I want to** select a project folder for context  
**So that** agents know which project I'm working on without switching workspace

**Acceptance**:
- Click project button → Select folder → Path displayed below input area
- Workspace does not change
- Worlds dropdown remains unchanged

### Story 5: User Browses Chat Sessions
**As a** user  
**I want to** see all my chat sessions in the sidebar  
**So that** I can quickly switch between different conversations

**Acceptance**:
- All sessions listed with names and message counts
- One-click to switch between sessions
- Clear indication of current session

### Story 6: User Works Without Worlds
**As a** user  
**I want to** see a clear empty state when no worlds exist  
**So that** I know what actions I can take

**Acceptance**:
- "No worlds available" message shown
- Create and Import buttons clearly visible
- Helpful guidance on next steps

## Out of Scope

The following are **NOT** included in this requirement:

- Automatic workspace switching when project folder selected
- Loading worlds from selected project folder
- World editing/deletion from Electron app
- Agent management UI in Electron app
- Session renaming/deletion UI
- Advanced world filtering or search
- World migration or import/export features
- Custom storage location selection
- Multiple workspace management
- Project folder integration with world operations

## Related Documentation

- [CLI World Selection Flow](../../../cli/index.ts#L850-L900) - Reference implementation
- [World Class Documentation](../../../docs/world-class.md) - World structure
- [Electron Main IPC Handlers](../../../electron/main.js#L150-L250) - Existing IPC layer
- [Core World Loading](../../../core/storage/) - World storage implementations

## Architecture Review (AR)

**Reviewed**: 2026-02-09  
**Status**: ✅ **APPROVED** with recommendations

### Review Summary

The requirements are clear, well-structured, and feasible. The proposed changes align well with the existing Electron app architecture and core world loading mechanisms.

### Completeness Assessment ✅

**Complete**: All requirements are well-defined with clear acceptance criteria.

- ✅ Automatic world loading from folder is well-specified
- ✅ World information display requirements are comprehensive
- ✅ Session list display is clearly defined
- ✅ Removal of Storage/Worlds sections is explicit
- ✅ Error handling scenarios are covered
- ✅ Non-functional requirements address performance and usability
- ✅ Out of scope items are clearly listed

### Feasibility Assessment ✅

**Feasible**: All requirements can be implemented with existing infrastructure.

**Existing Infrastructure**:
- ✅ `listWorlds()` in core/managers.ts for world discovery
- ✅ `getWorld(worldId)` for loading specific world
- ✅ `listChats(worldId)` for session retrieval
- ✅ IPC bridge already supports world and session operations
- ✅ UI components follow established Tailwind patterns

**Implementation Path**:
1. Main process: Add `world:loadFromFolder` IPC handler
2. Main process: Call `listWorlds()` after workspace selection
3. Main process: Auto-select first world and load details
4. Renderer: Refactor sidebar to display world info + sessions
5. Renderer: Remove worlds/storage sections

### Scalability Assessment ✅

**Scalable**: Design supports future growth.

**Good Scalability**:
- Single world per folder simplifies state management
- Session list can be paginated if needed (future enhancement)
- World info display is static and performant
- IPC handlers can be extended for additional world operations

**Potential Concerns**:
- Large session lists (100+) may need virtualization (not in scope)
- Multiple worlds in folder NOT supported (deferred to future)

### Maintainability Assessment ✅

**Maintainable**: Changes follow existing patterns.

- ✅ Reuses core managers (`listWorlds`, `getWorld`, `listChats`)
- ✅ Follows existing IPC pattern (invoke/handle)
- ✅ React state management is consistent with current approach
- ✅ No core logic changes required
- ✅ UI changes are localized to sidebar component

### Performance Assessment ⚠️

**Acceptable** with minor consideration.

**Expected Performance**:
- World loading: < 1 second for typical worlds ✅
- Session list: < 500ms for 50 sessions ✅
- UI update: Immediate (React re-render) ✅

**Consideration**:
- For folders with 10+ worlds, `listWorlds()` may take 1-2 seconds
- **Recommendation**: Use first world only (as specified in requirements)
- **Future Enhancement**: Cache world list to speed up reload

### Security Assessment ✅

**Secure**: No new security concerns.

- ✅ File paths are sanitized by Node.js path module
- ✅ No user input directly used in file operations
- ✅ IPC bridge maintains existing security boundary
- ✅ No new attack vectors introduced

### Testability Assessment ✅

**Testable**: Clear testing strategy.

**Test Plan**:
1. **Unit Tests**: IPC handler logic for world loading
2. **Integration Tests**: Renderer sidebar component
3. **E2E Tests**: Full folder open → world load → session select flow
4. **Error Cases**: No world, loading failure, corrupt data

### Alternative Approaches

#### Option 1: Keep Worlds List (Current Behavior)
**Pros**: Supports multiple worlds per folder  
**Cons**: More complex UI, requires world selection step  
**Decision**: ❌ Rejected - Requirements specify single world auto-load

#### Option 2: Workspace-Level World Selection
**Pros**: More flexible, supports project switching  
**Cons**: Adds complexity, requires new UI for workspace management  
**Decision**: ❌ Deferred - Out of scope for this requirement

#### Option 3: World Quick Switcher (Command Palette)
**Pros**: Power user feature, minimal UI changes  
**Cons**: Hidden functionality, discoverability issue  
**Decision**: 💡 Future Enhancement - Not blocking approval

### Recommendations

#### Critical (Must Address)
None - requirements are ready for implementation.

#### Important (Should Address)
1. **Error Recovery**: When world loading fails, provide "Try Another Folder" button
2. **Loading State**: Show spinner + "Loading world from folder..." message
3. **Empty World**: Handle worlds with 0 agents gracefully (show message, not error)

#### Nice-to-Have (Could Address)
1. **World Reload**: Add "Refresh World" button to reload world info
2. **Session Count Limit**: Consider showing "50+ sessions" instead of exact count for large lists
3. **World Description Tooltip**: If description is long, show truncated + hover tooltip

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| No world found in folder | Medium | Low | Clear error message with action |
| World loading failure | Low | Medium | Fallback to previous state + error message |
| Large session list (100+) | Low | Medium | Implement scrollable container |
| Multiple worlds in folder | Medium | Low | Use first world only (as specified) |
| Corrupt world data | Low | High | Validate world data before loading |

### Conclusion

**Overall Assessment**: ✅ **APPROVED**

The requirements are well-defined, feasible, and align with existing architecture. The implementation path is clear with no major risks. Recommend proceeding to **AP** (Architecture Plan) phase.

---

## Next Steps

1. ✅ **REQ** - Requirements Documentation (COMPLETE)
2. ✅ **AR** - Architecture Review (COMPLETE - APPROVED)
3. **AP** - Architecture Plan for phased implementation
4. **SS** - Step-by-step implementation
