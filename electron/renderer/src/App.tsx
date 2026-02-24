/**
 * Desktop Renderer App - Workspace Orchestration
 * Purpose:
 * - Orchestrate renderer state/hooks and compose the Electron desktop workspace shell.
 *
 * Features:
 * - World/session lifecycle, chat streaming state, and panel orchestration.
 * - HITL prompt handling and settings integration.
 * - Layout composition via extracted presentational components.
 *
 * Implementation Notes:
 * - Keeps behavior parity with existing renderer flows while delegating logic to hooks.
 * - Uses desktop IPC bridge (`window.agentWorldDesktop`) via domain helper APIs.
 *
 * Recent Changes:
 * - 2026-02-22: Status bar completion is now driven by core activity events plus a send-finish no-activity fallback for zero-agent runs.
 * - 2026-02-22: Removed frontend @mention validation/inference from status and pending decisions; renderer now follows core event signals only.
 * - 2026-02-22: Restored immediate working-indicator visibility during send handshake by including per-session sending state in composer activity detection.
 * - 2026-02-22: Reset completion-transition ref on session changes to avoid cross-session false "processed" status messages.
 * - 2026-02-22: Added end-of-run status-bar summary showing how many agents processed the latest message.
 * - 2026-02-21: Wired assistant-message raw-markdown copy action into message-list props for desktop chat cards.
 * - 2026-02-20: Disabled new-message sending while HITL prompt queue is non-empty.
 * - 2026-02-20: Moved HITL prompt UX from overlay modal to inline message-flow cards inside the message list.
 * - 2026-02-20: Enforced options-only HITL handling in renderer response wiring.
 * - 2026-02-20: Wired active streaming-agent IDs into header props so top avatars can animate during response activity.
 * - 2026-02-20: Fixed welcome-card flicker by deriving message-presence from renderable message identity rather than role-only checks.
 * - 2026-02-19: Restricted inline working indicator to the initial `calling LLM...` phase only; hides during streaming/done/tool phases.
 * - 2026-02-19: Split activity text surfaces: status bar shows full per-agent state, inline indicator shows first active agent state only.
 * - 2026-02-19: Kept per-agent inline activity visible during active runs with explicit done/active/pending labels (e.g. `a1: done; a2: streaming response...`).
 * - 2026-02-19: Limited inline working indicator details to agent-focused activity only (no generic status-bar text).
 * - 2026-02-19: Expanded inline chat working indicator with multi-agent status, queue/tool counts, and elapsed time.
 * - 2026-02-19: Wired world export action through `useWorldManagement` into sidebar props.
 * - 2026-02-18: Aligned renderer agent provider/model fallbacks with the selected world's chat LLM provider/model.
 * - 2026-02-17: CC cleanup reduced file size by extracting pure helpers and removing redundant/unused orchestration sections.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LeftSidebarPanel,
  AppFrameLayout,
  MainWorkspaceLayout,
  AppOverlaysHost,
  WorkingStatusBar,
} from './components/index';
import { useWorkingStatus } from './hooks/useWorkingStatus';
import { getDesktopApi, safeMessage } from './domain/desktop-api';
import { useSkillRegistry } from './hooks/useSkillRegistry';
import { useStreamingActivity } from './hooks/useStreamingActivity';
import { useMessageManagement } from './hooks/useMessageManagement';
import { useSessionManagement } from './hooks/useSessionManagement';
import { useThemeSettings } from './hooks/useThemeSettings';
import { useWorldManagement } from './hooks/useWorldManagement';
import { useAppActionHandlers } from './hooks/useAppActionHandlers';
import {
  COMPOSER_MAX_ROWS,
  DEFAULT_TURN_LIMIT,
  MIN_TURN_LIMIT,
  MAX_HEADER_AGENT_AVATARS,
  DEFAULT_AGENT_FORM,
  DEFAULT_WORLD_CHAT_LLM_PROVIDER,
  DEFAULT_WORLD_CHAT_LLM_MODEL,
  DRAG_REGION_STYLE,
  NO_DRAG_REGION_STYLE,
} from './constants/app-constants';
import {
  validateWorldForm,
} from './utils/validation';
import {
  isHumanMessage,
  isRenderableMessageEntry,
} from './utils/message-utils';
import {
  getAgentDisplayName,
  getAgentInitials,
  getDefaultWorldForm,
  getEnvValueFromText,
  getWorldFormFromWorld,
  parseOptionalInteger,
} from './utils/app-helpers';
import { useChatEventSubscriptions } from './hooks/useChatEventSubscriptions';
import { clearChatAgents, finalizeReplayedChat, getChatStatus, syncWorldRoster, updateRegistry } from './domain/status-registry';
import { applyEventToRegistry, parseStoredEventReplayArgs } from './domain/status-updater';
import {
  createLeftSidebarProps,
  createMainContentComposerProps,
  createMainContentMessageListProps,
  createMainContentRightPanelContentProps,
  createMainContentRightPanelShellProps,
  createMainHeaderProps,
} from './utils/app-layout-props';

type WorkspaceState = {
  workspacePath: string | null;
  storagePath: string | null;
};

type LoadingState = {
  sessions: boolean;
  messages: boolean;
};

type SetterProxy = {
  setSessions: ((updater: any) => void) | null;
  setSelectedSessionId: ((updater: any) => void) | null;
};

type HitlPrompt = {
  requestId: string;
  chatId: string | null;
  title: string;
  message: string;
  mode: 'option';
  options: Array<{ id: string; label: string; description?: string }>;
  defaultOptionId?: string;
  metadata?: {
    refreshAfterDismiss?: boolean;
    kind?: string;
  };
};

export default function App() {
  const api = useMemo(() => getDesktopApi(), []);
  const chatSubscriptionCounter = useRef(0);
  const messageRefreshCounter = useRef(0);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const sessionSetterProxyRef = useRef<SetterProxy>({
    setSessions: null,
    setSelectedSessionId: null,
  });

  const [workspace, setWorkspace] = useState<WorkspaceState>({
    workspacePath: null,
    storagePath: null
  });
  const [messages, setMessages] = useState<any[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState('create-world');
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState<any>(DEFAULT_AGENT_FORM);
  const [editingAgent, setEditingAgent] = useState<any>(DEFAULT_AGENT_FORM);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [loading, setLoading] = useState<LoadingState>({
    sessions: false,
    messages: false
  });
  // Prompt editor modal state
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorValue, setPromptEditorValue] = useState('');
  const [promptEditorTarget, setPromptEditorTarget] = useState<string | null>(null); // 'create' or 'edit'
  // World config editor modal state (edit-world only: variables | mcpConfig)
  const [worldConfigEditorOpen, setWorldConfigEditorOpen] = useState(false);
  const [worldConfigEditorValue, setWorldConfigEditorValue] = useState('');
  const [worldConfigEditorField, setWorldConfigEditorField] = useState('mcpConfig');
  const [worldConfigEditorTarget, setWorldConfigEditorTarget] = useState<string | null>(null); // 'edit'
  // HITL option prompt queue (generic world option requests)
  const [hitlPromptQueue, setHitlPromptQueue] = useState<HitlPrompt[]>([]);
  const [submittingHitlRequestId, setSubmittingHitlRequestId] = useState<string | null>(null);
  const hasActiveHitlPrompt = hitlPromptQueue.length > 0;

  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notification, setNotification] = useState<{ text: string; kind: 'error' | 'success' | 'info' } | null>(null);

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current !== null) {
        clearTimeout(notificationTimerRef.current);
      }
    };
  }, []);

  const setStatusText = useCallback((text: string, kind: string = 'info') => {
    const safeKind = (kind === 'error' || kind === 'success') ? kind : 'info';
    setNotification({ text, kind: safeKind });
    if (notificationTimerRef.current !== null) {
      clearTimeout(notificationTimerRef.current);
    }
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, 5000);
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
    onExportWorld,
  } = useWorldManagement({
    api,
    setStatusText,
    setSessions: (updater: any) => sessionSetterProxyRef.current.setSessions?.(updater),
    setSelectedSessionId: (updater: any) => sessionSetterProxyRef.current.setSelectedSessionId?.(updater),
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
    resetActivityRuntimeState,
  } = useStreamingActivity({ setMessages });

  const respondToHitlPrompt = useCallback(async (prompt: HitlPrompt, optionId: string) => {
    if (!prompt) return;
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

    const normalizedOptionId = String(optionId || '').trim();
    if (!normalizedOptionId) {
      setStatusText('Invalid HITL response payload.', 'error');
      return;
    }

    setSubmittingHitlRequestId(requestId);
    try {
      await api.respondHitlOption(worldId, requestId, normalizedOptionId, prompt.chatId || null);
      setHitlPromptQueue((existing: HitlPrompt[]) => existing.filter((entry) => entry.requestId !== requestId));

      if (prompt?.metadata?.refreshAfterDismiss) {
        await refreshWorldDetails(worldId);
        await refreshSessions(worldId, prompt?.chatId || selectedSessionId || null);
      }

      if (prompt?.metadata?.kind === 'create_agent_created') {
        setStatusText('Agent created confirmation dismissed.', 'success');
      } else if (normalizedOptionId === 'no') {
        setStatusText('Skill execution was declined.', 'info');
      } else {
        setStatusText('HITL response submitted.', 'success');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to submit approval response.'), 'error');
    } finally {
      setSubmittingHitlRequestId((current: string | null) => (current === requestId ? null : current));
    }
  }, [api, loadedWorld?.id, refreshSessions, refreshWorldDetails, selectedSessionId, setStatusText]);

  const selectedSession = useMemo(
    () => sessions.find((session: any) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const worldInfoStats = useMemo(() => {
    const totalAgentsParsed = parseOptionalInteger(loadedWorld?.totalAgents, 0);
    const totalMessagesParsed = parseOptionalInteger(loadedWorld?.totalMessages, 0);
    const turnLimitParsed = parseOptionalInteger(loadedWorld?.turnLimit, MIN_TURN_LIMIT);

    const fallbackTotalAgents = Array.isArray(loadedWorld?.agents) ? loadedWorld.agents.length : 0;
    const fallbackTotalMessages = sessions.reduce((sum: number, session: any) => {
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

    rawWorldAgents.forEach((agent: any, index: number) => {
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
      let resolvedAgentId: string | null = null;

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
    const worldDefaultProvider = String(loadedWorld?.chatLLMProvider || '').trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER;
    const worldDefaultModel = String(loadedWorld?.chatLLMModel || '').trim() || DEFAULT_WORLD_CHAT_LLM_MODEL;

    return rawWorldAgents.map((agent: any, index: number) => {
      const name = getAgentDisplayName(agent, index);
      const id = String(agent?.id || `agent-${index + 1}`);
      const derivedMessageCount = messageCountByAgentId.get(id);
      return {
        id,
        name,
        initials: getAgentInitials(name),
        autoReply: agent?.autoReply !== false,
        provider: String(agent?.provider || worldDefaultProvider),
        model: String(agent?.model || worldDefaultModel),
        systemPrompt: String(agent?.systemPrompt || ''),
        temperature: Number.isFinite(Number(agent?.temperature)) ? Number(agent.temperature) : null,
        maxTokens: Number.isFinite(Number(agent?.maxTokens)) ? Number(agent.maxTokens) : null,
        llmCallCount: Number.isFinite(Number(agent?.llmCallCount)) ? Number(agent.llmCallCount) : 0,
        messageCount: Number.isFinite(derivedMessageCount)
          ? Math.max(0, Math.floor(derivedMessageCount))
          : 0
      };
    });
  }, [loadedWorld?.chatLLMModel, loadedWorld?.chatLLMProvider, messageCountByAgentId, rawWorldAgents]);

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
    () => worldAgents.find((agent: any) => agent.id === selectedAgentId) || null,
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

  const refreshMessages = useCallback(async (worldId: string | null | undefined, sessionId: string | null | undefined) => {
    const refreshId = ++messageRefreshCounter.current;
    if (!worldId || !sessionId) {
      setMessages([]);
      setLoading((value: { sessions: boolean; messages: boolean }) => ({ ...value, messages: false }));
      return;
    }

    setLoading((value: { sessions: boolean; messages: boolean }) => ({ ...value, messages: true }));
    try {
      const nextMessages = (await api.getMessages(worldId, sessionId)) as any[];
      if (refreshId !== messageRefreshCounter.current) return;
      setMessages(nextMessages);
    } catch (error) {
      if (refreshId !== messageRefreshCounter.current) return;
      setStatusText(safeMessage(error, 'Failed to load messages.'), 'error');
    } finally {
      if (refreshId !== messageRefreshCounter.current) return;
      setLoading((value: { sessions: boolean; messages: boolean }) => ({ ...value, messages: false }));
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
    onCopyRawMarkdownFromMessage,
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
    hasActiveHitlPrompt,
    setHitlPromptQueue,
    setSubmittingHitlRequestId,
  });

  const initialize = useCallback(async () => {
    try {
      const nextWorkspace: any = await api.getWorkspace();
      setWorkspace(nextWorkspace);
      if (nextWorkspace.workspacePath) {
        // Load worlds from workspace
        setLoadingWorld(true);
        try {
          const worldsState: any = await api.loadWorldFromFolder();
          if (worldsState.success && worldsState.worlds) {
            setAvailableWorlds(worldsState.worlds);
            // Auto-load last selected world
            const lastWorldId = await api.getLastSelectedWorld();
            if (lastWorldId && worldsState.worlds.some((w: any) => w.id === lastWorldId)) {
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
  }, [loadedWorld?.id, selectedSessionId, refreshMessages]);

  // Phase 6.2b: Replay stored events to reconstruct status on chat switch.
  // Clear and replay happen atomically after the fetch so the previous status
  // remains visible while events are loading (no brief flash to idle).
  useEffect(() => {
    const worldId = loadedWorld?.id;
    const chatId = selectedSessionId;
    if (!worldId || !chatId) return;

    let cancelled = false;
    (async () => {
      try {
        const events = (await api.getChatEvents(worldId, chatId)) as any[];
        if (cancelled) return;
        // Atomic clear + replay: apply all events in one registry update.
        // Downgrade guard: if the live registry already has 'complete' for this
        // chat but the DB-replayed events only reach 'working' (async persistence
        // lag — 'sse end' not yet saved), keep the live complete status so we
        // don't regress the indicator back to "working".
        updateRegistry(r => {
          const liveStatus = getChatStatus(r, worldId, chatId);
          let reg = clearChatAgents(r, worldId, chatId);
          if (!Array.isArray(events)) return reg;
          for (const storedEvent of events) {
            const args = parseStoredEventReplayArgs(storedEvent);
            if (!args) continue;
            reg = applyEventToRegistry(reg, worldId, chatId, args.agentName, args.eventType, args.subtype);
          }
          // Normalize: force any remaining 'working' to 'complete'.
          // Handles incomplete sequences (e.g. sse/end missing from interrupted sessions).
          reg = finalizeReplayedChat(reg, worldId, chatId);
          // Don't downgrade complete → working (DB persistence lag)
          if (liveStatus === 'complete' && getChatStatus(reg, worldId, chatId) === 'working') {
            return r;
          }
          return reg;
        });
      } catch {
        // Clear stale data on fetch failure
        if (!cancelled) {
          updateRegistry(r => clearChatAgents(r, worldId, chatId));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [api, loadedWorld?.id, selectedSessionId]);

  useEffect(() => {
    const normalizedSessionId = String(selectedSessionId || '').trim();
    if (!normalizedSessionId) return;

    const nextMessageCount = Array.isArray(messages) ? messages.length : 0;
    setSessions((existing: any[]) => {
      let changed = false;
      const next = existing.map((session: any) => {
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
    setHitlPromptQueue([]);
    setSubmittingHitlRequestId(null);
  }, [selectedSessionId]);

  useEffect(() => {
    setSessionSearch('');
  }, [loadedWorld?.id]);

  // Phase 6.3: Sync world roster (agents + chats) into registry on every CRUD change
  useEffect(() => {
    if (!loadedWorld?.id) return;
    const chatIds = (sessions as any[]).map((s: any) => String(s?.id || '')).filter(Boolean);
    const agentIds = (Array.isArray(loadedWorld.agents) ? loadedWorld.agents : [])
      .map((a: any) => String(a?.id || '')).filter(Boolean);
    updateRegistry(r => syncWorldRoster(r, loadedWorld.id, chatIds, agentIds));
  }, [loadedWorld, sessions]);

  useChatEventSubscriptions({
    api,
    loadedWorld,
    selectedSessionId,
    setMessages,
    chatSubscriptionCounter,
    streamingStateRef,
    refreshSessions,
    resetActivityRuntimeState,
    setHitlPromptQueue,
  });

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

  const {
    closePanel,
    onOpenSettingsPanel,
    onCancelSettings,
    onSaveSettings,
    onOpenCreateWorldPanel,
    onOpenWorldEditPanel,
    onOpenCreateAgentPanel,
    onOpenEditAgentPanel,
    onCreateAgent,
    onUpdateAgent,
    onDeleteAgent,
    onSelectProject,
    onComposerKeyDown,
  } = useAppActionHandlers({
    api,
    loadedWorld,
    worldAgents,
    editingAgent,
    creatingAgent,
    setStatusText,
    closePanelNeeds: {
      hasUnsavedWorldChanges,
      hasUnsavedAgentChanges,
      hasUnsavedSystemSettingsChanges,
    },
    setPanelOpen,
    setPanelMode,
    setSelectedAgentId,
    setEditingWorld,
    getWorldFormFromWorld,
    setCreatingAgent,
    setEditingAgent,
    setSavingAgent,
    setDeletingAgent,
    refreshWorldDetails,
    setLoadedWorld,
    setSelectedProjectPath,
    selectedSessionId,
    sendingSessionIds,
    stoppingSessionIds,
    pendingResponseSessionIds,
    hasActiveHitlPrompt,
    composer,
    onSendMessage,
    loadSystemSettings,
    resetSystemSettings,
    saveSystemSettings,
  });

  const agentStatusInput = useMemo(
    () => worldAgents.map((a: any) => ({ id: String(a.id || ''), name: String(a.name || '') })),
    [worldAgents]
  );
  const { chatStatus, agentStatuses } = useWorkingStatus(loadedWorld?.id, selectedSessionId, agentStatusInput);

  const workingStartTimeRef = useRef<number | null>(null);
  const [inlineElapsedMs, setInlineElapsedMs] = useState(0);
  useEffect(() => {
    if (chatStatus === 'working') {
      if (workingStartTimeRef.current === null) {
        workingStartTimeRef.current = Date.now();
      }
      const id = setInterval(() => {
        setInlineElapsedMs(Date.now() - (workingStartTimeRef.current ?? Date.now()));
      }, 250);
      return () => clearInterval(id);
    }
    workingStartTimeRef.current = null;
    setInlineElapsedMs(0);
  }, [chatStatus]);

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
  const activeHitlPrompt = hitlPromptQueue.length > 0 ? hitlPromptQueue[0] : null;
  const showInlineWorkingIndicator = chatStatus === 'working' || isCurrentSessionSending;
  const workingAgentNames = agentStatuses.filter(a => a.status === 'working').map(a => a.name);
  const inlineWorkingIndicatorState = showInlineWorkingIndicator
    ? { primaryText: workingAgentNames.length > 0 ? workingAgentNames.join(', ') : 'Agent', elapsedMs: inlineElapsedMs }
    : null;
  const hasConversationMessages = useMemo(() => {
    return messages.some(isRenderableMessageEntry);
  }, [messages]);

  const mainContentMessageListProps = createMainContentMessageListProps({
    messagesContainerRef,
    messagesLoading: loading.messages,
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
    onCopyRawMarkdownFromMessage,
    showInlineWorkingIndicator,
    inlineWorkingIndicatorState,
    activeHitlPrompt,
    submittingHitlRequestId,
    onRespondHitlOption: (prompt: HitlPrompt, optionId: string) => respondToHitlPrompt(prompt, optionId),
  });

  const mainContentComposerProps = createMainContentComposerProps({
    onSubmitMessage,
    composerTextareaRef,
    composer,
    setComposer,
    onComposerKeyDown,
    onSelectProject,
    selectedProjectPath,
    canStopCurrentSession,
    isCurrentSessionStopping,
    isCurrentSessionSending,
    hasActiveHitlPrompt,
  });

  const mainContentRightPanelShellProps = createMainContentRightPanelShellProps({
    panelOpen,
    panelMode,
    closePanel,
  });

  const mainContentRightPanelContentProps = createMainContentRightPanelContentProps({
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
  });

  const leftSidebarProps = createLeftSidebarProps({
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    DRAG_REGION_STYLE,
    NO_DRAG_REGION_STYLE,
    availableWorlds,
    loadedWorld,
    onOpenCreateWorldPanel,
    onImportWorld,
    onExportWorld,
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
  });

  const mainHeaderProps = createMainHeaderProps({
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    loadedWorld,
    selectedSession,
    visibleWorldAgents,
    hiddenWorldAgentCount,
    activeHeaderAgentIds: [],
    onOpenEditAgentPanel,
    onOpenCreateAgentPanel,
    onOpenSettingsPanel,
    onRefreshWorldInfo,
    panelMode,
    panelOpen,
    DRAG_REGION_STYLE,
    NO_DRAG_REGION_STYLE,
  });

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
          statusBar={<WorkingStatusBar chatStatus={chatStatus} agentStatuses={agentStatuses} notification={notification} />}
        />
      )}
      overlays={(
        <AppOverlaysHost
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
