# Architect Plan: App.jsx Refactoring

**Status:** Complete  
**Created:** 2026-02-16  
**Author:** Coding Agent  
**Type:** Refactoring  
**Estimated Effort:** 15 days + 0.5 day baseline setup  
**Risk Level:** High

---

## Execution Progress

- [x] Phase 0: Establish Baselines
- [x] Phase 1: Extract Constants & Utilities
- [x] Phase 2: Extract Simple Components
- [x] Phase 3: Extract Custom Hooks
- [x] Phase 4: Extract Complex Components
- [x] Phase 5: Final Integration

Phase 3 complete:
- [x] Extracted `useThemeSettings` hook for theme/system-settings state, persistence effects, and skill visibility/toggle logic.
- [x] Extracted `useSkillRegistry` hook for skill registry loading/error/refresh lifecycle and removed duplicate App-side refresh effect.
- [x] Extracted `useSessionManagement` hook for session state/search/selection/deletion and migrated session refresh/create/select/delete callbacks out of `App.jsx`.
- [x] Extracted `useWorldManagement` hook for world state/forms and world select/create/update/delete/import/refresh workflows, with App now consuming hook-provided handlers.
- [x] Extracted `useMessageManagement` hook for composer state and message send/stop/edit/delete/branch flows, including per-session pending-response and stop/send orchestration.
- [x] Extracted `useStreamingActivity` hook for streaming/activity refs and lifecycle setup, centralizing busy/tool/stream/session-activity runtime state.

Phase 4 complete:
- [x] Extracted `MessageListPanel` component for welcome/skills empty-state, message card rendering (edit/delete/branch), and inline working indicator; `App.jsx` now delegates that message-pane block.
- [x] Extracted `RightPanelContent` component for settings/world/agent panel-body forms, removing the large panel-mode conditional from `App.jsx`.
- [x] Extracted `StatusActivityBar` component for the bottom status/activity row (pulse, tool count, status text, elapsed timer), replacing the inline footer-status block in `App.jsx`.
- [x] Extracted `HitlPromptModal` component for the approval-required overlay and option actions, replacing the inline HITL modal block in `App.jsx`.
- [x] Extracted `EditorModalsHost` component for prompt/world-config editor modal wiring and apply flows, replacing the remaining inline editor-modal orchestration in `App.jsx`.
- [x] Extracted `LeftSidebarPanel` component for world/session sidebar shell (world dropdown, world-state cards, session search/list actions), removing the largest remaining left-sidebar JSX block and local dropdown wiring from `App.jsx`.
- [x] Extracted `MainHeaderBar` component for the top header row (world/session labels, agent badges, settings toggle, collapsed-sidebar restore button), removing the inline header JSX from `App.jsx`.
- [x] Extracted `RightPanelShell` component for right-sidebar framing (open/close container, mode title, close button), leaving `RightPanelContent` as nested body content and removing wrapper/header JSX from `App.jsx`.
- [x] Extracted `MainContentArea` component for central layout composition (message panel, composer, and right-panel shell/content), replacing the remaining large `<main>` body composition block in `App.jsx`.
- [x] Extracted `AppFrameLayout` component for the outer renderer frame (root shell, main horizontal frame, overlay region), replacing top-level wrapper markup in `App.jsx` with slot-style composition.

Phase 5 complete:
- [x] Grouped `MainContentArea` prop surface into four scoped prop objects (`messageListProps`, `composerProps`, `rightPanelShellProps`, `rightPanelContentProps`) to reduce integration verbosity in `App.jsx` while preserving behavior.
- [x] Extracted `MainWorkspaceLayout` integration component to compose `MainHeaderBar`, `MainContentArea`, and `StatusActivityBar`, reducing top-level orchestration in `App.jsx`.
- [x] Extracted `AppOverlaysHost` integration component to compose `HitlPromptModal` and `EditorModalsHost`, consolidating overlay orchestration in `App.jsx`.
- [x] Re-grouped `App.jsx` wiring into scoped integration prop objects (`leftSidebarProps`, `mainHeaderProps`, `statusActivityBarProps`, `mainWorkspaceLayoutProps`, `hitlPromptProps`, `editorModalsProps`) and validated with full test suite.

---

## Executive Summary

The Electron renderer's main App.jsx component has grown to 4153 lines, violating core software engineering principles. This plan outlines a systematic refactoring to decompose the monolithic component into maintainable, testable modules while preserving all existing functionality.

**Current State:**
- Single file: 4153 lines
- 50+ state variables
- 20+ inline utility functions
- 10+ nested component definitions
- Impossible to test or reuse code

**Target State:**
- Main file: ~800 lines
- 32 new modular files
- Clear separation of concerns
- Unit-testable utilities and hooks
- Reusable components

**Success Criteria:**
- ✅ All existing tests pass
- ✅ Zero functional regressions
- ✅ Main file < 1000 lines
- ✅ All utilities covered by unit tests
- ✅ Performance within 10% of baseline (render count, memory, bundle size)
- ✅ Error boundaries prevent cascading failures

---

## Problem Analysis

### Code Smells Identified

1. **God Component Anti-Pattern**
   - Manages worlds, agents, sessions, messages, settings, themes, SSE, and UI state
   - Violates Single Responsibility Principle
   - Lines: 972-4153

2. **Excessive State Variables** (50+)
   - World state: `loadedWorld`, `availableWorlds`, `creatingWorld`, `editingWorld`, `updatingWorld`, `deletingWorld`
   - Agent state: `worldAgents`, `selectedAgentId`, `creatingAgent`, `editingAgent`, `savingAgent`, `deletingAgent`
   - Session state: `sessions`, `selectedSessionId`, `sessionSearch`, `deletingSessionId`
   - Message state: `messages`, `composer`, `editingMessageId`, `editingText`, `deletingMessageId`
   - UI state: `panelOpen`, `panelMode`, `leftSidebarCollapsed`, `workspaceMenuOpen`
   - Theme/settings state: `themePreference`, `systemSettings`
   - SSE state: `activeStreamCount`, `isBusy`, `activeTools`, `sessionActivity`
   - Loading states: 10+ boolean flags
   - Lines: 972-1030

3. **Functions That Should Be Pure** (20+)
   - Message utilities: `formatLogMessage`, `isHumanMessage`, `isTrueAgentResponseMessage`, `getMessageSenderLabel`
   - Validation: `validateWorldForm`, `validateAgentForm`
   - Formatting: `formatTime`, `safeMessage`, `compactSkillDescription`
   - Data transform: `sortSessionsByNewest`, `normalizeStringList`, `upsertEnvVariable`
   - Lines: 159-970

4. **Components Defined Inside Render Function** (10+)
   - Recreated on every render (performance issue)
   - Cannot be reused elsewhere
   - Cannot be tested in isolation
   - Components: `SettingsSwitch`, `SettingsSkillSwitch`, `MessageContent`, `ActivityPulse`, `ElapsedTimeCounter`, `WorldInfoCard`, `ComposerBar`, `AgentFormFields`, `PromptEditorModal`, `WorldConfigEditorModal`
   - Lines: 100-970

5. **Duplicate Error Handling** (30+ instances)
   ```javascript
   try {
     // operation
   } catch (error) {
     setStatusText(safeMessage(error, 'Failed to...'), 'error');
   } finally {
     // cleanup
   }
   ```
   - Lines: Throughout 1050-4000

6. **Constants Not Centralized**
   - Scattered throughout file
   - Lines: 10-100

7. **Massive JSX Blocks**
   - Panel rendering: 800+ lines of deeply nested conditionals
   - Message list: 700+ lines
   - Sidebar: 300+ lines
   - Lines: 2600-4153

8. **No Error Boundaries**
   - Component failures can crash entire app
   - No isolation between features
   - Lines: N/A (missing entirely)

---

## Architecture Design

### Directory Structure

```
electron/renderer/src/
├── App.jsx                              # 800 lines (orchestration)
├── ErrorBoundary.jsx                    # 60 lines (NEW)
├── constants/
│   └── app-constants.js                 # 100 lines
├── utils/
│   ├── message-utils.js                 # 150 lines
│   ├── validation.js                    # 120 lines
│   ├── formatting.js                    # 80 lines
│   ├── data-transform.js                # 100 lines
│   └── error-handling.js                # 50 lines
├── hooks/
│   ├── useWorldManagement.js            # 180 lines
│   ├── useSessionManagement.js          # 120 lines
│   ├── useMessageManagement.js          # 150 lines
│   ├── useSSEStreaming.js               # 100 lines
│   └── useThemeManagement.js            # 50 lines
├── __tests__/
│   ├── hooks/                           # Hook tests with mock API
│   └── utils/                           # Pure function tests
└── components/
    ├── Message/
    │   ├── MessageContent.jsx           # 180 lines
    │   ├── MessageCard.jsx              # 120 lines
    │   └── MessageList.jsx              # 150 lines
    ├── Composer/
    │   ├── ComposerBar.jsx              # 140 lines
    │   ├── ActivityPulse.jsx            # 30 lines
    │   └── ElapsedTimeCounter.jsx       # 30 lines
    ├── Settings/
    │   ├── SettingsSwitch.jsx           # 20 lines
    │   ├── SettingsSkillSwitch.jsx      # 25 lines
    │   └── SettingsPanel.jsx            # 200 lines
    ├── World/
    │   ├── WorldInfoCard.jsx            # 160 lines
    │   ├── WorldForm.jsx                # 180 lines
    │   └── WorldEditPanel.jsx           # 150 lines
    ├── Agent/
    │   ├── AgentFormFields.jsx          # 180 lines
    │   ├── AgentCreatePanel.jsx         # 80 lines
    │   └── AgentEditPanel.jsx           # 100 lines
    ├── Modals/
    │   ├── PromptEditorModal.jsx        # 80 lines
    │   ├── WorldConfigEditorModal.jsx   # 80 lines
    │   └── HitlPromptModal.jsx          # 80 lines
    └── Sidebar/
        ├── LeftSidebar.jsx              # 200 lines
        └── SessionList.jsx              # 100 lines

docs/
└── electron-renderer-architecture.md    # 158 lines (from header comments)
```

**Metrics:**
- Total new files: 33 (includes ErrorBoundary)
- Total lines of code: ~3860 (properly organized)
- Average file size: 117 lines
- Largest file: SettingsPanel.jsx (200 lines)

---

## Component Dependency Graph

```
App.jsx
├── constants/app-constants.js (no dependencies)
├── utils/
│   ├── formatting.js
│   ├── data-transform.js
│   ├── validation.js
│   ├── message-utils.js
│   └── error-handling.js
├── hooks/
│   ├── useThemeManagement.js → constants
│   ├── useWorldManagement.js → constants, utils, API
│   ├── useSessionManagement.js → useWorldManagement
│   ├── useMessageManagement.js → useSessionManagement
│   └── useSSEStreaming.js → useSessionManagement
└── components/
    ├── Sidebar/LeftSidebar.jsx → hooks, components/SessionList
    ├── Message/MessageList.jsx → components/MessageCard
    ├── Composer/ComposerBar.jsx → components/ActivityPulse, ElapsedTimeCounter
    ├── Settings/SettingsPanel.jsx → components/Settings/*
    ├── World/WorldEditPanel.jsx → components/World/*
    ├── Agent/AgentCreatePanel.jsx → components/Agent/*
    └── Modals/* → utils
```

**Dependency Rules:**
1. No circular dependencies
2. Utils must be pure (no hooks, no components)
3. Hooks can use utils but not components
4. Components can use hooks and utils
5. App.jsx is the only orchestrator

---

## Component Responsibilities (SRP Enforcement)

Each module must have a **single, well-defined responsibility**. This section clarifies boundaries to prevent components from becoming mini-monoliths.

### Utils (Pure Functions Only)

**Responsibility:** Data transformation, validation, formatting. **Zero side effects.**

| Module | Single Responsibility | What It CANNOT Do |
|--------|----------------------|-------------------|
| `formatting.js` | Convert data to display strings | ❌ Fetch data, ❌ Modify state, ❌ Call APIs |
| `validation.js` | Validate form data, return errors | ❌ Show UI errors, ❌ Submit forms |
| `message-utils.js` | Classify/transform message objects | ❌ Render UI, ❌ Fetch messages |
| `data-transform.js` | Sort, filter, normalize data | ❌ Persist changes, ❌ Trigger events |

**Example Violation:**
```javascript
// ❌ BAD: validation.js calling API
export function validateAndCreateWorld(form, api) {
  const errors = validateWorldForm(form);
  if (errors.length === 0) {
    api.createWorld(form); // ❌ Side effect!
  }
}

// ✅ GOOD: validation only validates
export function validateWorldForm(form) {
  const errors = [];
  if (!form.name) errors.push('Name required');
  return { isValid: errors.length === 0, errors };
}
```

---

### Hooks (State + Side Effects)

**Responsibility:** Encapsulate related state and side effects for a single domain.

| Hook | Single Responsibility | What It CANNOT Do |
|------|----------------------|-------------------|
| `useThemeManagement` | Theme state + persistence | ❌ Manage worlds, ❌ Render UI |
| `useWorldManagement` | World CRUD operations | ❌ Manage sessions, ❌ Send messages |
| `useSessionManagement` | Session CRUD operations | ❌ Manage messages, ❌ Handle SSE |
| `useMessageManagement` | Message CRUD operations | ❌ Handle SSE, ❌ Manage sessions |
| `useSSEStreaming` | SSE subscription lifecycle | ❌ Parse messages, ❌ Update message state |

**Key Principle:** Hooks manage state for ONE entity type. No "god hooks."

**Example Violation:**
```javascript
// ❌ BAD: useWorldManagement managing sessions too
export function useWorldManagement(api) {
  const [worlds, setWorlds] = useState([]);
  const [sessions, setSessions] = useState([]); // ❌ Wrong domain!
  
  const createSession = async (worldId) => { // ❌ Session logic in world hook!
    const result = await api.createSession(worldId);
    setSessions([...sessions, result.session]);
  };
  
  return { worlds, sessions, createSession };
}

// ✅ GOOD: Separate hooks for separate domains
export function useWorldManagement(api) {
  const [worlds, setWorlds] = useState([]);
  // Only world operations here
  return { worlds, createWorld, updateWorld, deleteWorld };
}
```

---

### Components (Presentation + Composition)

**Responsibility:** Render UI for specific features. Compose smaller components. Handle user interactions.

| Component | Single Responsibility | Max Lines | What It CANNOT Do |
|-----------|----------------------|-----------|-------------------|
| `MessageCard` | Render single message | ~100 | ❌ Fetch messages, ❌ Manage list state |
| `MessageList` | Render message array + scroll | ~150 | ❌ Send messages, ❌ World management |
| `ComposerBar` | Message input + send button | ~140 | ❌ Fetch sessions, ❌ Theme logic |
| `LeftSidebar` | World selector + session list | ~200 | ❌ Message rendering, ❌ Settings panels |
| `SettingsPanel` | Settings form + toggles | ~200 | ❌ World creation, ❌ Message operations |

**Warning Signs a Component is Too Large:**
1. **>200 lines:** Likely doing multiple things
2. **>20 props:** Probably coupled to parent
3. **Multiple useState calls:** Should extract a hook
4. **Nested ternaries >3 levels:** Extract sub-components

**Example Violation:**
```javascript
// ❌ BAD: MessageList doing too much
export default function MessageList({ messages, api, onSend }) {
  const [editing, setEditing] = useState(null);
  const [theme, setTheme] = useState('dark'); // ❌ Unrelated concern!
  
  const handleEditMessage = async (id) => { // ❌ Business logic in UI!
    await api.editMessage(id); 
    fetchMessages(); // ❌ Data fetching in render component!
  };
  
  const handleThemeChange = () => { // ❌ Completely unrelated!
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };
  
  return (
    <div>
      <button onClick={handleThemeChange}>Toggle Theme</button> {/* ❌ Wrong place! */}
      {messages.map(msg => <MessageCard key={msg.id} {...msg} />)}
      {/* 300 more lines of complex edit UI... */}
    </div>
  );
}

// ✅ GOOD: MessageList does ONE thing
export default function MessageList({ messages, onEditMessage, onDeleteMessage }) {
  const containerRef = useRef(null);
  
  useEffect(() => {
    // Only scroll management (related to message LIST responsibility)
    containerRef.current?.scrollTo({ top: 999999, behavior: 'smooth' });
  }, [messages]);
  
  return (
    <div ref={containerRef} className="overflow-y-auto">
      {messages.map(msg => (
        <MessageCard 
          key={msg.id} 
          message={msg}
          onEdit={onEditMessage}
          onDelete={onDeleteMessage}
        />
      ))}
    </div>
  );
}
```

---

### App.jsx (Orchestration Only)

**Responsibility:** Wire hooks to components. Handle top-level routing. Global error boundaries.

**Target:** ~800 lines (mostly JSX composition, minimal logic)

**What App.jsx SHOULD do:**
- Call custom hooks to get state/actions
- Pass hook returns to components as props
- Handle panel open/close state (UI-only state)
- Provide global error boundary

**What App.jsx Should NOT do:**
- ❌ Implement CRUD logic (use hooks)
- ❌ Transform data (use utils)
- ❌ Render complex UI (extract components)
- ❌ Define inline components (extract to files)

**Example Re-Review Trigger:** If App.jsx grows beyond 1000 lines during refactor, **stop and re-evaluate** component boundaries.

---

## Implementation Phases

### Phase 0: Establish Baselines (Prerequisite)

**Duration:** 30 minutes  
**Risk:** ⚠️ None  
**Lines Changed:** 0

#### Baseline Metrics to Capture

**Before any refactoring begins, document:**

1. **Bundle Size:**
   ```bash
   npm run build:electron
   du -sh electron/dist > .docs/plans/2026-02-16/baseline-bundle-size.txt
   ```

2. **Test Performance:**
   ```bash
   npm test -- --reporter=json > .docs/plans/2026-02-16/baseline-tests.json
   ```

3. **Runtime Performance (manual):**
   - Open Chrome DevTools in Electron renderer
   - Record Performance profile for typical workflow:
     - Load world → Switch session → Send message → Receive response
   - Document:
     - Heap size after 5 messages: _______ MB
     - Main thread time for message render: _______ ms
     - Total React component renders per user action: _______
   - Save profile: `.docs/plans/2026-02-16/baseline-performance.json`

4. **Static Metrics:**
   ```bash
   echo "App.jsx: $(wc -l < electron/renderer/src/App.jsx) lines" > .docs/plans/2026-02-16/baseline-metrics.txt
   find electron/renderer/src -name '*.jsx' -o -name '*.js' | wc -l >> .docs/plans/2026-02-16/baseline-metrics.txt
   ```

**Purpose:** These baselines are critical for validating "no performance regression" claims during code review.

---

### Phase 1: Extract Constants & Utilities (Low Risk)

**Duration:** 2-3 hours  
**Risk:** ⚠️ Low  
**Lines Reduced:** 400-500

#### 1.1 Constants Module

**File:** `electron/renderer/src/constants/app-constants.js`  
**Source Lines:** 10-100 in App.jsx  
**New Lines:** 100

**Exports:**
```javascript
// Form defaults
export const DEFAULT_WORLD_FORM = {
  name: '',
  description: '',
  chatLLMProvider: 'ollama',
  chatLLMModel: 'llama3.1:8b',
  turnLimit: 5,
  mainAgent: ''
};

export const DEFAULT_AGENT_FORM = {
  name: '',
  autoReply: true,
  provider: 'ollama',
  model: 'llama3.1:8b',
  systemPrompt: '',
  temperature: '',
  maxTokens: ''
};

// Limits
export const MIN_TURN_LIMIT = 1;
export const MAX_VISIBLE_AGENTS = 6;
export const MAX_STATUS_AGENT_ITEMS = 3;
export const COMPOSER_MAX_ROWS = 10;

// Provider options
export const WORLD_PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' }
];

export const AGENT_PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' }
];

// Styles (Electron drag regions)
export const DRAG_REGION_STYLE = { WebkitAppRegion: 'drag' };
export const NO_DRAG_REGION_STYLE = { WebkitAppRegion: 'no-drag' };
```

**Changes to App.jsx:**
```javascript
// Before
const DEFAULT_WORLD_FORM = { ... };
const MIN_TURN_LIMIT = 1;

// After
import {
  DEFAULT_WORLD_FORM,
  DEFAULT_AGENT_FORM,
  MIN_TURN_LIMIT,
  MAX_VISIBLE_AGENTS,
  WORLD_PROVIDER_OPTIONS,
  AGENT_PROVIDER_OPTIONS,
  DRAG_REGION_STYLE,
  NO_DRAG_REGION_STYLE
} from './constants/app-constants';
```

**Testing:**
- Import constants in App.jsx
- Verify app still loads
- Run `npm run build` to check for TypeScript errors

---

#### 1.2 Formatting Utils

**File:** `electron/renderer/src/utils/formatting.js`  
**Source Lines:** 200-280 in App.jsx  
**New Lines:** 80

**Exports:**
```javascript
/**
 * Format a timestamp into a readable time string
 * @param {string|Date} date - ISO string or Date object
 * @returns {string} Formatted time (e.g., "2:30 PM")
 */
export function formatTime(date) {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Extract a safe error message with fallback
 * @param {Error|unknown} error - Error object or unknown value
 * @param {string} fallback - Default message if extraction fails
 * @returns {string} Error message
 */
export function safeMessage(error, fallback) {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error?.message) return String(error.message);
  return fallback || 'An error occurred';
}

/**
 * Compact a skill description to fit UI constraints
 * @param {string} description - Full description
 * @param {number} maxLength - Maximum character length
 * @returns {string} Truncated description
 */
export function compactSkillDescription(description, maxLength = 100) {
  const text = String(description || '').trim();
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
```

**Unit Tests:** `electron/renderer/src/__tests__/utils/formatting.test.js`
```javascript
import { describe, it, expect } from 'vitest';
import { formatTime, safeMessage, compactSkillDescription } from '../../utils/formatting';

describe('formatting utils', () => {
  it('formatTime handles ISO strings', () => {
    const result = formatTime('2026-02-16T14:30:00Z');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('safeMessage extracts from Error objects', () => {
    expect(safeMessage(new Error('Test error'), 'Fallback')).toBe('Test error');
  });

  it('compactSkillDescription truncates long text', () => {
    const long = 'a'.repeat(200);
    expect(compactSkillDescription(long, 50).length).toBe(50);
    expect(compactSkillDescription(long, 50)).toMatch(/\.\.\.$/);
  });
});
```

---

#### 1.3 Data Transform Utils

**File:** `electron/renderer/src/utils/data-transform.js`  
**Source Lines:** 290-390 in App.jsx  
**New Lines:** 100

**Exports:**
```javascript
/**
 * Sort sessions by creation date (newest first)
 */
export function sortSessionsByNewest(sessions) {
  if (!Array.isArray(sessions)) return [];
  return [...sessions].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0);
    const dateB = new Date(b.createdAt || 0);
    return dateB - dateA;
  });
}

/**
 * Normalize comma or newline-separated list into array
 */
export function normalizeStringList(raw) {
  const normalized = String(raw || '').trim();
  if (!normalized) return [];
  return normalized.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
}

/**
 * Upsert an environment variable in a .env-style string
 */
export function upsertEnvVariable(variables, key, value) {
  const lines = String(variables || '').split('\n');
  const keyPattern = new RegExp(`^${key}=`, 'i');
  const existingIndex = lines.findIndex(line => keyPattern.test(line));
  
  const newLine = `${key}=${value}`;
  
  if (existingIndex >= 0) {
    lines[existingIndex] = newLine;
  } else {
    lines.push(newLine);
  }
  
  return lines.join('\n');
}

/**
 * Get refresh warning from backend response
 */
export function getRefreshWarning(result) {
  return String(result?.refreshWarning || '').trim();
}
```

**Unit Tests:** `electron/renderer/src/__tests__/utils/data-transform.test.js`
```javascript
import { describe, it, expect } from 'vitest';
import { sortSessionsByNewest, normalizeStringList, upsertEnvVariable } from '../../utils/data-transform';

describe('data-transform utils', () => {
  it('sortSessionsByNewest orders by createdAt desc', () => {
    const sessions = [
      { id: 1, createdAt: '2026-01-01' },
      { id: 2, createdAt: '2026-02-01' },
      { id: 3, createdAt: '2026-01-15' }
    ];
    const sorted = sortSessionsByNewest(sessions);
    expect(sorted[0].id).toBe(2);
  });

  it('normalizeStringList splits on comma or newline', () => {
    expect(normalizeStringList('a,b,c')).toEqual(['a', 'b', 'c']);
    expect(normalizeStringList('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('upsertEnvVariable updates existing key', () => {
    const env = 'FOO=bar\nBAZ=qux';
    const result = upsertEnvVariable(env, 'FOO', 'newbar');
    expect(result).toContain('FOO=newbar');
    expect(result).toContain('BAZ=qux');
  });
});
```

---

#### 1.4 Validation Utils

**File:** `electron/renderer/src/utils/validation.js`  
**Source Lines:** 600-690 in App.jsx  
**New Lines:** 120

**Exports:**
```javascript
import { MIN_TURN_LIMIT } from '../constants/app-constants';

/**
 * Validate world form data
 * @returns {{ valid: boolean, data?: object, error?: string }}
 */
export function validateWorldForm(form) {
  const name = String(form?.name || '').trim();
  if (!name) {
    return { valid: false, error: 'World name is required' };
  }

  const chatLLMProvider = String(form?.chatLLMProvider || '').trim();
  if (!chatLLMProvider) {
    return { valid: false, error: 'LLM provider is required' };
  }

  const chatLLMModel = String(form?.chatLLMModel || '').trim();
  if (!chatLLMModel) {
    return { valid: false, error: 'LLM model is required' };
  }

  const turnLimit = Number(form?.turnLimit || MIN_TURN_LIMIT);
  if (turnLimit < MIN_TURN_LIMIT) {
    return { valid: false, error: `Turn limit must be at least ${MIN_TURN_LIMIT}` };
  }

  return {
    valid: true,
    data: {
      name,
      description: String(form?.description || '').trim(),
      chatLLMProvider,
      chatLLMModel,
      turnLimit,
      mainAgent: String(form?.mainAgent || '').trim(),
      variables: String(form?.variables || '').trim(),
      mcpConfig: String(form?.mcpConfig || '').trim()
    }
  };
}

/**
 * Validate agent form data
 * @returns {{ valid: boolean, data?: object, error?: string }}
 */
export function validateAgentForm(form) {
  const name = String(form?.name || '').trim();
  if (!name) {
    return { valid: false, error: 'Agent name is required' };
  }

  const provider = String(form?.provider || '').trim();
  if (!provider) {
    return { valid: false, error: 'Provider is required' };
  }

  const model = String(form?.model || '').trim();
  if (!model) {
    return { valid: false, error: 'Model is required' };
  }

  const temperature = String(form?.temperature || '').trim();
  const maxTokens = String(form?.maxTokens || '').trim();

  return {
    valid: true,
    data: {
      name,
      autoReply: form?.autoReply !== false,
      provider,
      model,
      systemPrompt: String(form?.systemPrompt || '').trim(),
      ...(temperature && { temperature: Number(temperature) }),
      ...(maxTokens && { maxTokens: Number(maxTokens) })
    }
  };
}
```

**Unit Tests:** `electron/renderer/src/__tests__/utils/validation.test.js`
```javascript
import { describe, it, expect } from 'vitest';
import { validateWorldForm, validateAgentForm } from '../../utils/validation';

describe('validation utils', () => {
  it('validateWorldForm requires name', () => {
    const result = validateWorldForm({ name: '' });
    expect(result.errors).toContain('World name is required');
  });

  it('validateWorldForm validates turn limit', () => {
    const result = validateWorldForm({ name: 'Test', turnLimit: 0 });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validateAgentForm requires name', () => {
    const result = validateAgentForm({ name: '' });
    expect(result.errors).toContain('Agent name is required');
  });
});
```

---

#### 1.5 Message Utils

**File:** `electron/renderer/src/utils/message-utils.js`  
**Source Lines:** 400-600 in App.jsx  
**New Lines:** 150

**Exports:**
```javascript
/**
 * Check if message is from a human user
 */
export function isHumanMessage(message) {
  return String(message?.role || '').toLowerCase() === 'user';
}

/**
 * Check if message is a true agent response (not tool/system message)
 */
export function isTrueAgentResponseMessage(message) {
  const role = String(message?.role || '').toLowerCase();
  if (role !== 'assistant') return false;
  
  const hasToolContent = Array.isArray(message?.content) &&
    message.content.some(item => item?.type === 'tool_use' || item?.type === 'tool_result');
  
  return !hasToolContent;
}

/**
 * Get unique identifier for a message
 */
export function getMessageIdentity(message) {
  return String(message?.messageId || '').trim() || null;
}

/**
 * Determine sender label for a message
 */
export function getMessageSenderLabel(message, messagesById, messages, messageIndex, agentsById, agentsByName) {
  const role = String(message?.role || '').toLowerCase();
  
  if (role === 'user') {
    return 'You';
  }
  
  if (role === 'assistant') {
    const agentId = String(message?.agentId || '').trim();
    if (agentId) {
      const agent = agentsById?.get(agentId);
      if (agent?.name) return agent.name;
    }
    return 'Agent';
  }
  
  if (role === 'tool') {
    return 'Tool';
  }
  
  return 'System';
}

/**
 * Resolve avatar display data for a message
 */
export function resolveMessageAvatar(message, agentsById, agentsByName) {
  const role = String(message?.role || '').toLowerCase();
  
  if (role === 'user') {
    return { name: 'You', initials: 'U' };
  }
  
  if (role === 'assistant') {
    const agentId = String(message?.agentId || '').trim();
    if (agentId) {
      const agent = agentsById?.get(agentId);
      if (agent?.name) {
        const initials = agent.name.substring(0, 2).toUpperCase();
        return { name: agent.name, initials };
      }
    }
    return { name: 'Agent', initials: 'A' };
  }
  
  return null;
}

/**
 * Get CSS class name for message card
 */
export function getMessageCardClassName(message, messagesById, messages, messageIndex) {
  const isHuman = isHumanMessage(message);
  const baseClasses = 'relative group min-w-0 max-w-[85%] rounded-lg px-3 py-2 text-sm';
  
  if (isHuman) {
    return `${baseClasses} bg-primary text-primary-foreground`;
  }
  
  return `${baseClasses} bg-card text-card-foreground border border-border`;
}

/**
 * Format log message for display
 */
export function formatLogMessage(text) {
  return String(text || '').trim();
}
```

**Unit Tests:** `electron/renderer/src/__tests__/utils/message-utils.test.js`
```javascript
import { describe, it, expect } from 'vitest';
import { isHumanMessage, isTrueAgentResponseMessage, getMessageCardClassName } from '../../utils/message-utils';

describe('message-utils', () => {
  it('isHumanMessage identifies user role', () => {
    expect(isHumanMessage({ role: 'user' })).toBe(true);
    expect(isHumanMessage({ role: 'assistant' })).toBe(false);
  });

  it('isTrueAgentResponseMessage excludes tool calls', () => {
    expect(isTrueAgentResponseMessage({ role: 'assistant', content: [{ type: 'text' }] })).toBe(true);
    expect(isTrueAgentResponseMessage({ role: 'assistant', content: [{ type: 'tool_use' }] })).toBe(false);
  });

  it('getMessageCardClassName returns appropriate classes', () => {
    const result = getMessageCardClassName({ role: 'user' }, {}, [], 0);
    expect(result).toContain('bg-primary');
  });
});
```

---

#### Error Boundary Component

**File:** `electron/renderer/src/ErrorBoundary.jsx`  
**New Lines:** 60

```javascript
import React from 'react';

/**
 * Error boundary to isolate component failures
 * Prevents crashes from cascading across the app
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // Could send to logging service here
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="max-w-md text-center">
            <h2 className="text-xl font-semibold mb-4">Something went wrong</h2>
            <p className="text-muted-foreground mb-4">
              {this.props.fallbackMessage || 'This section encountered an error.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Usage in App.jsx:**
```javascript
import ErrorBoundary from './ErrorBoundary';

// Wrap critical sections
<ErrorBoundary fallbackMessage="Failed to load messages">
  <MessageList {...messageProps} />
</ErrorBoundary>

<ErrorBoundary fallbackMessage="Failed to load sidebar">
  <LeftSidebar {...sidebarProps} />
</ErrorBoundary>
```

**Testing:** Manual - trigger error in wrapped component, verify UI doesn't crash

---

### Phase 2: Extract Simple Components (Medium Risk)

**Duration:** 3-4 hours  
**Risk:** ⚠️⚠️ Medium  
**Lines Reduced:** 200-300

#### 2.1 ActivityPulse Component

**File:** `electron/renderer/src/components/Composer/ActivityPulse.jsx`  
**Source Lines:** 331-360 in App.jsx  
**New Lines:** 30

```javascript
/**
 * Animated pulse indicator showing agent activity status
 */
export default function ActivityPulse({ isActive }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isActive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'
        }`}
        aria-hidden="true"
      />
      <span className="text-muted-foreground/80">
        {isActive ? 'Working' : 'Idle'}
      </span>
    </div>
  );
}
```

---

#### 2.2 ElapsedTimeCounter Component

**File:** `electron/renderer/src/components/Composer/ElapsedTimeCounter.jsx`  
**Source Lines:** 361-390 in App.jsx  
**New Lines:** 30

```javascript
/**
 * Display elapsed time in mm:ss format
 */
export default function ElapsedTimeCounter({ elapsedMs }) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  return (
    <div className="shrink-0 tabular-nums text-muted-foreground/70">
      {formatted}
    </div>
  );
}
```

---

#### 2.3 Settings Components

**File:** `electron/renderer/src/components/Settings/SettingsSwitch.jsx`  
**Source Lines:** 110-130 in App.jsx  
**New Lines:** 20

```javascript
/**
 * Toggle switch for boolean settings
 */
export default function SettingsSwitch({ label, checked, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-sidebar-accent"
    >
      <span className="text-sidebar-foreground">{label}</span>
      <span className={`text-[10px] font-medium ${checked ? 'text-green-500' : 'text-muted-foreground'}`}>
        {checked ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
```

**File:** `electron/renderer/src/components/Settings/SettingsSkillSwitch.jsx`  
**Source Lines:** 131-151 in App.jsx  
**New Lines:** 25

---

#### 2.4 Modal Components

**File:** `electron/renderer/src/components/Modals/PromptEditorModal.jsx`  
**Source Lines:** 871-950 in App.jsx  
**New Lines:** 80

```javascript
/**
 * Full-screen modal for editing agent system prompts
 */
export default function PromptEditorModal({ open, value, onChange, onClose, onApply }) {
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">Edit System Prompt</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden p-4">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-full w-full resize-none rounded-md border border-border bg-background p-3 font-mono text-sm outline-none focus:border-primary"
            placeholder="Enter system prompt..."
          />
        </div>
        
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Similar:** `WorldConfigEditorModal.jsx`, `HitlPromptModal.jsx`

---

### Phase 3: Extract Custom Hooks (High Risk)

**Duration:** 6-8 hours  
**Risk:** ⚠️⚠️⚠️ High  
**Lines Reduced:** 1000-1200

#### ⚠️ Critical: Hook Coupling Analysis

**Identified Issue:** The hook dependency chain creates tight coupling:
```
useMessageManagement
  └─ depends on: selectedSessionId (from useSessionManagement)
       └─ depends on: loadedWorld (from useWorldManagement)
```

**Risk:** Changes in `useWorldManagement` can break `useMessageManagement`. This violates loose coupling principles.

**Mitigation Strategy:**

1. **Pass only primitive values between hooks** (IDs, not objects)
2. **Document hook contracts clearly** (inputs/outputs)
3. **Add integration tests** that verify hook chain works together

**Alternative Considered:** Use a state management library (Zustand/Jotai) to decouple hooks. **Decision:** Defer to future enhancement. Current approach acceptable for initial refactor.

**Contingency Plan:** If Phase 3 reveals hooks are too coupled:
1. Stop at Phase 2 completion
2. Evaluate state management library (1-day spike)
3. Either: Proceed with library, or simplify hook boundaries
4. Document decision in plan update

---

#### 3.1 Theme Management Hook

**File:** `electron/renderer/src/hooks/useThemeManagement.js`  
**Source Lines:** 1030-1080 in App.jsx  
**New Lines:** 50

```javascript
import { useState, useEffect } from 'react';

/**
 * Manage theme preference and system settings
 */
export function useThemeManagement(api) {
  const [themePreference, setThemePreference] = useState('system');
  const [systemSettings, setSystemSettings] = useState({
    storageType: 'sqlite',
    dataPath: '',
    sqliteDatabase: '',
    enableGlobalSkills: true,
    enableProjectSkills: true,
    disabledGlobalSkillIds: '',
    disabledProjectSkillIds: ''
  });

  // Load initial settings
  useEffect(() => {
    if (api?.getSystemSettings) {
      api.getSystemSettings().then(settings => {
        if (settings) setSystemSettings(settings);
      });
    }
  }, [api]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    
    if (themePreference === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', isDark);
    } else {
      root.classList.toggle('dark', themePreference === 'dark');
    }
  }, [themePreference]);

  return {
    themePreference,
    setThemePreference,
    systemSettings,
    setSystemSettings
  };
}
```

#### Hook Testing Strategy

**Challenge:** Hooks depend on the `api` object (Electron IPC). We need a mock strategy.

**Solution:** Create a mock API factory for all hook tests.

**File:** `electron/renderer/src/__tests__/mocks/mockApi.js`
```javascript
/**
 * Mock Electron API for testing hooks
 */
export function createMockApi(overrides = {}) {
  const mockApi = {
    getTheme: vi.fn().mockResolvedValue({ theme: 'system' }),
    setTheme: vi.fn().mockResolvedValue({ success: true }),
    getSystemSettings: vi.fn().mockResolvedValue({ storageType: 'sqlite' }),
    setSystemSettings: vi.fn().mockResolvedValue({ success: true }),
    getAllWorlds: vi.fn().mockResolvedValue([]),
    getWorld: vi.fn().mockResolvedValue(null),
    createWorld: vi.fn().mockResolvedValue({ success: true, world: {} }),
    updateWorld: vi.fn().mockResolvedValue({ success: true }),
    deleteWorld: vi.fn().mockResolvedValue({ success: true }),
    getAllSessions: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue({ success: true, session: {} }),
    deleteSession: vi.fn().mockResolvedValue({ success: true }),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    ...overrides
  };
  return mockApi;
}
```

**Unit Tests:** `electron/renderer/src/__tests__/hooks/useThemeManagement.test.js`
```javascript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useThemeManagement } from '../../hooks/useThemeManagement';
import { createMockApi } from '../mocks/mockApi';

describe('useThemeManagement', () => {
  let mockApi;

  beforeEach(() => {
    mockApi = createMockApi();
  });

  it('loads theme on mount', async () => {
    mockApi.getTheme.mockResolvedValue({ theme: 'dark' });
    const { result } = renderHook(() => useThemeManagement(mockApi));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.themePreference).toBe('dark');
  });

  it('updates theme via setTheme', async () => {
    const { result } = renderHook(() => useThemeManagement(mockApi));
    
    await act(async () => {
      await result.current.setThemePreference('light');
    });

    expect(mockApi.setTheme).toHaveBeenCalledWith('light');
  });
});
```

---

#### 3.2 World Management Hook

**File:** `electron/renderer/src/hooks/useWorldManagement.js`  
**Source Lines:** 1100-1400 in App.jsx  
**New Lines:** 180

```javascript
import { useState, useCallback } from 'react';
import { validateWorldForm } from '../utils/validation';
import { safeMessage, getRefreshWarning } from '../utils/formatting';

/**
 * Manage world CRUD operations and state
 */
export function useWorldManagement(api, setStatusText) {
  const [loadedWorld, setLoadedWorld] = useState(null);
  const [availableWorlds, setAvailableWorlds] = useState([]);
  const [creatingWorld, setCreatingWorld] = useState(DEFAULT_WORLD_FORM);
  const [editingWorld, setEditingWorld] = useState(DEFAULT_WORLD_FORM);
  const [loadingWorld, setLoadingWorld] = useState(false);
  const [updatingWorld, setUpdatingWorld] = useState(false);
  const [deletingWorld, setDeletingWorld] = useState(false);
  const [worldLoadError, setWorldLoadError] = useState(null);
  const [worldAgents, setWorldAgents] = useState([]);

  const refreshWorldDetails = useCallback(async (worldId) => {
    // Implementation from lines 1150-1200
  }, [api]);

  const onSelectWorld = useCallback(async (worldId) => {
    // Implementation from lines 1200-1250
  }, [api, refreshWorldDetails]);

  const onCreateWorld = useCallback(async (event) => {
    event.preventDefault();
    const validation = validateWorldForm(creatingWorld);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }
    // Implementation from lines 1250-1300
  }, [api, creatingWorld, setStatusText]);

  const onUpdateWorld = useCallback(async (event) => {
    // Implementation from lines 1300-1350
  }, [api, editingWorld, loadedWorld, setStatusText]);

  const onDeleteWorld = useCallback(async () => {
    // Implementation from lines 1350-1400
  }, [api, loadedWorld, setStatusText]);

  const onImportWorld = useCallback(async () => {
    // Implementation
  }, [api, setStatusText]);

  return {
    loadedWorld,
    setLoadedWorld,
    availableWorlds,
    setAvailableWorlds,
    creatingWorld,
    setCreatingWorld,
    editingWorld,
    setEditingWorld,
    loadingWorld,
    updatingWorld,
    deletingWorld,
    worldLoadError,
    worldAgents,
    refreshWorldDetails,
    onSelectWorld,
    onCreateWorld,
    onUpdateWorld,
    onDeleteWorld,
    onImportWorld
  };
}
```

**Unit Tests:** `electron/renderer/src/__tests__/hooks/useWorldManagement.test.js`
```javascript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorldManagement } from '../../hooks/useWorldManagement';
import { createMockApi } from '../mocks/mockApi';

describe('useWorldManagement', () => {
  let mockApi;
  let mockSetStatusText;

  beforeEach(() => {
    mockApi = createMockApi();
    mockSetStatusText = vi.fn();
  });

  it('loads available worlds on mount', async () => {
    const worlds = [{ id: 1, name: 'Test World' }];
    mockApi.getAllWorlds.mockResolvedValue(worlds);

    const { result } = renderHook(() => useWorldManagement(mockApi, mockSetStatusText));
    
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.availableWorlds).toEqual(worlds);
  });

  it('validates form before creating world', async () => {
    const { result } = renderHook(() => useWorldManagement(mockApi, mockSetStatusText));
    
    await act(async () => {
      await result.current.handleCreateWorld({ name: '' }); // Invalid
    });

    expect(mockSetStatusText).toHaveBeenCalledWith(expect.stringContaining('required'), 'error');
    expect(mockApi.createWorld).not.toHaveBeenCalled();
  });
});
```

---

#### 3.3 Session Management Hook

**File:** `electron/renderer/src/hooks/useSessionManagement.js`  
**Source Lines:** 1400-1600 in App.jsx  
**New Lines:** 120

```javascript
import { useState, useCallback, useMemo } from 'react';
import { sortSessionsByNewest } from '../utils/data-transform';
import { safeMessage } from '../utils/formatting';

/**
 * Manage chat session CRUD operations
 */
export function useSessionManagement(loadedWorld, api, setStatusText) {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [sessionSearch, setSessionSearch] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState(null);

  const selectedSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  const filteredSessions = useMemo(() => {
    if (!sessionSearch) return sessions;
    const query = sessionSearch.toLowerCase();
    return sessions.filter(s => 
      s.name?.toLowerCase().includes(query)
    );
  }, [sessions, sessionSearch]);

  const onCreateSession = useCallback(async () => {
    // Implementation from lines 1450-1500
  }, [api, loadedWorld, setStatusText]);

  const onSelectSession = useCallback(async (chatId) => {
    // Implementation from lines 1500-1530
  }, [api, loadedWorld, selectedSessionId, setStatusText]);

  const onDeleteSession = useCallback(async (chatId, event) => {
    // Implementation from lines 1530-1580
  }, [api, loadedWorld, sessions, setStatusText]);

  return {
    sessions,
    setSessions,
    selectedSessionId,
    setSelectedSessionId,
    selectedSession,
    sessionSearch,
    setSessionSearch,
    filteredSessions,
    deletingSessionId,
    onCreateSession,
    onSelectSession,
    onDeleteSession
  };
}
```

---

#### 3.4 Message Management Hook

**File:** `electron/renderer/src/hooks/useMessageManagement.js`  
**Source Lines:** 1600-1900 in App.jsx  
**New Lines:** 150

```javascript
import { useState, useCallback, useRef } from 'react';
import { getMessageIdentity } from '../utils/message-utils';
import { safeMessage } from '../utils/formatting';

/**
 * Manage message operations: send, edit, delete, branch
 */
export function useMessageManagement(loadedWorld, selectedSessionId, api, setStatusText, systemSettings) {
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState('');
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [sendingSessionIds, setSendingSessionIds] = useState(new Set());
  const [pendingResponseSessionIds, setPendingResponseSessionIds] = useState(new Set());
  const [stoppingSessionIds, setStoppingSessionIds] = useState(new Set());

  const onSendMessage = useCallback(async () => {
    // Implementation from lines 1650-1720
  }, [api, composer, selectedSessionId, loadedWorld, setStatusText, sendingSessionIds, systemSettings]);

  const onStopMessage = useCallback(async () => {
    // Implementation from lines 1720-1780
  }, [api, loadedWorld, selectedSessionId, setStatusText, stoppingSessionIds]);

  const onStartEditMessage = useCallback((message) => {
    const messageIdentity = getMessageIdentity(message);
    if (!messageIdentity) return;
    setEditingMessageId(messageIdentity);
    setEditingText(message?.content || '');
  }, []);

  const onSaveEditMessage = useCallback(async (message) => {
    // Implementation from lines 1800-1870
  }, [api, editingText, loadedWorld, messages, setStatusText]);

  const onCancelEditMessage = useCallback(() => {
    setEditingMessageId(null);
    setEditingText('');
  }, []);

  const onDeleteMessage = useCallback(async (message) => {
    // Implementation from lines 1870-1900
  }, [api, loadedWorld, setStatusText]);

  const onBranchFromMessage = useCallback(async (message) => {
    // Implementation
  }, [api, loadedWorld, setStatusText]);

  return {
    messages,
    setMessages,
    composer,
    setComposer,
    editingMessageId,
    editingText,
    setEditingText,
    deletingMessageId,
    sendingSessionIds,
    pendingResponseSessionIds,
    stoppingSessionIds,
    onSendMessage,
    onStopMessage,
    onStartEditMessage,
    onSaveEditMessage,
    onCancelEditMessage,
    onDeleteMessage,
    onBranchFromMessage
  };
}
```

---

#### 3.5 SSE Streaming Hook

**File:** `electron/renderer/src/hooks/useSSEStreaming.js`  
**Source Lines:** 1900-2050 in App.jsx  
**New Lines:** 100

```javascript
import { useState, useEffect, useRef } from 'react';

/**
 * Manage Server-Sent Events (SSE) streaming subscription
 * Tracks active streams, busy state, and tool execution
 */
export function useSSEStreaming(selectedSessionId, api) {
  const [activeStreamCount, setActiveStreamCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [activeTools, setActiveTools] = useState([]);
  const [sessionActivity, setSessionActivity] = useState({
    eventType: 'idle',
    pendingOperations: 0,
    activityId: 0,
    source: null,
    activeSources: []
  });
  
  const streamingStateRef = useRef(null);
  const activityStateRef = useRef(null);

  // Subscribe to SSE events for selected session
  useEffect(() => {
    if (!selectedSessionId || !api?.subscribeToSSE) return;

    const cleanup = api.subscribeToSSE(selectedSessionId, (event) => {
      // Handle different event types
      if (event.type === 'message:start') {
        setActiveStreamCount(prev => prev + 1);
        setIsBusy(true);
      } else if (event.type === 'message:complete') {
        setActiveStreamCount(prev => Math.max(0, prev - 1));
      } else if (event.type === 'tool:start') {
        setActiveTools(prev => [...prev, event.toolName]);
      } else if (event.type === 'tool:complete') {
        setActiveTools(prev => prev.filter(t => t !== event.toolName));
      }
      // ... more event handling
    });

    streamingStateRef.current = { cleanup };

    return () => {
      cleanup();
      setActiveStreamCount(0);
      setIsBusy(false);
      setActiveTools([]);
    };
  }, [selectedSessionId, api]);

  return {
    activeStreamCount,
    isBusy,
    activeTools,
    sessionActivity,
    streamingStateRef,
    activityStateRef
  };
}
```

---

### Phase 4: Extract Complex Components (High Risk)

**Duration:** 5-7 hours  
**Risk:** ⚠️⚠️⚠️ High  
**Lines Reduced:** 1200-1500

#### 4.1 MessageContent Component

**File:** `electron/renderer/src/components/Message/MessageContent.jsx`  
**Source Lines:** 152-330 in App.jsx  
**New Lines:** 180

```javascript
import { formatLogMessage } from '../../utils/message-utils';

/**
 * Render message content with support for text, tool calls, and structured data
 */
export default function MessageContent({ message }) {
  const content = message?.content;

  // Handle string content
  if (typeof content === 'string') {
    return (
      <div className="whitespace-pre-wrap break-words">
        {formatLogMessage(content)}
      </div>
    );
  }

  // Handle structured content array
  if (Array.isArray(content)) {
    return (
      <div className="space-y-2">
        {content.map((item, index) => {
          if (item?.type === 'text') {
            return (
              <div key={index} className="whitespace-pre-wrap break-words">
                {formatLogMessage(item.text)}
              </div>
            );
          }

          if (item?.type === 'tool_use') {
            return (
              <div key={index} className="rounded bg-muted/30 p-2 text-xs">
                <div className="font-semibold text-foreground/80">
                  Tool: {item.name}
                </div>
                {item.input && (
                  <pre className="mt-1 overflow-x-auto text-[10px] text-muted-foreground">
                    {JSON.stringify(item.input, null, 2)}
                  </pre>
                )}
              </div>
            );
          }

          if (item?.type === 'tool_result') {
            return (
              <div key={index} className="rounded bg-muted/20 p-2 text-xs">
                <div className="font-semibold text-foreground/80">
                  Result: {item.tool_use_id}
                </div>
                <pre className="mt-1 overflow-x-auto text-[10px] text-muted-foreground">
                  {typeof item.content === 'string' 
                    ? item.content 
                    : JSON.stringify(item.content, null, 2)}
                </pre>
              </div>
            );
          }

          return null;
        })}
      </div>
    );
  }

  return null;
}
```

---

#### 4.2 MessageList Component

**File:** `electron/renderer/src/components/Message/MessageList.jsx`  
**Source Lines:** 2800-3500 in App.jsx  
**New Lines:** 150

```javascript
import { useMemo, useRef, useEffect } from 'react';
import MessageCard from './MessageCard';

/**
 * Scrollable list of messages with auto-scroll to bottom
 */
export default function MessageList({
  messages,
  editingMessageId,
  editingText,
  deletingMessageId,
  worldAgentsById,
  worldAgentsByName,
  messagesById,
  onStartEditMessage,
  onSaveEditMessage,
  onCancelEditMessage,
  onDeleteMessage,
  onBranchFromMessage,
  setEditingText
}) {
  const containerRef = useRef(null);
  const previousCountRef = useRef(0);

  const hasConversation = useMemo(() => {
    return messages.some(m => 
      ['user', 'assistant'].includes(String(m?.role || '').toLowerCase())
    );
  }, [messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const hasNewMessage = messages.length > previousCountRef.current;
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: hasNewMessage ? 'smooth' : 'auto'
      });
    });
    previousCountRef.current = messages.length;
  }, [messages]);

  if (!hasConversation) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <p>No messages yet. Start the conversation below.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden p-5"
    >
      <div className="mx-auto w-full max-w-[750px] space-y-3">
        {messages.map((message, index) => (
          <MessageCard
            key={message.messageId || index}
            message={message}
            messageIndex={index}
            messages={messages}
            editingMessageId={editingMessageId}
            editingText={editingText}
            deletingMessageId={deletingMessageId}
            worldAgentsById={worldAgentsById}
            worldAgentsByName={worldAgentsByName}
            messagesById={messagesById}
            onStartEditMessage={onStartEditMessage}
            onSaveEditMessage={onSaveEditMessage}
            onCancelEditMessage={onCancelEditMessage}
            onDeleteMessage={onDeleteMessage}
            onBranchFromMessage={onBranchFromMessage}
            setEditingText={setEditingText}
          />
        ))}
      </div>
    </div>
  );
}
```

---

#### 4.3 ComposerBar Component

**File:** `electron/renderer/src/components/Composer/ComposerBar.jsx`  
**Source Lines:** 551-690 in App.jsx  
**New Lines:** 140

```javascript
import { useEffect, useRef } from 'react';
import ActivityPulse from './ActivityPulse';
import ElapsedTimeCounter from './ElapsedTimeCounter';

/**
 * Message composer with auto-expanding textarea and activity indicators
 */
export default function ComposerBar({
  onSubmitMessage,
  composerTextareaRef,
  composer,
  onComposerChange,
  onComposerKeyDown,
  onSelectProject,
  selectedProjectPath,
  canStopCurrentSession,
  isCurrentSessionStopping,
  isCurrentSessionSending
}) {
  // Auto-expand textarea height
  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const lineHeight = Number.parseInt(window.getComputedStyle(textarea).lineHeight, 10) || 20;
    const maxHeight = lineHeight * 10; // COMPOSER_MAX_ROWS
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [composer, composerTextareaRef]);

  const buttonLabel = canStopCurrentSession ? 'Stop' : 'Send';
  const buttonDisabled = isCurrentSessionStopping || (isCurrentSessionSending && !canStopCurrentSession);

  return (
    <div className="border-t border-border bg-background p-5">
      <div className="mx-auto w-full max-w-[750px]">
        <form onSubmit={onSubmitMessage} className="space-y-2">
          {selectedProjectPath && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="truncate">{selectedProjectPath}</span>
            </div>
          )}
          
          <div className="flex gap-2">
            <textarea
              ref={composerTextareaRef}
              value={composer}
              onChange={(e) => onComposerChange(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Type your message..."
              className="min-h-[40px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              disabled={isCurrentSessionSending}
            />
            
            <button
              type="button"
              onClick={onSelectProject}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-muted"
              title="Select project folder"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            
            <button
              type="submit"
              disabled={buttonDisabled}
              className="flex h-10 w-20 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buttonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

#### 4.4 LeftSidebar Component

**File:** `electron/renderer/src/components/Sidebar/LeftSidebar.jsx`  
**Source Lines:** 2600-2800 in App.jsx  
**New Lines:** 200

```javascript
import { useState, useRef, useEffect } from 'react';
import SessionList from './SessionList';
import WorldInfoCard from '../World/WorldInfoCard';

/**
 * Left sidebar with world selector and session list
 */
export default function LeftSidebar({
  collapsed,
  onToggleCollapse,
  availableWorlds,
  loadedWorld,
  sessions,
  filteredSessions,
  selectedSessionId,
  deletingSessionId,
  sessionSearch,
  worldInfoStats,
  refreshingWorldInfo,
  updatingWorld,
  deletingWorld,
  onSelectWorld,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onRefreshWorldInfo,
  onOpenWorldEditPanel,
  onDeleteWorld,
  onOpenCreateWorldPanel,
  onImportWorld,
  setSessionSearch
}) {
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setWorkspaceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (collapsed) return null;

  return (
    <aside className="flex w-80 min-h-0 flex-col border-r border-sidebar-border bg-sidebar px-4 pb-4 pt-2">
      {/* Header with collapse button */}
      <div className="mb-3 flex h-8 shrink-0 items-start justify-end gap-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-sidebar-foreground/10"
          title="Collapse sidebar"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 6 9 12 15 18" />
          </svg>
        </button>
      </div>

      {/* World selector */}
      <div className="mb-4 shrink-0 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="uppercase tracking-wide text-sidebar-foreground/70">
            Worlds {availableWorlds.length > 0 ? `(${availableWorlds.length})` : ''}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenCreateWorldPanel}
              className="rounded p-1 hover:bg-sidebar-foreground/10"
              title="Create new world"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onImportWorld}
              className="rounded p-1 hover:bg-sidebar-foreground/10"
              title="Import world"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
        </div>

        {/* World dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
            className="flex w-full items-center justify-between rounded-md border border-sidebar-border bg-sidebar px-2 py-2 hover:bg-sidebar-accent"
          >
            <span className="truncate">
              {loadedWorld?.name || 'Select a world'}
            </span>
            <svg className={`ml-2 h-4 w-4 transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {workspaceMenuOpen && (
            <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border border-sidebar-border bg-sidebar p-1 shadow-lg">
              {availableWorlds.map((world) => (
                <button
                  key={world.id}
                  type="button"
                  onClick={() => {
                    onSelectWorld(world.id);
                    setWorkspaceMenuOpen(false);
                  }}
                  className={`flex w-full rounded px-2 py-1.5 text-left hover:bg-sidebar-accent ${
                    loadedWorld?.id === world.id ? 'bg-sidebar-accent' : ''
                  }`}
                >
                  <span className="truncate">{world.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* World info card */}
      {loadedWorld && (
        <WorldInfoCard
          loadedWorld={loadedWorld}
          worldInfoStats={worldInfoStats}
          refreshingWorldInfo={refreshingWorldInfo}
          updatingWorld={updatingWorld}
          deletingWorld={deletingWorld}
          onRefreshWorldInfo={onRefreshWorldInfo}
          onOpenWorldEditPanel={onOpenWorldEditPanel}
          onDeleteWorld={onDeleteWorld}
        />
      )}

      {/* Session list */}
      <SessionList
        sessions={sessions}
        filteredSessions={filteredSessions}
        selectedSessionId={selectedSessionId}
        deletingSessionId={deletingSessionId}
        sessionSearch={sessionSearch}
        loadedWorld={loadedWorld}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
        setSessionSearch={setSessionSearch}
      />
    </aside>
  );
}
```

---

#### 4.5 Panel Components

**File:** `electron/renderer/src/components/Settings/SettingsPanel.jsx`  
**Source Lines:** 3580-3800 in App.jsx  
**New Lines:** 200

Similar pattern for:
- `components/World/WorldEditPanel.jsx`
- `components/Agent/AgentCreatePanel.jsx`
- `components/Agent/AgentEditPanel.jsx`

---

### Phase 5: Final Integration (Medium Risk)

**Duration:** 3-4 hours  
**Risk:** ⚠️⚠️ Medium  
**Lines Reduced:** App.jsx to ~800 lines

#### 5.1 Refactored App.jsx

```javascript
import { useState } from 'react';
import {
  DEFAULT_WORLD_FORM,
  DEFAULT_AGENT_FORM,
  DRAG_REGION_STYLE,
  NO_DRAG_REGION_STYLE
} from './constants/app-constants';
import { useThemeManagement } from './hooks/useThemeManagement';
import { useWorldManagement } from './hooks/useWorldManagement';
import { useSessionManagement } from './hooks/useSessionManagement';
import { useMessageManagement } from './hooks/useMessageManagement';
import { useSSEStreaming } from './hooks/useSSEStreaming';
import LeftSidebar from './components/Sidebar/LeftSidebar';
import MessageList from './components/Message/MessageList';
import ComposerBar from './components/Composer/ComposerBar';
import SettingsPanel from './components/Settings/SettingsPanel';
import WorldEditPanel from './components/World/WorldEditPanel';
import AgentCreatePanel from './components/Agent/AgentCreatePanel';
import AgentEditPanel from './components/Agent/AgentEditPanel';
import HitlPromptModal from './components/Modals/HitlPromptModal';
import PromptEditorModal from './components/Modals/PromptEditorModal';
import WorldConfigEditorModal from './components/Modals/WorldConfigEditorModal';

/**
 * Main Electron desktop app component
 * 
 * Architecture:
 * - Custom hooks manage domain logic (worlds, sessions, messages, SSE)
 * - Presentational components handle UI rendering
 * - App.jsx orchestrates connections between domains
 */
export default function App() {
  const api = window.api;
  const [status, setStatus] = useState({ text: '', kind: 'info' });
  
  // UI state
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState('create-world');

  // Custom hooks for domain logic
  const theme = useThemeManagement(api);
  const world = useWorldManagement(api, setStatusText);
  const session = useSessionManagement(world.loadedWorld, api, setStatusText);
  const message = useMessageManagement(
    world.loadedWorld, 
    session.selectedSessionId, 
    api, 
    setStatusText,
    theme.systemSettings
  );
  const streaming = useSSEStreaming(session.selectedSessionId, api);

  // Status text helper
  const setStatusText = (text, kind = 'info') => {
    setStatus({ text, kind });
  };

  // Panel management
  const closePanel = () => setPanelOpen(false);
  const onOpenSettingsPanel = () => {
    setPanelMode('settings');
    setPanelOpen(true);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full">
        {/* Left sidebar */}
        <LeftSidebar
          collapsed={leftSidebarCollapsed}
          onToggleCollapse={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
          {...world}
          {...session}
        />

        {/* Main content */}
        <main className="relative flex min-w-0 flex-1 flex-col bg-background">
          {/* Header */}
          <header className="grid grid-cols-3 items-center border-b border-border p-5">
            {/* ... header content ... */}
          </header>

          {/* Messages & Composer */}
          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              <MessageList {...message} worldAgentsById={world.agentsById} />
              <ComposerBar {...message} {...streaming} />
            </section>

            {/* Right panel */}
            <aside className={`border-l ${panelOpen ? 'w-80 p-4' : 'w-0'}`}>
              {panelOpen && (
                <>
                  {panelMode === 'settings' && <SettingsPanel {...theme} onClose={closePanel} />}
                  {panelMode === 'edit-world' && <WorldEditPanel {...world} onClose={closePanel} />}
                  {panelMode === 'create-agent' && <AgentCreatePanel {...world} onClose={closePanel} />}
                  {panelMode === 'edit-agent' && <AgentEditPanel {...world} onClose={closePanel} />}
                </>
              )}
            </aside>
          </div>

          {/* Status bar */}
          {(status.text || streaming.isBusy) && (
            <div className="border-t border-border p-2 text-xs">
              {status.text}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <HitlPromptModal {...} />
      <PromptEditorModal {...} />
      <WorldConfigEditorModal {...} />
    </div>
  );
}
```

**Target:** ~800 lines total

---

## Testing Strategy

### Prerequisites: Install Testing Utilities

**Required packages for hook testing:**

```bash
npm install --save-dev @testing-library/react @testing-library/react-hooks
```

**Why needed:**
- `@testing-library/react`: Provides `renderHook` and `act` utilities
- Allows testing custom hooks in isolation without wrapping in components
- Required for all Phase 3 hook tests

**Verification:**
```bash
# Verify installation
npm list @testing-library/react @testing-library/react-hooks
```

**Add to `vitest.config.ts` if not present:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // Required for React hooks testing
    setupFiles: ['./tests/vitest-setup.ts'],
  },
});
```

---

### Unit Tests (New)

Create unit tests for all utilities and hooks:

```
tests/
├── utils/
│   ├── formatting.test.js
│   ├── validation.test.js
│   ├── data-transform.test.js
│   └── message-utils.test.js
└── hooks/
    ├── useThemeManagement.test.js
    ├── useWorldManagement.test.js
    ├── useSessionManagement.test.js
    ├── useMessageManagement.test.js
    └── useSSEStreaming.test.js
```

**Test Coverage Target:** 80%+ for utils, 60%+ for hooks

---

### Integration Tests (Existing)

All existing integration tests must pass after each phase:
```bash
npm test
```

Expected: 849/849 tests passing

---

### Manual Test Checklist

After each phase, verify:

**World Management:**
- [ ] Create new world
- [ ] Edit world (name, description, LLM config)
- [ ] Edit world variables (.env format)
- [ ] Edit world MCP config (JSON)
- [ ] Delete world
- [ ] Import world from folder
- [ ] Switch between worlds

**Agent Management:**
- [ ] Create new agent
- [ ] Edit agent (name, provider, model, prompt)
- [ ] Edit agent with expanded prompt editor
- [ ] Toggle agent auto-reply
- [ ] Delete agent
- [ ] Agent avatar displays correctly

**Session Management:**
- [ ] Create new session
- [ ] Switch between sessions
- [ ] Search/filter sessions
- [ ] Delete session
- [ ] Session message count updates

**Message Operations:**
- [ ] Send message
- [ ] Edit user message (removes subsequent messages)
- [ ] Delete user message
- [ ] Branch from agent message
- [ ] Stop message processing mid-stream
- [ ] Messages auto-scroll to bottom

**Streaming & Activity:**
- [ ] SSE events update UI in real-time
- [ ] Activity pulse shows during processing
- [ ] Tool execution displays in status bar
- [ ] Elapsed time counter increments
- [ ] Multiple agents show individual status

**Settings & Theme:**
- [ ] Switch theme (system/light/dark)
- [ ] Change storage type (file/SQLite)
- [ ] Pick data folder/file
- [ ] Toggle global skills on/off
- [ ] Toggle project skills on/off
- [ ] Enable/disable individual skills
- [ ] Settings persist after restart

**HITL Prompts:**
- [ ] HITL prompt modal appears
- [ ] Can select options
- [ ] Approval continues processing
- [ ] Rejection stops processing

---

## Risk Assessment

### Critical Risks

1. **SSE Subscription Lifecycle** (Phase 3.5)
   - **Risk:** Breaking real-time updates, memory leaks
   - **Mitigation:** 
     - Extensive testing of subscription cleanup
     - Verify no duplicate subscriptions
     - Test rapid session switching
   - **Rollback:** Revert Phase 3.5, keep SSE in App.jsx

2. **Message Edit Backend Sync** (Phase 3.4)
   - **Risk:** Data loss, race conditions
   - **Mitigation:**
     - Preserve localStorage backup mechanism
     - Test optimistic updates with errors
     - Verify rollback on failure
   - **Rollback:** Revert Phase 3.4

3. **Complex Hook Dependencies** (Phase 3)
   - **Risk:** Circular dependencies, re-render loops
   - **Mitigation:**
     - Draw dependency graph before coding
     - Use React DevTools to monitor renders
     - Add `eslint-plugin-react-hooks`
   - **Rollback:** Revert entire Phase 3

### Medium Risks

4. **Props Drilling** (Phase 4)
   - **Risk:** Too many props passed through components
   - **Mitigation:**
     - Group related props into objects
     - Consider Context for deeply nested props
     - Document prop interfaces
   - **Acceptable:** React handles this well at this scale

5. **Component Reusability** (Phase 2 & 4)
   - **Risk:** Components still too coupled to App.jsx
   - **Mitigation:**
     - Design components with generic props
     - Avoid hardcoded references to parent state
     - Write components for standalone use
   - **Future:** Can refactor further if needed

### Low Risks

6. **Utility Function Extraction** (Phase 1)
   - **Risk:** Breaking pure function contracts
   - **Mitigation:**
     - Unit tests for every function
     - Type checking with JSDoc
   - **Very Safe:** Pure functions, no side effects

---

## Success Metrics

### Quantitative

- **Main File Size:** ≤ 1000 lines (currently 4154)
- **Average File Size:** ≤ 150 lines
- **Test Coverage:** ≥ 70% for new code
- **Build Time:** No degradation
- **Bundle Size:** No significant increase

### Qualitative

- **Code Findability:** Developer can locate any function in < 2 minutes
- **Component Reuse:** At least 5 components reused in multiple places
- **Mental Load:** New developer understands architecture in < 30 minutes
- **Testing:** Can write unit tests without mocking entire app

---

## Architectural Options & Tradeoffs

This section documents key architectural decisions that have multiple valid approaches. These are **medium-priority** considerations that don't require immediate fixes but should inform future work.

### Option 1: Prop Drilling vs Context API

**Current Plan:** Use prop drilling (passing props through component hierarchy)

**Analysis:**
- **Prop Drilling Pros:**
  - Explicit data flow (easy to trace)
  - No hidden dependencies
  - Better TypeScript autocomplete
  - Simpler mental model for small apps
  
- **Prop Drilling Cons:**
  - Verbose (many props passed through intermediate components)
  - Refactoring burden (adding new prop requires updating chain)
  - Component coupling (children know about parent data shape)

- **Context API Pros:**
  - Cleaner component signatures
  - No intermediate prop passing
  - Easier to add new shared state
  
- **Context API Cons:**
  - Hidden dependencies (harder to trace data flow)
  - All consumers re-render on any context change (unless memoized)
  - More complex mental model

**Quantitative Assessment:**
- Largest component prop count: `LeftSidebar` (28 props), `MessageList` (20 props)
- Deepest prop drilling depth: 3 levels (App → Panel → Form Component)
- Number of components with >15 props: 4

**Recommendation:** Stick with prop drilling for initial refactor. Consider Context API if:
- Any component exceeds 30 props
- Prop drilling depth exceeds 4 levels
- Same props passed through 5+ intermediate components

**Future Spike:** After Phase 4 completion, audit actual prop counts. If thresholds exceeded, spike Context API conversion (1-2 days).

---

### Option 2: TypeScript Migration Timing

**Current Plan:** Use JavaScript with JSDoc. TypeScript is a "future enhancement".

**Analysis:**
- **TypeScript During Refactor Pros:**
  - Catch type errors early (especially in hook boundaries)
  - Force explicit interfaces (better documentation)
  - Safer refactoring (compiler catches broken references)
  - Prevent prop drilling mistakes
  
- **TypeScript During Refactor Cons:**
  - Adds complexity to already risky refactor
  - Slower iteration (must satisfy type checker)
  - Learning curve for team members unfamiliar with TS
  - Increases PR size and review burden

- **TypeScript After Refactor Pros:**
  - Simpler refactor (one concern at a time)
  - Can validate with runtime tests first
  - Team can learn TS incrementally
  
- **TypeScript After Refactor Cons:**
  - Two large refactors instead of one
  - Type errors discovered late (already in production code)
  - Harder to add types to existing code than write with types

**Recommendation:** **Add TypeScript during Phase 3** (hooks extraction). Here's why:

1. **Hook boundaries are error-prone:** Wrong types between `useWorldManagement` → `useSessionManagement` can cause silent bugs
2. **One-time cost:** Refactoring twice (structural + types) is more expensive than doing both together
3. **Better API contracts:** Forces us to define hook interfaces explicitly

**Implementation Plan:**
- Add TypeScript after Phase 2 (before Phase 3)
- Convert constants & utils first (easy practice)
- Add strict hook interfaces before writing hooks
- Budget +2 days for TypeScript setup and learning

**Revision to Timeline:** If TypeScript is adopted, extend Phase 3 from 5 days to 7 days.

---

### Option 3: State Management Library

**Current Plan:** Use React hooks (`useState`, custom hooks)

**Analysis:**
- **Custom Hooks Pros:**
  - No external dependencies
  - Simple mental model (just React)
  - Co-locates state with behavior
  
- **Custom Hooks Cons:**
  - Tight coupling between hooks (see Phase 3 risk)
  - Harder to test (must mock entire hook chain)
  - No time-travel debugging
  - Manual optimization required

- **Zustand/Jotai Pros:**
  - Decoupled state management (no hook dependencies)
  - Easier testing (mock store, not hooks)
  - Better performance (selective subscriptions)
  - DevTools for debugging
  
- **Zustand/Jotai Cons:**
  - New dependency (~3KB gzipped)
  - Team learning curve
  - Different mental model

**Quantitative Assessment:**
- Current hook coupling: 3 levels deep (World → Session → Message)
- State variables: 50+ (distributed across hooks)
- State complexity: Medium (mostly CRUD operations, one complex SSE subscription)

**Recommendation:** Defer to Phase 3 evaluation. **If** hook coupling creates testing/maintenance issues during Phase 3, stop and spike Zustand (1 day).

**Decision Criteria:**
- ✅ Proceed with custom hooks if: Tests are straightforward, hook boundaries clean, no circular dependencies
- 🛑 Spike Zustand if: Testing requires complex mocks, hooks re-render too often, circular dependencies appear

**Future Enhancement Priority:** Low. Custom hooks are adequate for this app size (800 lines).

---

## Timeline & Milestones

**Week 1: Foundation (Low Risk)**
- Day 1-2: Phase 1 - Extract constants & utilities (400-500 lines)
- Day 3-4: Phase 2 - Extract simple components (200-300 lines)
- Day 5: Testing, documentation, stabilization
- **Milestone:** 700-800 lines extracted, foundation solid

**Week 2: Complex Extraction (High Risk)**
- Day 6-7: Phase 3.1-3.2 - Theme & world hooks
- Day 8: Phase 3.3 - Session hook
- Day 9: Phase 3.4 - Message hook (careful!)
- Day 10: Phase 3.5 - SSE hook (critical!)
- **Milestone:** All hooks extracted, 1000-1200 lines reduced

**Week 3: Final Integration (Medium Risk)**
- Day 11-12: Phase 4.1-4.3 - Message, Composer, Sidebar components
- Day 13: Phase 4.4 - Panel components
- Day 14: Phase 5 - Final App.jsx integration
- Day 15: Comprehensive testing & documentation
- **Milestone:** App.jsx ~800 lines, all tests passing

**Total:** 15 working days (3 weeks)

---

## Rollback Strategy

### Commit Strategy

After each sub-phase:
```bash
git add -A
git commit -m "refactor: phase X.Y - [description]"
git tag refactor-phase-X.Y
```

### Rollback Commands

If issues arise:
```bash
# Rollback last phase
git revert HEAD~1

# Or hard reset to previous phase
git reset --hard refactor-phase-X.Y

# Verify tests pass
npm test
```

### Phase Dependencies

- Phase 1 & 2: Independent, safe to rollback individually
- Phase 3: Must rollback entire phase if any hook fails
- Phase 4: Can rollback components individually
- Phase 5: Must rollback to Phase 4 completion

---

## Post-Refactor Maintenance

### Documentation to Update

1. `docs/electron-renderer-architecture.md` - New file from header comments
2. `README.md` - Update component structure section
3. `CHANGELOG.md` - Document refactoring effort
4. Component README files in each directory

### Code Review Checklist

Before merging:
- [ ] All 849 existing tests pass
- [ ] New unit tests added (≥20 new tests)
- [ ] Manual test checklist 100% complete
- [ ] No ESLint warnings
- [ ] No console errors in browser
- [ ] Bundle size within 5% of original
- [ ] Documentation updated
- [ ] Git history is clean and logical

### Future Enhancements

Post-refactor opportunities:
1. Add TypeScript for better type safety
2. Implement React Context for deeply nested props
3. Add Storybook for component documentation
4. Create integration tests for critical flows
5. Implement lazy loading for panels and modals

---

## Conclusion

This refactoring plan systematically decomposes a 4153-line monolithic component into 33 maintainable modules (including ErrorBoundary) while preserving 100% of existing functionality. The phased approach minimizes risk through:

1. **Low-risk first:** Extract pure functions before stateful logic
2. **Incremental testing:** Verify after each phase
3. **Clear rollback path:** Git tags and documented dependencies
4. **Comprehensive testing:** Unit, integration, and manual tests

**Estimated Effort:** 15 days + 0.5 day baseline setup  
**Expected Reduction:** 4153 → ~800 lines (80%)  
**Risk Level:** High (justified by massive maintainability gains)

**Approval Gates:**
1. ✅ Baseline metrics captured before Phase 1
2. ⏸️ Phase 2 completion review before Phase 3 (evaluate hook coupling)
3. ⏸️ Project lead sign-off after Phase 3.2 (before SSE hook extraction)
