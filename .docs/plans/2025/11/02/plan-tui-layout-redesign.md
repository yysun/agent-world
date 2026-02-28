# Architecture Plan: TUI Layout Redesign

**Date:** 2025-11-02  
**Status:** In Progress  
**Parent Plan:** `.docs/plans/2025-11-01/plan-tui-ink.md`

## Overview

Redesign the TUI layout to use a more streamlined vertical structure with popup-based CRUD operations.

## New Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Top Panel (Fixed Height ~3 lines)                           │
│ • Agent Status Bar (horizontal, inline)                     │
│ • Chat Title / World Info                                    │
│ • Connection Status                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Message Area (Flexible, grows to fill)                      │
│ • Scrollable message list                                    │
│ • Auto-scroll to latest                                      │
│ • Color-coded by sender                                      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Input Box (Fixed Height ~2 lines)                           │
│ > Type message or /command...                               │
├─────────────────────────────────────────────────────────────┤
│ Status Bar (Fixed Height 1 line)                            │
│ Ctrl+C: Exit | Ctrl+W: Worlds | Ctrl+A: Agents | Ctrl+H: Chats │
└─────────────────────────────────────────────────────────────┘

Popups (overlay on top):
┌─────────────────────────────────────┐
│ World Management                     │
│ [Create] [Edit] [Delete] [Switch]   │
│                                      │
│ Available Worlds:                    │
│ • world-1 (current)                  │
│ • world-2                            │
│ • world-3                            │
│                                      │
│ [Esc] Close                          │
└─────────────────────────────────────┘
```

## Layout Benefits

### Advantages
1. **More Screen Space**: Messages get 80%+ of terminal height
2. **Better Flow**: Top-to-bottom reading matches chat apps
3. **Cleaner Interface**: No side panels to manage
4. **Agent Focus**: Agents shown inline, visible at all times
5. **Popup UX**: CRUD operations don't clutter main view
6. **Keyboard Efficient**: Shortcuts for all popups

### Component Changes Required

- ✅ Remove side-by-side layout
- ✅ Create horizontal AgentBar component
- ✅ Create TopPanel component (agents + title + status)
- ✅ Update ChatView for full width
- ✅ Create Popup framework (modal overlay)
- ✅ Create WorldManager popup
- ✅ Create AgentManager popup
- ✅ Create ChatManager popup

## Implementation Checklist

### Phase 1: Core Layout (30 min)
- [ ] Create `TopPanel.tsx` component
  - [ ] Horizontal agent status bar
  - [ ] Chat/world title display
  - [ ] Connection indicator
- [ ] Create `AgentBar.tsx` component (horizontal inline)
  - [ ] Active agents with colored dots
  - [ ] Streaming indicator (spinner)
  - [ ] Condensed view (name + status only)
- [ ] Update `App.tsx` layout
  - [ ] Remove flexDirection="row" split
  - [ ] Stack: TopPanel → Messages → Input → StatusBar
  - [ ] Adjust height proportions

### Phase 2: Popup Framework (45 min)
- [ ] Create `Popup.tsx` base component
  - [ ] Centered modal overlay
  - [ ] Border styling
  - [ ] Escape key handling
  - [ ] Backdrop (dimmed background)
- [ ] Create `usePopup.ts` hook
  - [ ] State: isOpen, popupType
  - [ ] Methods: openPopup(type), closePopup()
  - [ ] Keyboard shortcuts (Ctrl+W, Ctrl+A, Ctrl+H)

### Phase 3: CRUD Popups (1-2 hours)
- [ ] Create `WorldManager.tsx` popup
  - [ ] List worlds (from WebSocket data)
  - [ ] Switch world action
  - [ ] Create world form (name, description)
  - [ ] Delete world confirmation
- [ ] Create `AgentManager.tsx` popup
  - [ ] List agents in current world
  - [ ] Create agent form (name, prompt, LLM config)
  - [ ] Edit agent form
  - [ ] Delete agent confirmation
- [ ] Create `ChatManager.tsx` popup
  - [ ] List chats in current world
  - [ ] Switch chat action
  - [ ] Create chat form (title)
  - [ ] Delete chat confirmation

### Phase 4: Integration & Polish (30 min)
- [ ] Update keyboard shortcuts in App.tsx
  - [ ] Ctrl+W → Open world manager
  - [ ] Ctrl+A → Open agent manager
  - [ ] Ctrl+H → Open chat manager (H for "History")
  - [ ] Escape → Close popup
- [ ] Update StatusBar with shortcut hints
- [ ] Test all flows
- [ ] Update documentation

## File Structure

```
tui/src/
├── App.tsx (updated - vertical layout + popup routing)
├── hooks/
│   ├── usePopup.ts (NEW - popup state management)
│   └── ... (existing hooks)
├── components/
│   ├── TopPanel.tsx (NEW - top bar container)
│   ├── AgentBar.tsx (NEW - horizontal agent status)
│   ├── ChatView.tsx (updated - full width)
│   ├── InputBox.tsx (existing)
│   ├── StatusBar.tsx (NEW - keyboard shortcuts hint)
│   ├── Popup.tsx (NEW - modal base component)
│   ├── WorldManager.tsx (NEW - world CRUD popup)
│   ├── AgentManager.tsx (NEW - agent CRUD popup)
│   └── ChatManager.tsx (NEW - chat CRUD popup)
```

## Design Specifications

### TopPanel Component
- Height: 3-4 lines
- Layout: Stack vertically
  - Line 1: Agent bar (horizontal)
  - Line 2: World + Chat title
  - Line 3: Connection status

### AgentBar Component
- Display: Inline horizontal list
- Format: `● Agent1 ○ Agent2 ⊙ Agent3 (streaming)`
- Colors: Green (active), Gray (inactive), Blue (streaming)
- Max width: Truncate with "... +3 more" if needed

### Popup Component
- Size: 60% width, 70% height (centered)
- Border: Double border style
- Backdrop: Semi-transparent overlay (if terminal supports)
- Focus trap: Tab navigation within popup
- Close: Escape key or [Close] button

### StatusBar Component
- Height: 1 line
- Format: `Ctrl+C: Exit | Ctrl+W: Worlds | Ctrl+A: Agents | Ctrl+H: Chats | Messages: 42`
- Color: Dimmed gray text

## Integration with Existing Hooks

### usePopup Hook Interface
```typescript
interface UsePopupReturn {
  popupType: 'world' | 'agent' | 'chat' | null;
  isOpen: boolean;
  openWorldManager: () => void;
  openAgentManager: () => void;
  openChatManager: () => void;
  closePopup: () => void;
}
```

### WebSocket Operations for CRUD
- World CRUD: executeCommand('/world:create', '/world:delete', etc.)
- Agent CRUD: executeCommand('/agent:create', '/agent:edit', etc.)
- Chat CRUD: executeCommand('/chat:create', '/chat:delete', etc.)

## Acceptance Criteria

- [ ] Top panel shows agents horizontally with live status
- [ ] Messages take up most of the screen (80%+)
- [ ] Input box stays at bottom
- [ ] Ctrl+W opens world manager popup
- [ ] Ctrl+A opens agent manager popup
- [ ] Ctrl+H opens chat manager popup
- [ ] Escape closes any open popup
- [ ] All CRUD operations work via popups
- [ ] Layout responsive to terminal size (min 80x24)
- [ ] No horizontal scrolling required

## Estimated Time
- Total: 2.5-3.5 hours
- Phase 1: 30 min
- Phase 2: 45 min
- Phase 3: 1-2 hours
- Phase 4: 30 min

## Notes
- Use Ink's `useInput` hook for keyboard shortcuts
- Use Ink's `Box` with `position="absolute"` for popup overlay
- Consider terminal size limits (min 80 cols x 24 rows)
- Test on different terminal sizes
- Ensure keyboard navigation works without mouse
