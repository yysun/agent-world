/**
 * Desktop Renderer App - Three-Column Workspace UI
 * Purpose:
 * - Render the Electron desktop workspace for world, session, and chat management.
 *
 * Features:
 * - World selector dropdown showing all worlds from workspace
 * - Workspace/world/session sidebar, chat center, context panel
 * - Theme toggle and collapsible left sidebar
 * - SSE-based streaming message rendering
 * - Agent management with avatar badges and message counts
 * - User message edit and delete functionality (via IPC)
 *
 * Implementation Notes:
 * - Function component with local state and IPC-only desktop API calls
 * - Window drag regions are explicit (`drag` + `no-drag`) for custom title rows
 * - Composer textarea auto-resizes and supports Enter-to-send (Shift+Enter newline)
 * - Loads all worlds from workspace folder, displays in dropdown for selection
 * - Message edit delegates to core-managed delete+resubmit flow via `message:edit` IPC
 * - Edit creates localStorage backup before mutation for recovery
 * - Message deduplication handles multi-agent scenarios (user messages shown once)
 *
 * Recent Changes:
 * - 2026-02-17: Fixed renderer startup crash by replacing stale `selectedWorld` references with `loadedWorld` after integration cleanup.
 * - 2026-02-17: Fixed hook wiring by removing duplicate world-form state declarations and routing world-hook session updates through stable setter proxies.
 * - 2026-02-17: Removed redundant single-use integration wiring aliases (`selectedWorld`, wrapper prop objects) to keep top-level orchestration concise without behavioral changes.
 * - 2026-02-16: Standardized tool-call request headers to `⚙️ Tool request → <tool_name>`.
 * - 2026-02-16: Fixed tool-call request labeling so `Calling tool: ...` rows show request-oriented headers instead of output-oriented headers.
 * - 2026-02-16: Refined tool-message wording to user-friendly labels (`Terminal output`, `Execution result`) with less technical fallback text.
 * - 2026-02-16: Improved tool-message headers to show context-aware labels (e.g., tool names from `Calling tool:` lines) instead of generic `Tool output`.
 * - 2026-02-16: Removed streaming fallback from inline working-indicator visibility to match web behavior (`pendingOperations > 0` only).
 * - 2026-02-16: Aligned inline working-indicator visibility with web behavior using session activity pending-operations (`pendingOperations > 0`) as the sole show/hide signal.
 * - 2026-02-16: Simplified inline working-indicator visibility to depend only on active agent sources from session activity.
 * - 2026-02-16: Restored inline `<agent> is working...` visibility parity with web by showing it for pending-response/busy session states even when activity sources are temporarily empty.
 * - 2026-02-16: Classified assistant "Calling tool ..." status lines as tool-related messages so they use tool styling and are excluded from branch-chat actions.
 * - 2026-02-16: Added agent-message `branch` action to create a new chat branched from the selected assistant message and auto-select it on success.
 * - 2026-02-16: Disabled message-edit `Save` until content is changed from the original message text.
 * - 2026-02-16: Aligned edit/load fallback defaults for agent provider/model to `ollama` and `llama3.1:8b`.
 * - 2026-02-16: Changed new-agent default LLM settings to provider `ollama` and model `llama3.1:8b`.
 * - 2026-02-16: Swapped edit-form button order to `Cancel` then `Save` and retained a defensive no-op guard for unchanged content.
 * - 2026-02-16: Added System Settings skill-scope toggles (`Enable Global Skills`, `Enable Project Skills`) with darker switch styling.
 * - 2026-02-15: Suppressed reply-target sender labels when the replying agent has `autoReply` disabled; chat rows now show plain sender names in that mode.
 * - 2026-02-15: Updated welcome-card visibility to depend on user/assistant conversation messages only, so tool/system/error-only event rows do not hide onboarding content.
 * - 2026-02-15: Stabilized desktop chat layout by constraining horizontal overflow, top-aligning empty-session welcome content, and adding a bounded scroll area for long skill lists.
 * - 2026-02-15: Hardened message edit/delete chat targeting to require message-bound chat IDs and removed selected-session fallback for mutation requests.
 * - 2026-02-15: Fixed chat-id drift by preserving selected session during refresh and binding message/edit/delete actions to stable target chat IDs.
 * - 2026-02-14: Fixed inline `<agent> is working...` visibility to hide immediately when agent activity completes (no longer held open by residual stream-count state).
 * - 2026-02-14: Refined inline chat working indicator with borderless text row, flashing dot, active-work-only visibility, and stronger agent-name fallback resolution.
 * - 2026-02-14: Added inline chat activity indicator (`<agent> is working...`) under the message list to match web waiting UX.
 * - 2026-02-14: Reduced welcome skill-list vertical footprint (denser two-column cards + compact descriptions) so the new-chat welcome view avoids unnecessary vertical scrolling.
 * - 2026-02-14: Removed outer welcome-card borders and switched skills to a full single-column list so all skills remain visible without hidden overflow rows.
 * - 2026-02-14: Refreshed the new-chat welcome empty state with a cleaner minimal layout and compact skill cards.
 * - 2026-02-14: Added robust skill-registry loading states (loading/error/retry) and automatic refresh when workspace/world context changes.
 * - 2026-02-14: Added generic HITL option prompt modal flow driven by system events (`hitl-option-request`) with renderer response submission.
 * - 2026-02-14: Made the new-chat welcome card more compact/simple and added a scrollable skill list for large registries.
 * - 2026-02-14: Simplified new-chat welcome layout by removing nested border layers for a cleaner single-surface design.
 * - 2026-02-14: Refined welcome empty-state copy by removing session-name greeting and shortening helper text.
 * - 2026-02-14: Replaced empty-session placeholder with a centered welcome screen that lists skill-registry entries (name + description) in a muted, onboarding-style layout.
 * - 2026-02-14: Fixed world-info fallback parsing so null/blank totals no longer coerce to zero and now correctly use derived stats/default turn limit.
 * - 2026-02-14: Restored accessible switch labeling by wiring agent Auto Reply text to the switch control via aria-labelledby in extracted form fields.
 * - 2026-02-14: Broke renderer monolith into reusable components (`WorldInfoCard`, `ComposerBar`, `AgentFormFields`, `PromptEditorModal`, `WorldConfigEditorModal`) to simplify App.jsx.
 * - 2026-02-14: Fixed left-sidebar World Info stats to always show numeric agent/message counts using derived fallbacks when backend totals are absent.
 * - 2026-02-14: Updated composer toolbar visuals by switching the attachment icon to `+` and reducing attachment/project control sizing.
 * - 2026-02-14: Removed left padding from Auto Reply rows in agent create/edit forms.
 * - 2026-02-14: Updated agent Auto Reply rows to borderless styling and lighter switch tracks.
 * - 2026-02-14: Made form labels bold and standardized provider/model labels to `LLM Provider` and `LLM model` in world/agent create-edit forms.
 * - 2026-02-14: Darkened form label contrast to `text-sidebar-foreground/90`.
 * - 2026-02-14: Aligned agent Auto Reply label and switch on one row and removed explicit enabled/disabled text.
 * - 2026-02-14: Reduced agent Auto Reply switch size and made agent System Prompt editors consume available vertical form space.
 * - 2026-02-14: Switched world/agent form labels to non-capitalized medium-contrast styling (`text-sidebar-foreground/75`) for clearer readability.
 * - 2026-02-14: Updated agent create/edit forms with sidebar-style labels, switch-based Auto Reply control, and provider/model on a single row.
 * - 2026-02-14: Lightened world-form label color for better visual hierarchy in create/edit side panel.
 * - 2026-02-14: Styled world-form field labels to match left-sidebar caps/gray label treatment.
 * - 2026-02-14: Added explicit field labels to world create/edit forms (except Variables/MCP config rows) and moved Main Agent above Variables/MCP in edit mode.
 * - 2026-02-14: Updated world create/edit panel behavior: hide Variables/MCP on create; show label + popup expand editors on edit; moved Main Agent to the last field.
 * - 2026-02-14: Removed renderer-local `working_directory=./` fallback; missing values now rely on core default working-directory behavior.
 * - 2026-02-14: Removed monospace font override from desktop log/system lines so tool error text matches agent message typography.
 * - 2026-02-13: Unified desktop log-line typography so category and detailed error text render with a single consistent font style.
 * - 2026-02-13: Expanded desktop log-message rendering to include structured error details (error/message/toolCallId) instead of generic "Tool execution error" text.
 * - 2026-02-13: Removed agent `type` from desktop create/edit forms and unsaved-change checks.
 * - 2026-02-13: Message edit flow now uses core-driven `message:edit` IPC so delete+resubmit+title-reset policy is shared across clients.
 * - 2026-02-13: Refreshes session list on realtime `chat-title-updated` system events so edited New Chat sessions immediately reflect generated titles.
 * - 2026-02-13: Reused the existing bottom status bar for live thinking/activity state (working/pending agents) without adding extra status rows.
 * - 2026-02-13: Tightened send/stop mode to session-scoped pending state so concurrent sessions remain independent while stop is active.
 * - 2026-02-13: Added session-scoped stop-message control and send/stop composer toggle behavior.
 * - 2026-02-12: Extracted renderer orchestration concerns into domain modules.
 *   - Desktop bridge access + error normalization moved to `domain/desktop-api.js`.
 *   - Message upsert/log conversion moved to `domain/message-updates.js`.
 *   - Realtime log/chat event routing moved to `domain/chat-event-handlers.js`.
 * - 2026-02-12: Extended chat avatars to tool-call and system/log message cards.
 *   - Non-human message avatars now resolve for assistant, tool, and system/log roles.
 *   - Tool/system entries use role-aware fallback labels when no agent mapping is available.
 * - 2026-02-12: Added per-message agent avatars on the left of assistant message cards.
 *   - Assistant messages now resolve sender metadata via `fromAgentId` first, then sender-name matching.
 *   - Chat rows now support avatar + bubble layout for assistant messages.
 * - 2026-02-12: Removed renderer-side message ID fallback for chat messages.
 *   - Chat message merge/render/edit/delete paths now rely on backend-provided `messageId` only.
 *   - Delete flow now refreshes messages from canonical `chat:getMessages` payloads after removal.
 * - 2026-02-12: Fixed edit-message flow to use stable message identity (`messageId` first) so edit always removes the edited user message and all following messages before resubmission.
 * - 2026-02-11: Surface world subscription refresh/rebind warnings in the status bar for world/session mutations.
 * - 2026-02-11: Log errors now render even without an active chat subscription by using a global log listener with status-bar fallback.
 * - 2026-02-11: Message list rendering now keys by unique `id` first to prevent duplicate-key collisions when loading session history.
 * - 2026-02-10: Tool output panels now default to collapsed state
 * - 2026-02-10: Sender labels now resolve reply chains to show HUMAN for final assistant replies after tool steps
 * - 2026-02-10: Switched tool output expand/collapse controls to icon-only buttons (no text labels)
 * - 2026-02-10: Removed agent/tool background tints; keep visual distinction with colored left borders only
 * - 2026-02-10: Added collapsible tool output sections in chat messages (expand/collapse)
 * - 2026-02-10: Added role-based message card styling so agent, tool, and system/log messages are visually distinct
 * - 2026-02-10: Updated tool message rendering so non-streaming tool output keeps terminal-style formatting
 * - 2026-02-10: Implemented user message edit and delete following web app patterns
 * - 2026-02-10: Added edit button (pencil icon) and delete button (X icon) on user messages
 * - 2026-02-10: Edit mode shows textarea with Save/Cancel buttons, supports Escape to cancel
 * - 2026-02-10: Delete shows confirmation dialog with message preview
 * - 2026-02-10: Both features use IPC bridge (deleteMessage, loadWorld, sendMessage)
 * - 2026-02-10: Added helper functions: createMessageFromMemory, deduplicateMessages
 * - 2026-02-10: Fixed stuck "Processing..." state by ending stale tool-stream activity and syncing stream counts on tool lifecycle events
 * - 2026-02-10: Added markdown rendering for messages (matching web app behavior)
 * - 2026-02-10: Added delete button (X) next to name field in agent edit form
 * - 2026-02-10: Added a leading dot indicator for each chat session row in the sidebar list
 * - 2026-02-10: Added left inset spacing for the chat-session list container
 * - 2026-02-10: Added chat-session search input above the session list and removed world-card ID/path details
 * - 2026-02-10: Nudged session badge/delete control farther right for tighter edge alignment
 * - 2026-02-10: Reduced session stack spacing and aligned badge/delete control to the far-right edge of each row
 * - 2026-02-10: Tightened session row text/padding to reduce visual line height
 * - 2026-02-10: Selected chat-session highlight now uses a slightly darker dedicated sidebar token
 * - 2026-02-10: Removed chat-session row borders and aligned selected-row highlight to `bg-sidebar-accent` (same as user messages)
 * - 2026-02-10: Session rows now use a compact height, with badge/delete controls overlaid in the same right-side position
 * - 2026-02-10: Session list now shows message totals as right-aligned badges instead of inline "x messages" text
 * - 2026-02-10: Keep selected session message count in sync with loaded/streamed messages for live sidebar updates
 * - Reworked edit-form actions to use a fixed bottom row with tighter button padding
 * - Reduced edit-form Save/Cancel button size and pinned actions to panel bottom for easier access
 * - Added world form parity with web app (chat provider/model + MCP config fields) for create/edit panels
 * - Agent avatar message badges now count only non-human messages from the selected chat
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LeftSidebarPanel,
  AppFrameLayout,
  MainWorkspaceLayout,
  AppOverlaysHost,
} from './components/index.js';
import { getDesktopApi, safeMessage } from './domain/desktop-api.js';
import {
  getStatusBarStatus,
  publishStatusBarStatus,
  subscribeStatusBarStatus
} from './domain/status-bar.js';
import {
  createGlobalLogEventHandler,
  createChatSubscriptionEventHandler
} from './domain/chat-event-handlers.js';
import { useSkillRegistry } from './hooks/useSkillRegistry.js';
import { useStreamingActivity } from './hooks/useStreamingActivity.js';
import { useMessageManagement } from './hooks/useMessageManagement.js';
import { useSessionManagement } from './hooks/useSessionManagement.js';
import { useThemeSettings } from './hooks/useThemeSettings.js';
import { useWorldManagement } from './hooks/useWorldManagement.js';
import {
  COMPOSER_MAX_ROWS,
  DEFAULT_TURN_LIMIT,
  MIN_TURN_LIMIT,
  MAX_HEADER_AGENT_AVATARS,
  DEFAULT_WORLD_CHAT_LLM_PROVIDER,
  DEFAULT_WORLD_CHAT_LLM_MODEL,
  MAX_STATUS_AGENT_ITEMS,
  DEFAULT_AGENT_FORM,
  DRAG_REGION_STYLE,
  NO_DRAG_REGION_STYLE,
  HUMAN_SENDER_VALUES,
} from './constants/app-constants.js';
import {
  upsertEnvVariable,
} from './utils/data-transform.js';
import {
  formatTime,
  getRefreshWarning,
} from './utils/formatting.js';
import {
  validateWorldForm,
  validateAgentForm,
} from './utils/validation.js';
import {
  isHumanMessage,
} from './utils/message-utils.js';

function getAgentDisplayName(agent, fallbackIndex) {
  const name = typeof agent?.name === 'string' ? agent.name.trim() : '';
  if (name) return name;
  const id = typeof agent?.id === 'string' ? agent.id.trim() : '';
  if (id) return id;
  return `Agent ${fallbackIndex + 1}`;
}

function getAgentInitials(displayName) {
  const segments = String(displayName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (segments.length === 0) return '?';
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }
  return `${segments[0][0] || ''}${segments[1][0] || ''}`.toUpperCase();
}

function parseOptionalInteger(value, min = 0) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.floor(parsed));
}

function normalizeActivitySourceLabel(source) {
  const raw = String(source || '').trim();
  if (!raw) return '';
  return raw.startsWith('agent:') ? raw.slice('agent:'.length) : raw;
}

function getEnvValueFromText(variablesText, key) {
  if (!key) return undefined;
  const lines = String(variablesText).split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const envKey = line.slice(0, eqIndex).trim();
    if (envKey !== key) continue;
    return line.slice(eqIndex + 1).trim();
  }
  return undefined;
}

function getDefaultWorldForm() {
  return {
    name: '',
    description: '',
    turnLimit: DEFAULT_TURN_LIMIT,
    mainAgent: '',
    chatLLMProvider: DEFAULT_WORLD_CHAT_LLM_PROVIDER,
    chatLLMModel: DEFAULT_WORLD_CHAT_LLM_MODEL,
    mcpConfig: '',
    variables: ''
  };
}

function getWorldFormFromWorld(world) {
  if (!world) return getDefaultWorldForm();

  const turnLimitRaw = Number(world.turnLimit);
  const turnLimit = Number.isFinite(turnLimitRaw) && turnLimitRaw >= MIN_TURN_LIMIT
    ? Math.floor(turnLimitRaw)
    : DEFAULT_TURN_LIMIT;
  const chatLLMProvider = String(world.chatLLMProvider || '').trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER;
  const chatLLMModel = String(world.chatLLMModel || '').trim() || DEFAULT_WORLD_CHAT_LLM_MODEL;
  const mainAgent = String(world.mainAgent || '').trim();

  return {
    name: String(world.name || ''),
    description: String(world.description || ''),
    turnLimit,
    mainAgent,
    chatLLMProvider,
    chatLLMModel,
    mcpConfig: world.mcpConfig == null ? '' : String(world.mcpConfig),
    variables: world.variables == null ? '' : String(world.variables)
  };
}

export default function App() {
  const api = useMemo(() => getDesktopApi(), []);
  const chatSubscriptionCounter = useRef(0);
  const messageRefreshCounter = useRef(0);
  const composerTextareaRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const sessionSetterProxyRef = useRef({
    setSessions: null,
    setSelectedSessionId: null,
  });

  const [workspace, setWorkspace] = useState({
    workspacePath: null,
    storagePath: null
  });
  const [messages, setMessages] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState('create-world');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [status, setStatus] = useState(() => getStatusBarStatus());
  const [creatingAgent, setCreatingAgent] = useState(DEFAULT_AGENT_FORM);
  const [editingAgent, setEditingAgent] = useState(DEFAULT_AGENT_FORM);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [selectedProjectPath, setSelectedProjectPath] = useState(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [loading, setLoading] = useState({
    sessions: false,
    messages: false,
    send: false
  });
  // Prompt editor modal state
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorValue, setPromptEditorValue] = useState('');
  const [promptEditorTarget, setPromptEditorTarget] = useState(null); // 'create' or 'edit'
  // World config editor modal state (edit-world only: variables | mcpConfig)
  const [worldConfigEditorOpen, setWorldConfigEditorOpen] = useState(false);
  const [worldConfigEditorValue, setWorldConfigEditorValue] = useState('');
  const [worldConfigEditorField, setWorldConfigEditorField] = useState('mcpConfig');
  const [worldConfigEditorTarget, setWorldConfigEditorTarget] = useState(null); // 'edit'
  // HITL option prompt queue (generic world option requests)
  const [hitlPromptQueue, setHitlPromptQueue] = useState([]);
  const [submittingHitlRequestId, setSubmittingHitlRequestId] = useState(null);

  const setStatusText = useCallback((text, kind = 'info') => {
    publishStatusBarStatus(text, kind);
  }, []);

  const {
    loadedWorld,
    setLoadedWorld,
    worldLoadError,
    setWorldLoadError,
    loadingWorld,
    setLoadingWorld,
    availableWorlds,
    setAvailableWorlds,
    creatingWorld,
    setCreatingWorld,
    editingWorld,
    setEditingWorld,
    updatingWorld,
    deletingWorld,
    refreshingWorldInfo,
    onSelectWorld,
    onCreateWorld,
    refreshWorldDetails,
    onRefreshWorldInfo,
    onUpdateWorld,
    onDeleteWorld,
    onImportWorld,
  } = useWorldManagement({
    api,
    setStatusText,
    setSessions: (updater) => sessionSetterProxyRef.current.setSessions?.(updater),
    setSelectedSessionId: (updater) => sessionSetterProxyRef.current.setSelectedSessionId?.(updater),
    setMessages,
    setSelectedAgentId,
    setPanelOpen,
    setPanelMode,
    getDefaultWorldForm,
    getWorldFormFromWorld,
  });

  const {
    sessions,
    setSessions,
    sessionSearch,
    setSessionSearch,
    selectedSessionId,
    setSelectedSessionId,
    deletingSessionId,
    filteredSessions,
    refreshSessions,
    onCreateSession,
    onSelectSession,
    onDeleteSession,
  } = useSessionManagement({
    api,
    loadedWorldId: loadedWorld?.id,
    setStatusText,
    setMessages,
    setLoading,
    messageRefreshCounter,
  });

  sessionSetterProxyRef.current.setSessions = setSessions;
  sessionSetterProxyRef.current.setSelectedSessionId = setSelectedSessionId;

  const {
    streamingStateRef,
    activityStateRef,
    isBusy,
    setIsBusy,
    elapsedMs,
    activeTools,
    setActiveTools,
    activeStreamCount,
    setActiveStreamCount,
    sessionActivity,
    setSessionActivity,
    resetActivityRuntimeState,
  } = useStreamingActivity({ setMessages });

  useEffect(() => {
    return subscribeStatusBarStatus(setStatus);
  }, []);

  const respondToHitlPrompt = useCallback(async (prompt, optionId) => {
    if (!prompt || !optionId) return;
    const worldId = String(loadedWorld?.id || '').trim();
    if (!worldId) {
      setStatusText('No world loaded to respond to approval request.', 'error');
      return;
    }

    const requestId = String(prompt.requestId || '').trim();
    if (!requestId) {
      setStatusText('Invalid approval request.', 'error');
      return;
    }

    setSubmittingHitlRequestId(requestId);
    try {
      await api.respondHitlOption(worldId, requestId, optionId, prompt.chatId || null);
      setHitlPromptQueue((existing) => existing.filter((entry) => entry.requestId !== requestId));
      if (optionId === 'no') {
        setStatusText('Skill execution was declined.', 'info');
      } else {
        setStatusText('Skill execution approved.', 'success');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to submit approval response.'), 'error');
    } finally {
      setSubmittingHitlRequestId((current) => (current === requestId ? null : current));
    }
  }, [api, loadedWorld?.id, setStatusText]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const worldInfoStats = useMemo(() => {
    const totalAgentsParsed = parseOptionalInteger(loadedWorld?.totalAgents, 0);
    const totalMessagesParsed = parseOptionalInteger(loadedWorld?.totalMessages, 0);
    const turnLimitParsed = parseOptionalInteger(loadedWorld?.turnLimit, MIN_TURN_LIMIT);

    const fallbackTotalAgents = Array.isArray(loadedWorld?.agents) ? loadedWorld.agents.length : 0;
    const fallbackTotalMessages = sessions.reduce((sum, session) => {
      const next = Number(session?.messageCount);
      return sum + (Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0);
    }, 0);

    return {
      totalAgents: totalAgentsParsed ?? fallbackTotalAgents,
      totalMessages: totalMessagesParsed ?? fallbackTotalMessages,
      turnLimit: turnLimitParsed ?? DEFAULT_TURN_LIMIT
    };
  }, [loadedWorld, sessions]);

  const rawWorldAgents = useMemo(
    () => (Array.isArray(loadedWorld?.agents) ? loadedWorld.agents : []),
    [loadedWorld]
  );

  const messageCountByAgentId = useMemo(() => {
    const normalizedSelectedSessionId = String(selectedSessionId || '').trim();
    if (!normalizedSelectedSessionId) {
      return new Map();
    }

    const idToAgentId = new Map();
    const nameToAgentId = new Map();

    rawWorldAgents.forEach((agent, index) => {
      const id = String(agent?.id || `agent-${index + 1}`);
      idToAgentId.set(id, id);
      const name = getAgentDisplayName(agent, index).toLowerCase();
      if (name) {
        nameToAgentId.set(name, id);
      }
    });

    const counts = new Map();
    for (const message of messages) {
      const messageChatId = String(message?.chatId || '').trim();
      if (!messageChatId || messageChatId !== normalizedSelectedSessionId) continue;
      if (isHumanMessage(message)) continue;

      const fromAgentId = String(message?.fromAgentId || '').trim();
      let resolvedAgentId = null;

      if (fromAgentId && idToAgentId.has(fromAgentId)) {
        resolvedAgentId = fromAgentId;
      } else {
        const sender = String(message?.sender || '').trim().toLowerCase();
        if (sender && nameToAgentId.has(sender)) {
          resolvedAgentId = nameToAgentId.get(sender);
        }
      }

      if (!resolvedAgentId) continue;
      counts.set(resolvedAgentId, (counts.get(resolvedAgentId) || 0) + 1);
    }

    return counts;
  }, [messages, rawWorldAgents, selectedSessionId]);

  const worldAgents = useMemo(() => {
    return rawWorldAgents.map((agent, index) => {
      const name = getAgentDisplayName(agent, index);
      const id = String(agent?.id || `agent-${index + 1}`);
      const derivedMessageCount = messageCountByAgentId.get(id);
      return {
        id,
        name,
        initials: getAgentInitials(name),
        autoReply: agent?.autoReply !== false,
        provider: String(agent?.provider || 'ollama'),
        model: String(agent?.model || 'llama3.1:8b'),
        systemPrompt: String(agent?.systemPrompt || ''),
        temperature: Number.isFinite(Number(agent?.temperature)) ? Number(agent.temperature) : null,
        maxTokens: Number.isFinite(Number(agent?.maxTokens)) ? Number(agent.maxTokens) : null,
        llmCallCount: Number.isFinite(Number(agent?.llmCallCount)) ? Number(agent.llmCallCount) : 0,
        messageCount: Number.isFinite(derivedMessageCount)
          ? Math.max(0, Math.floor(derivedMessageCount))
          : 0
      };
    });
  }, [messageCountByAgentId, rawWorldAgents]);

  const worldAgentsById = useMemo(() => {
    const next = new Map();
    for (const agent of worldAgents) {
      next.set(agent.id, agent);
    }
    return next;
  }, [worldAgents]);

  const worldAgentsByName = useMemo(() => {
    const next = new Map();
    for (const agent of worldAgents) {
      const normalizedName = String(agent?.name || '').trim().toLowerCase();
      if (!normalizedName) continue;
      next.set(normalizedName, agent);
    }
    return next;
  }, [worldAgents]);

  const visibleWorldAgents = useMemo(
    () => worldAgents.slice(0, MAX_HEADER_AGENT_AVATARS),
    [worldAgents]
  );

  const hiddenWorldAgentCount = Math.max(0, worldAgents.length - visibleWorldAgents.length);

  const selectedAgentForPanel = useMemo(
    () => worldAgents.find((agent) => agent.id === selectedAgentId) || null,
    [worldAgents, selectedAgentId]
  );

  const messagesById = useMemo(() => {
    const index = new Map();
    for (const message of messages) {
      const id = message?.messageId;
      if (!id) continue;
      index.set(String(id), message);
    }
    return index;
  }, [messages]);

  const refreshMessages = useCallback(async (worldId, sessionId) => {
    const refreshId = ++messageRefreshCounter.current;
    if (!worldId || !sessionId) {
      setMessages([]);
      setLoading((value) => ({ ...value, messages: false }));
      return;
    }

    setLoading((value) => ({ ...value, messages: true }));
    try {
      const nextMessages = await api.getMessages(worldId, sessionId);
      if (refreshId !== messageRefreshCounter.current) return;
      setMessages(nextMessages);
    } catch (error) {
      if (refreshId !== messageRefreshCounter.current) return;
      setStatusText(safeMessage(error, 'Failed to load messages.'), 'error');
    } finally {
      if (refreshId !== messageRefreshCounter.current) return;
      setLoading((value) => ({ ...value, messages: false }));
    }
  }, [api, setStatusText]);

  const {
    skillRegistryEntries,
    loadingSkillRegistry,
    skillRegistryError,
    refreshSkillRegistry,
  } = useSkillRegistry({
    api,
    selectedProjectPath,
    workspacePath: workspace.workspacePath,
    loadedWorldId: loadedWorld?.id,
  });

  const {
    themePreference,
    setThemePreference,
    systemSettings,
    setSystemSettings,
    savingSystemSettings,
    settingsNeedRestart,
    hasUnsavedSystemSettingsChanges,
    disabledGlobalSkillIdSet,
    disabledProjectSkillIdSet,
    visibleSkillRegistryEntries,
    globalSkillEntries,
    projectSkillEntries,
    toggleSkillEnabled,
    loadSystemSettings,
    resetSystemSettings,
    saveSystemSettings,
  } = useThemeSettings({
    api,
    panelMode,
    skillRegistryEntries,
    refreshSkillRegistry,
    setStatusText,
  });

  const {
    composer,
    setComposer,
    sendingSessionIds,
    stoppingSessionIds,
    pendingResponseSessionIds,
    setPendingResponseSessionIds,
    editingMessageId,
    editingText,
    setEditingText,
    deletingMessageId,
    onSendMessage,
    onStopMessage,
    onSubmitMessage,
    onStartEditMessage,
    onCancelEditMessage,
    onSaveEditMessage,
    onDeleteMessage,
    onBranchFromMessage,
    resetMessageRuntimeState,
  } = useMessageManagement({
    api,
    loadedWorldId: loadedWorld?.id,
    selectedSessionId,
    systemSettings,
    messages,
    messagesById,
    refreshMessages,
    setMessages,
    setSessions,
    setSelectedSessionId,
    setStatusText,
    streamingStateRef,
    activityStateRef,
    setActiveStreamCount,
    setActiveTools,
    setIsBusy,
    setSessionActivity,
  });

  const initialize = useCallback(async () => {
    try {
      const nextWorkspace = await api.getWorkspace();
      setWorkspace(nextWorkspace);
      if (nextWorkspace.workspacePath) {
        // Load worlds from workspace
        setLoadingWorld(true);
        try {
          const worldsState = await api.loadWorldFromFolder();
          if (worldsState.success && worldsState.worlds) {
            setAvailableWorlds(worldsState.worlds);
            // Auto-load last selected world
            const lastWorldId = await api.getLastSelectedWorld();
            if (lastWorldId && worldsState.worlds.some(w => w.id === lastWorldId)) {
              await onSelectWorld(lastWorldId);
            }
            setWorldLoadError(null);
            // User must explicitly select a world (no auto-selection)
          } else {
            setAvailableWorlds([]);
            setLoadedWorld(null);
            setWorldLoadError(worldsState.message || worldsState.error);
            setSessions([]);
          }
        } catch (error) {
          setAvailableWorlds([]);
          setLoadedWorld(null);
          setWorldLoadError(safeMessage(error, 'Failed to load worlds from folder'));
          setSessions([]);
        } finally {
          setLoadingWorld(false);
        }
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to initialize app.'), 'error');
    }
  }, [api, setStatusText]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    refreshSessions(loadedWorld?.id, loadedWorld?.currentChatId || null);
  }, [loadedWorld?.id, loadedWorld?.currentChatId, refreshSessions]);

  useEffect(() => {
    refreshMessages(loadedWorld?.id, selectedSessionId);
  }, [loadedWorld, selectedSessionId, refreshMessages]);

  useEffect(() => {
    const normalizedSessionId = String(selectedSessionId || '').trim();
    if (!normalizedSessionId) return;

    const nextMessageCount = Array.isArray(messages) ? messages.length : 0;
    setSessions((existing) => {
      let changed = false;
      const next = existing.map((session) => {
        const sessionId = String(session?.id || '').trim();
        if (sessionId !== normalizedSessionId) return session;

        const currentCountRaw = Number(session?.messageCount);
        const currentCount = Number.isFinite(currentCountRaw) ? Math.max(0, Math.floor(currentCountRaw)) : 0;
        if (currentCount === nextMessageCount) return session;

        changed = true;
        return {
          ...session,
          messageCount: nextMessageCount
        };
      });

      return changed ? next : existing;
    });
  }, [messages, selectedSessionId]);

  useEffect(() => {
    if (!loadedWorld) {
      setEditingWorld(getDefaultWorldForm());
      return;
    }

    setEditingWorld(getWorldFormFromWorld(loadedWorld));
  }, [loadedWorld]);

  useEffect(() => {
    const workingDirectory = getEnvValueFromText(loadedWorld?.variables, 'working_directory');
    setSelectedProjectPath(workingDirectory || null);
  }, [loadedWorld?.id, loadedWorld?.variables]);

  useEffect(() => {
    if (loadedWorld?.id) return;
    resetMessageRuntimeState();
    resetActivityRuntimeState();
    setHitlPromptQueue([]);
    setSubmittingHitlRequestId(null);
  }, [loadedWorld?.id, resetActivityRuntimeState, resetMessageRuntimeState]);

  useEffect(() => {
    setSessionSearch('');
  }, [loadedWorld?.id]);

  // Global log listener (independent of chat session subscription)
  useEffect(() => {
    const removeListener = api.onChatEvent(createGlobalLogEventHandler({
      loadedWorldId: loadedWorld?.id,
      selectedSessionId,
      setMessages
    }));

    return () => {
      removeListener();
    };
  }, [api, loadedWorld?.id, selectedSessionId]);

  useEffect(() => {
    if (!loadedWorld?.id || !selectedSessionId) {
      return undefined;
    }

    const subscriptionId = `chat-${Date.now()}-${chatSubscriptionCounter.current++}`;
    let disposed = false;
    const removeListener = api.onChatEvent(createChatSubscriptionEventHandler({
      subscriptionId,
      loadedWorldId: loadedWorld.id,
      selectedSessionId,
      streamingStateRef,
      activityStateRef,
      setMessages,
      setActiveStreamCount,
      onSessionResponseStateChange: (chatId, isActive) => {
        if (!chatId) return;
        setPendingResponseSessionIds((existing) => {
          const next = new Set(existing);
          if (isActive) {
            next.add(chatId);
          } else {
            next.delete(chatId);
          }
          return next;
        });
      },
      onSessionActivityUpdate: (activity) => {
        setSessionActivity(activity);
      },
      onSessionSystemEvent: (systemEvent) => {
        if (!loadedWorld?.id) return;
        const eventType = String(systemEvent?.eventType || '').trim();
        if (eventType === 'chat-title-updated') {
          const targetChatId = String(systemEvent?.chatId || selectedSessionId || '').trim() || null;
          refreshSessions(loadedWorld.id, targetChatId).catch(() => { });
          return;
        }
        if (eventType !== 'hitl-option-request') {
          return;
        }

        const content = systemEvent?.content && typeof systemEvent.content === 'object'
          ? systemEvent.content
          : null;
        const requestId = String(content?.requestId || '').trim();
        if (!requestId) {
          return;
        }

        const options = Array.isArray(content?.options)
          ? content.options
            .map((option) => ({
              id: String(option?.id || '').trim(),
              label: String(option?.label || '').trim(),
              description: option?.description ? String(option.description) : ''
            }))
            .filter((option) => option.id && option.label)
          : [];
        if (options.length === 0) {
          return;
        }

        setHitlPromptQueue((existing) => {
          if (existing.some((entry) => entry.requestId === requestId)) {
            return existing;
          }
          return [
            ...existing,
            {
              requestId,
              chatId: systemEvent?.chatId || selectedSessionId || null,
              title: String(content?.title || 'Approval required').trim() || 'Approval required',
              message: String(content?.message || '').trim(),
              options
            }
          ];
        });
      }
    }));

    api.subscribeChatEvents(loadedWorld.id, selectedSessionId, subscriptionId).catch((error) => {
      if (!disposed) {
        setStatusText(safeMessage(error, 'Failed to subscribe to chat updates.'), 'error');
      }
    });

    return () => {
      disposed = true;
      removeListener();
      api.unsubscribeChatEvents(subscriptionId).catch(() => { });
      // Cleanup streaming state on session change
      if (streamingStateRef.current) {
        streamingStateRef.current.cleanup();
      }
      if (activityStateRef.current) {
        activityStateRef.current.cleanup();
      }
      resetActivityRuntimeState();
    };
  }, [api, selectedSessionId, loadedWorld, setStatusText, refreshSessions, resetActivityRuntimeState]);

  const onOpenWorkspace = useCallback(async () => {
    try {
      const picked = await api.pickDirectory();
      if (picked?.canceled || !picked?.directoryPath) {
        return;
      }
      const nextWorkspace = await api.openWorkspace(String(picked.directoryPath));
      setWorkspace(nextWorkspace);
      setStatusText('Workspace path selected', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to open workspace.'), 'error');
    }
  }, [api, setStatusText]);


  const hasUnsavedWorldChanges = useCallback(() => {
    if (panelMode === 'create-world') {
      const defaultForm = getDefaultWorldForm();
      return creatingWorld.name !== defaultForm.name ||
        creatingWorld.description !== defaultForm.description ||
        creatingWorld.turnLimit !== defaultForm.turnLimit ||
        creatingWorld.mainAgent !== defaultForm.mainAgent ||
        creatingWorld.chatLLMProvider !== defaultForm.chatLLMProvider ||
        creatingWorld.chatLLMModel !== defaultForm.chatLLMModel ||
        creatingWorld.mcpConfig !== defaultForm.mcpConfig ||
        creatingWorld.variables !== defaultForm.variables;
    }
    if (panelMode === 'edit-world' && loadedWorld) {
      const originalForm = getWorldFormFromWorld(loadedWorld);
      return editingWorld.name !== originalForm.name ||
        editingWorld.description !== originalForm.description ||
        editingWorld.turnLimit !== originalForm.turnLimit ||
        editingWorld.mainAgent !== originalForm.mainAgent ||
        editingWorld.chatLLMProvider !== originalForm.chatLLMProvider ||
        editingWorld.chatLLMModel !== originalForm.chatLLMModel ||
        editingWorld.mcpConfig !== originalForm.mcpConfig ||
        editingWorld.variables !== originalForm.variables;
    }
    return false;
  }, [panelMode, creatingWorld, editingWorld, loadedWorld]);

  const hasUnsavedAgentChanges = useCallback(() => {
    if (panelMode === 'create-agent') {
      return creatingAgent.name !== DEFAULT_AGENT_FORM.name ||
        creatingAgent.autoReply !== DEFAULT_AGENT_FORM.autoReply ||
        creatingAgent.provider !== DEFAULT_AGENT_FORM.provider ||
        creatingAgent.model !== DEFAULT_AGENT_FORM.model ||
        creatingAgent.systemPrompt !== DEFAULT_AGENT_FORM.systemPrompt ||
        creatingAgent.temperature !== DEFAULT_AGENT_FORM.temperature ||
        creatingAgent.maxTokens !== DEFAULT_AGENT_FORM.maxTokens;
    }
    if (panelMode === 'edit-agent' && selectedAgentForPanel) {
      return editingAgent.name !== selectedAgentForPanel.name ||
        editingAgent.autoReply !== (selectedAgentForPanel.autoReply !== false) ||
        editingAgent.provider !== selectedAgentForPanel.provider ||
        editingAgent.model !== selectedAgentForPanel.model ||
        editingAgent.systemPrompt !== selectedAgentForPanel.systemPrompt ||
        String(editingAgent.temperature ?? '') !== String(selectedAgentForPanel.temperature ?? '') ||
        String(editingAgent.maxTokens ?? '') !== String(selectedAgentForPanel.maxTokens ?? '');
    }
    return false;
  }, [panelMode, creatingAgent, editingAgent, selectedAgentForPanel]);

  const closePanel = useCallback(() => {
    const hasWorldChanges = hasUnsavedWorldChanges();
    const hasAgentChanges = hasUnsavedAgentChanges();
    const hasSettingsChanges = hasUnsavedSystemSettingsChanges;

    if (hasWorldChanges || hasAgentChanges || hasSettingsChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close this panel?');
      if (!confirmed) return;
    }

    setPanelOpen(false);
    setPanelMode('create-world');
    setSelectedAgentId(null);
  }, [hasUnsavedAgentChanges, hasUnsavedSystemSettingsChanges, hasUnsavedWorldChanges]);

  const onOpenSettingsPanel = useCallback(async () => {
    setPanelMode('settings');
    setPanelOpen(true);
    try {
      await loadSystemSettings();
    } catch { }
  }, [loadSystemSettings]);

  const onCancelSettings = useCallback(() => {
    resetSystemSettings();
    closePanel();
  }, [closePanel, resetSystemSettings]);

  const onSaveSettings = useCallback(async () => {
    const result = await saveSystemSettings();
    if (result.saved && !result.needsRestart) {
      setPanelOpen(false);
      setPanelMode('create-world');
    }
  }, [saveSystemSettings]);

  const onOpenCreateWorldPanel = useCallback(() => {
    setPanelMode('create-world');
    setPanelOpen(true);
  }, []);

  const onOpenWorldEditPanel = useCallback(() => {
    if (!loadedWorld) return;
    setEditingWorld(getWorldFormFromWorld(loadedWorld));
    setPanelMode('edit-world');
    setPanelOpen(true);
  }, [loadedWorld]);


  const onOpenCreateAgentPanel = useCallback(() => {
    if (!loadedWorld?.id) {
      setStatusText('Load a world before creating an agent.', 'error');
      return;
    }
    setSelectedAgentId(null);
    setCreatingAgent(DEFAULT_AGENT_FORM);
    setPanelMode('create-agent');
    setPanelOpen(true);
  }, [loadedWorld, setStatusText]);

  const onOpenEditAgentPanel = useCallback((agentId) => {
    const targetAgent = worldAgents.find((agent) => agent.id === agentId);
    if (!targetAgent) {
      setStatusText('Agent not found.', 'error');
      return;
    }

    setSelectedAgentId(targetAgent.id);
    setEditingAgent({
      id: targetAgent.id,
      name: targetAgent.name,
      autoReply: targetAgent.autoReply !== false,
      provider: targetAgent.provider || 'ollama',
      model: targetAgent.model || 'llama3.1:8b',
      systemPrompt: targetAgent.systemPrompt || '',
      temperature: targetAgent.temperature ?? '',
      maxTokens: targetAgent.maxTokens ?? ''
    });
    setPanelMode('edit-agent');
    setPanelOpen(true);
  }, [worldAgents, setStatusText]);


  const onCreateAgent = useCallback(async (event) => {
    event.preventDefault();
    if (!loadedWorld?.id) {
      setStatusText('No world loaded for agent creation.', 'error');
      return;
    }

    const validation = validateAgentForm(creatingAgent);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    setSavingAgent(true);
    try {
      await api.createAgent(loadedWorld.id, validation.data);

      await refreshWorldDetails(loadedWorld.id);
      setCreatingAgent(DEFAULT_AGENT_FORM);
      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`Agent created: ${validation.data.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create agent.'), 'error');
    } finally {
      setSavingAgent(false);
    }
  }, [api, creatingAgent, loadedWorld, refreshWorldDetails, setStatusText]);

  const onUpdateAgent = useCallback(async (event) => {
    event.preventDefault();
    if (!loadedWorld?.id || !editingAgent.id) {
      setStatusText('Select an agent to update.', 'error');
      return;
    }

    const validation = validateAgentForm(editingAgent);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    setSavingAgent(true);
    try {
      await api.updateAgent(loadedWorld.id, editingAgent.id, validation.data);

      await refreshWorldDetails(loadedWorld.id);
      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`Agent updated: ${validation.data.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to update agent.'), 'error');
    } finally {
      setSavingAgent(false);
    }
  }, [api, editingAgent, loadedWorld, refreshWorldDetails, setStatusText]);

  const onDeleteAgent = useCallback(async () => {
    if (!loadedWorld?.id || !editingAgent.id) {
      setStatusText('No agent selected to delete.', 'error');
      return;
    }

    const agentName = editingAgent.name || editingAgent.id;
    const shouldDelete = window.confirm(`Delete agent "${agentName}"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setDeletingAgent(true);
    try {
      await api.deleteAgent(loadedWorld.id, editingAgent.id);

      await refreshWorldDetails(loadedWorld.id);
      setPanelOpen(false);
      setPanelMode('create-world');
      setSelectedAgentId(null);
      setStatusText(`Agent deleted: ${agentName}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to delete agent.'), 'error');
    } finally {
      setDeletingAgent(false);
    }
  }, [api, editingAgent, loadedWorld, refreshWorldDetails, setStatusText]);

  const onSelectProject = useCallback(async () => {
    if (!loadedWorld?.id) {
      setStatusText('Load a world before selecting a project folder.', 'error');
      return;
    }

    try {
      const result = await api.openWorkspace();
      if (!result.canceled && result.workspacePath) {
        const selectedPath = String(result.workspacePath).trim();
        const nextVariables = upsertEnvVariable(loadedWorld.variables || '', 'working_directory', selectedPath);
        const updated = await api.updateWorld(loadedWorld.id, { variables: nextVariables });
        const warning = getRefreshWarning(updated);
        const updatedWorld = { ...updated };
        delete updatedWorld.refreshWarning;

        setLoadedWorld(updatedWorld);
        setSelectedProjectPath(selectedPath);
        setStatusText(
          warning ? `Project selected: ${selectedPath}. ${warning}` : `Project selected: ${selectedPath}`,
          warning ? 'error' : 'info'
        );
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to select project folder.'), 'error');
    }
  }, [api, loadedWorld, setStatusText]);

  const onComposerKeyDown = useCallback((event) => {
    if (event.nativeEvent?.isComposing || event.keyCode === 229) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      // Check per-session sending state for concurrency support
      const isCurrentSessionSending = selectedSessionId && sendingSessionIds.has(selectedSessionId);
      const isCurrentSessionStopping = selectedSessionId && stoppingSessionIds.has(selectedSessionId);
      const isCurrentSessionPendingResponse = selectedSessionId && pendingResponseSessionIds.has(selectedSessionId);
      const canStopCurrentSession = Boolean(selectedSessionId) && !isCurrentSessionSending && !isCurrentSessionStopping && Boolean(isCurrentSessionPendingResponse);

      if (canStopCurrentSession) {
        return;
      }
      if (composer.trim() && !isCurrentSessionSending) {
        onSendMessage();
      }
    }
  }, [
    composer,
    selectedSessionId,
    sendingSessionIds,
    stoppingSessionIds,
    pendingResponseSessionIds,
    onSendMessage
  ]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const lineHeight = Number.parseInt(window.getComputedStyle(textarea).lineHeight, 10) || 20;
    const maxHeight = lineHeight * COMPOSER_MAX_ROWS;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
  }, [composer]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const hasNewMessage = messages.length > previousMessageCountRef.current;
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: hasNewMessage ? 'smooth' : 'auto'
      });
    });
    previousMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (!selectedSessionId) return;
    const composerTextarea = composerTextareaRef.current;
    if (!composerTextarea) return;
    composerTextarea.focus({ preventScroll: true });
  }, [selectedSessionId]);

  const isCurrentSessionSending = Boolean(selectedSessionId && sendingSessionIds.has(selectedSessionId));
  const isCurrentSessionStopping = Boolean(selectedSessionId && stoppingSessionIds.has(selectedSessionId));
  const isCurrentSessionPendingResponse = Boolean(selectedSessionId && pendingResponseSessionIds.has(selectedSessionId));
  const canStopCurrentSession = Boolean(selectedSessionId) && !isCurrentSessionSending && !isCurrentSessionStopping && isCurrentSessionPendingResponse;
  const activeAgentSources = useMemo(() => {
    if (!Array.isArray(sessionActivity.activeSources)) return [];

    const unique = new Set();
    for (const source of sessionActivity.activeSources) {
      const normalized = normalizeActivitySourceLabel(source);
      if (normalized) unique.add(normalized);
    }

    return Array.from(unique);
  }, [sessionActivity.activeSources]);
  const workingAgentCount = activeAgentSources.length;
  const pendingAgentCount = Math.max(0, Number(sessionActivity.pendingOperations || 0) - workingAgentCount);
  const isAgentWorkInProgress = workingAgentCount > 0;
  const agentStatusText = useMemo(() => {
    if (!Array.isArray(worldAgents) || worldAgents.length === 0) {
      return isAgentWorkInProgress
        ? `${workingAgentCount} working · ${pendingAgentCount} pending`
        : 'done';
    }

    const activeSourceSet = new Set(activeAgentSources.map((source) => String(source).toLowerCase()));
    const statuses = worldAgents.map((agent, index) => {
      const label = String(agent?.name || '').trim() || `Agent ${index + 1}`;
      const normalizedId = String(agent?.id || '').trim().toLowerCase();
      const normalizedName = String(agent?.name || '').trim().toLowerCase();
      const isWorking =
        (normalizedId && activeSourceSet.has(normalizedId)) ||
        (normalizedName && activeSourceSet.has(normalizedName));
      return `${label} ${isWorking ? 'working' : 'done'}`;
    });

    if (statuses.length <= MAX_STATUS_AGENT_ITEMS) {
      return statuses.join(', ');
    }

    const remaining = statuses.length - MAX_STATUS_AGENT_ITEMS;
    return `${statuses.slice(0, MAX_STATUS_AGENT_ITEMS).join(', ')}, +${remaining} more`;
  }, [
    worldAgents,
    activeAgentSources,
    isAgentWorkInProgress,
    pendingAgentCount,
    workingAgentCount
  ]);
  const hasComposerActivity =
    isCurrentSessionPendingResponse ||
    Number(sessionActivity.pendingOperations || 0) > 0 ||
    activeTools.length > 0 ||
    activeStreamCount > 0 ||
    isBusy;
  const showInlineWorkingIndicator =
    Boolean(selectedSessionId)
    && Number(sessionActivity.pendingOperations || 0) > 0;
  const inlineWorkingAgentLabel = useMemo(() => {
    const resolveAgentName = (source) => {
      const rawSource = String(source || '').trim();
      if (!rawSource) return '';

      const normalizedSource = normalizeActivitySourceLabel(rawSource).toLowerCase();
      if (!normalizedSource) return '';
      if (!Array.isArray(worldAgents) || worldAgents.length === 0) return rawSource;

      const matchedAgent = worldAgents.find((agent) => {
        const normalizedId = String(agent?.id || '').trim().toLowerCase();
        const normalizedName = String(agent?.name || '').trim().toLowerCase();
        return normalizedSource === normalizedId || normalizedSource === normalizedName;
      });

      return String(matchedAgent?.name || rawSource);
    };

    if (Array.isArray(activeAgentSources) && activeAgentSources.length > 0) {
      const firstResolved = resolveAgentName(activeAgentSources[0]);
      if (firstResolved) return firstResolved;
    }

    const mainAgentResolved = resolveAgentName(loadedWorld?.mainAgent);
    if (mainAgentResolved) return mainAgentResolved;

    if (Array.isArray(worldAgents) && worldAgents.length > 0) {
      const firstAgentName = String(worldAgents[0]?.name || '').trim();
      if (firstAgentName) return firstAgentName;
    }

    return 'Agent';
  }, [activeAgentSources, worldAgents, loadedWorld?.mainAgent]);
  const activeHitlPrompt = hitlPromptQueue.length > 0 ? hitlPromptQueue[0] : null;
  const hasConversationMessages = useMemo(() => {
    return messages.some((message) => {
      const role = String(message?.role || '').toLowerCase();
      return role === 'user' || role === 'assistant';
    });
  }, [messages]);

  const mainContentMessageListProps = {
    messagesContainerRef,
    hasConversationMessages,
    selectedSession,
    refreshSkillRegistry,
    loadingSkillRegistry,
    visibleSkillRegistryEntries,
    skillRegistryError,
    messages,
    messagesById,
    worldAgentsById,
    worldAgentsByName,
    editingText,
    setEditingText,
    editingMessageId,
    deletingMessageId,
    onCancelEditMessage,
    onSaveEditMessage,
    onStartEditMessage,
    onDeleteMessage,
    onBranchFromMessage,
    showInlineWorkingIndicator,
    inlineWorkingAgentLabel,
  };

  const mainContentComposerProps = {
    onSubmitMessage,
    composerTextareaRef,
    composer,
    onComposerChange: setComposer,
    onComposerKeyDown,
    onSelectProject,
    selectedProjectPath,
    canStopCurrentSession,
    isCurrentSessionStopping,
    isCurrentSessionSending,
  };

  const mainContentRightPanelShellProps = {
    panelOpen,
    panelMode,
    onClose: closePanel,
  };

  const mainContentRightPanelContentProps = {
    panelMode,
    loadedWorld,
    selectedAgentForPanel,
    themePreference,
    setThemePreference,
    systemSettings,
    setSystemSettings,
    workspace,
    api,
    globalSkillEntries,
    disabledGlobalSkillIdSet,
    toggleSkillEnabled,
    projectSkillEntries,
    disabledProjectSkillIdSet,
    onCancelSettings,
    savingSystemSettings,
    onSaveSettings,
    settingsNeedRestart,
    onUpdateWorld,
    editingWorld,
    setEditingWorld,
    updatingWorld,
    deletingWorld,
    setWorldConfigEditorField,
    setWorldConfigEditorValue,
    setWorldConfigEditorTarget,
    setWorldConfigEditorOpen,
    onDeleteWorld,
    closePanel,
    onCreateAgent,
    creatingAgent,
    setCreatingAgent,
    setPromptEditorValue,
    setPromptEditorTarget,
    setPromptEditorOpen,
    savingAgent,
    onUpdateAgent,
    editingAgent,
    setEditingAgent,
    deletingAgent,
    onDeleteAgent,
    onCreateWorld,
    creatingWorld,
    setCreatingWorld,
  };

  const leftSidebarProps = {
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    dragRegionStyle: DRAG_REGION_STYLE,
    noDragRegionStyle: NO_DRAG_REGION_STYLE,
    availableWorlds,
    loadedWorld,
    onOpenCreateWorldPanel,
    onImportWorld,
    onSelectWorld,
    loadingWorld,
    worldLoadError,
    worldInfoStats,
    refreshingWorldInfo,
    updatingWorld,
    deletingWorld,
    onRefreshWorldInfo,
    onOpenWorldEditPanel,
    onDeleteWorld,
    onCreateSession,
    sessionSearch,
    setSessionSearch,
    sessions,
    filteredSessions,
    selectedSessionId,
    onSelectSession,
    deletingSessionId,
    onDeleteSession,
  };

  const mainHeaderProps = {
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    selectedWorld: loadedWorld,
    selectedSession,
    visibleWorldAgents,
    hiddenWorldAgentCount,
    onOpenEditAgentPanel,
    onOpenCreateAgentPanel,
    onOpenSettingsPanel,
    panelMode,
    panelOpen,
    dragRegionStyle: DRAG_REGION_STYLE,
    noDragRegionStyle: NO_DRAG_REGION_STYLE,
  };

  const statusActivityBarProps = {
    status,
    hasComposerActivity,
    isAgentWorkInProgress,
    activeTools,
    elapsedMs,
  };

  return (
    <AppFrameLayout
      sidebar={<LeftSidebarPanel {...leftSidebarProps} />}
      mainContent={(
        <MainWorkspaceLayout
          mainHeaderProps={mainHeaderProps}
          mainContentAreaProps={{
            messageListProps: mainContentMessageListProps,
            composerProps: mainContentComposerProps,
            rightPanelShellProps: mainContentRightPanelShellProps,
            rightPanelContentProps: mainContentRightPanelContentProps,
          }}
          statusActivityBarProps={statusActivityBarProps}
        />
      )}
      overlays={(
        <AppOverlaysHost
          hitlPromptProps={{
            activeHitlPrompt,
            submittingHitlRequestId,
            onRespond: respondToHitlPrompt,
          }}
          editorModalsProps={{
            promptEditorOpen,
            promptEditorValue,
            setPromptEditorValue,
            setPromptEditorOpen,
            promptEditorTarget,
            setCreatingAgent,
            setEditingAgent,
            worldConfigEditorOpen,
            worldConfigEditorField,
            worldConfigEditorValue,
            setWorldConfigEditorValue,
            setWorldConfigEditorOpen,
            worldConfigEditorTarget,
            setEditingWorld,
          }}
        />
      )}
    />
  );
}
