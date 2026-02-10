/**
 * Desktop Renderer App - Three-Column Workspace UI
 *
 * Features:
 * - World selector dropdown showing all worlds from workspace
 * - Workspace/world/session sidebar, chat center, context panel
 * - User can select which world to load from dropdown
 * - Theme toggle and collapsible left sidebar
 * - React-style chat composer with multiline textarea and action row
 *
 * Implementation Notes:
 * - Function component with local state and IPC-only desktop API calls
 * - Window drag regions are explicit (`drag` + `no-drag`) for custom title rows
 * - Composer textarea auto-resizes and supports Enter-to-send (Shift+Enter newline)
 * - Loads all worlds from workspace folder, displays in dropdown for selection
 *
 * Recent Changes:
 * - 2026-02-10: Removed recent workspace and folder path display (worlds from environment only)
 * - 2026-02-09: Changed to world selector dropdown showing all worlds from folder
 * - 2026-02-09: Removed workspace history, replaced with world list from current folder
 * - 2026-02-09: Refactored state management for automatic world loading from folders
 * - 2026-02-09: Updated sidebar UI elements to use sidebar-specific token classes consistently
 * - 2026-02-09: Prevented Enter-to-send during IME composition and while send is in-flight
 * - 2026-02-09: Switched sidebars to solid sidebar token background (removed translucency)
 * - 2026-02-09: Restyled chat composer to mirror React app input area and interaction
 * - 2026-02-08: Simplified/condensed header comment block
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const THEME_STORAGE_KEY = 'agent-world-desktop-theme';
const COMPOSER_MAX_ROWS = 5;
const DEFAULT_TURN_LIMIT = 5;
const MIN_TURN_LIMIT = 1;
const DRAG_REGION_STYLE = { WebkitAppRegion: 'drag' };
const NO_DRAG_REGION_STYLE = { WebkitAppRegion: 'no-drag' };

function getDesktopApi() {
  const api = window.agentWorldDesktop;
  if (!api) {
    throw new Error('Desktop API bridge is unavailable.');
  }
  return api;
}

function getStoredThemePreference() {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function safeMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getMessageTimestamp(message) {
  const value = message?.createdAt;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function upsertMessageList(existingMessages, incomingMessage) {
  const incomingId = incomingMessage?.messageId || incomingMessage?.id;
  const next = [...existingMessages];

  if (!incomingId) {
    next.push(incomingMessage);
  } else {
    const existingIndex = next.findIndex((message) => (message.messageId || message.id) === incomingId);
    if (existingIndex >= 0) {
      next[existingIndex] = {
        ...next[existingIndex],
        ...incomingMessage,
        id: next[existingIndex].id || incomingMessage.id || incomingId
      };
    } else {
      next.push({
        ...incomingMessage,
        id: incomingMessage.id || incomingId
      });
    }
  }

  next.sort((left, right) => getMessageTimestamp(left) - getMessageTimestamp(right));
  return next;
}

export default function App() {
  const api = useMemo(() => getDesktopApi(), []);
  const chatSubscriptionCounter = useRef(0);
  const workspaceDropdownRef = useRef(null);
  const composerTextareaRef = useRef(null);

  const [workspace, setWorkspace] = useState({
    workspacePath: null,
    storagePath: null,
    coreInitialized: false
  });
  const [loadedWorld, setLoadedWorld] = useState(null);
  const [worldLoadError, setWorldLoadError] = useState(null);
  const [loadingWorld, setLoadingWorld] = useState(false);
  const [availableWorlds, setAvailableWorlds] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [themePreference, setThemePreference] = useState(getStoredThemePreference);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [status, setStatus] = useState({ text: '', kind: 'info' });
  const [creatingWorld, setCreatingWorld] = useState({
    name: '',
    description: '',
    turnLimit: DEFAULT_TURN_LIMIT
  });
  const [showCreateWorldPrompt, setShowCreateWorldPrompt] = useState(false);
  const [selectedProjectPath, setSelectedProjectPath] = useState(null);
  const [loading, setLoading] = useState({
    sessions: false,
    messages: false,
    send: false
  });

  const setStatusText = useCallback((text, kind = 'info') => {
    setStatus({ text, kind });
  }, []);

  const selectedWorld = useMemo(
    () => loadedWorld,
    [loadedWorld]
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const refreshSessions = useCallback(async (worldId, preferredSessionId = null) => {
    if (!worldId) {
      setSessions([]);
      setSelectedSessionId(null);
      setMessages([]);
      return;
    }

    setLoading((value) => ({ ...value, sessions: true }));
    try {
      const nextSessions = await api.listSessions(worldId);
      setSessions(nextSessions);
      const nextSelected =
        preferredSessionId && nextSessions.some((session) => session.id === preferredSessionId)
          ? preferredSessionId
          : nextSessions[0]?.id || null;
      setSelectedSessionId(nextSelected);
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to load sessions.'), 'error');
    } finally {
      setLoading((value) => ({ ...value, sessions: false }));
    }
  }, [api, setStatusText]);

  const refreshMessages = useCallback(async (worldId, sessionId) => {
    if (!worldId || !sessionId) {
      setMessages([]);
      return;
    }

    setLoading((value) => ({ ...value, messages: true }));
    try {
      const nextMessages = await api.getMessages(worldId, sessionId);
      setMessages(nextMessages);
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to load messages.'), 'error');
    } finally {
      setLoading((value) => ({ ...value, messages: false }));
    }
  }, [api, setStatusText]);

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
    refreshSessions(loadedWorld?.id);
  }, [loadedWorld, refreshSessions]);

  useEffect(() => {
    refreshMessages(loadedWorld?.id, selectedSessionId);
  }, [loadedWorld, selectedSessionId, refreshMessages]);

  useEffect(() => {
    if (!loadedWorld?.id || !selectedSessionId) {
      return undefined;
    }

    const subscriptionId = `chat-${Date.now()}-${chatSubscriptionCounter.current++}`;
    let disposed = false;
    const removeListener = api.onChatEvent((payload) => {
      if (disposed || !payload || payload.type !== 'message') return;
      if (payload.subscriptionId && payload.subscriptionId !== subscriptionId) return;
      if (payload.worldId && payload.worldId !== loadedWorld.id) return;

      const incomingMessage = payload.message;
      if (!incomingMessage) return;

      const incomingChatId = incomingMessage.chatId || payload.chatId || null;
      if (selectedSessionId && incomingChatId && incomingChatId !== selectedSessionId) return;

      setMessages((existing) => upsertMessageList(existing, incomingMessage));
    });

    api.subscribeChatEvents(loadedWorld.id, selectedSessionId, subscriptionId).catch((error) => {
      if (!disposed) {
        setStatusText(safeMessage(error, 'Failed to subscribe to chat updates.'), 'error');
      }
    });

    return () => {
      disposed = true;
      removeListener();
      api.unsubscribeChatEvents(subscriptionId).catch(() => { });
    };
  }, [api, selectedSessionId, loadedWorld, setStatusText]);

  useEffect(() => () => {
    api.unsubscribeChatEvents('default').catch(() => { });
  }, [api]);

  useEffect(() => {
    if (!workspaceMenuOpen) return undefined;

    const onDocumentPointerDown = (event) => {
      const target = event.target;
      if (workspaceDropdownRef.current && target instanceof Node && !workspaceDropdownRef.current.contains(target)) {
        setWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, [workspaceMenuOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (themePreference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', themePreference);
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    }
  }, [themePreference]);

  const onOpenWorkspace = useCallback(async () => {
    try {
      const nextWorkspace = await api.openWorkspace();
      setWorkspace(nextWorkspace);
      setWorkspaceMenuOpen(false);
      setStatusText('Workspace path selected', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to open workspace.'), 'error');
    }
  }, [api, setStatusText]);

  const onSelectWorld = useCallback(async (worldId) => {
    if (!worldId) return;

    try {
      setLoadingWorld(true);
      setWorkspaceMenuOpen(false);
      const result = await api.loadWorld(worldId);

      if (result.success) {
        setLoadedWorld(result.world);
        setSessions(result.sessions || []);
        setWorldLoadError(null);
        setStatusText(`World loaded: ${result.world.id}`, 'success');
      } else {
        setLoadedWorld(null);
        setSessions([]);
        setWorldLoadError(result.message || result.error);
        setStatusText(result.message || 'Failed to load world', 'error');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to load world.'), 'error');
    } finally {
      setLoadingWorld(false);
    }
  }, [api, setStatusText]);

  const onCreateWorld = useCallback(async (event) => {
    event.preventDefault();
    if (!creatingWorld.name.trim()) {
      setStatusText('World name is required.', 'error');
      return;
    }

    try {
      const created = await api.createWorld({
        name: creatingWorld.name.trim(),
        description: creatingWorld.description.trim(),
        turnLimit: Number(creatingWorld.turnLimit) || 5
      });
      setCreatingWorld({ name: '', description: '', turnLimit: 5 });
      setShowCreateWorldPrompt(false);

      // Add to available worlds list
      setAvailableWorlds((worlds) => [...worlds, { id: created.id, name: created.name }]);

      // Load the created world and its sessions
      setLoadedWorld(created);
      const sessions = await api.listSessions(created.id);
      setSessions(sessions || []);
      setWorldLoadError(null);

      setStatusText(`World created: ${created.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create world.'), 'error');
    }
  }, [api, creatingWorld, setStatusText]);

  const onImportWorld = useCallback(async () => {
    try {
      const result = await api.importWorld();
      if (result.success) {
        // Add to available worlds list
        setAvailableWorlds((worlds) => [...worlds, { id: result.world.id, name: result.world.name }]);

        // Auto-select the imported world
        setLoadedWorld(result.world);
        setSessions(result.sessions || []);
        setWorldLoadError(null);

        setStatusText(`World imported: ${result.world.name}`, 'success');
      } else {
        setStatusText(result.message || result.error || 'Failed to import world', 'error');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to import world.'), 'error');
    }
  }, [api, setStatusText]);

  const onSelectProject = useCallback(async () => {
    try {
      const result = await api.openWorkspace();
      if (!result.canceled && result.workspacePath) {
        setSelectedProjectPath(result.workspacePath);
        setStatusText(`Project selected: ${result.workspacePath}`, 'info');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to select project folder.'), 'error');
    }
  }, [api, setStatusText]);

  const onClearProject = useCallback(() => {
    setSelectedProjectPath(null);
    setStatusText('Project cleared', 'info');
  }, [setStatusText]);

  const onCreateSession = useCallback(async () => {
    if (!loadedWorld?.id) {
      setStatusText('No world loaded. Please open a folder with a world first.', 'error');
      return;
    }

    try {
      const result = await api.createSession(loadedWorld.id);
      setSessions(result.sessions || []);
      const nextSessionId = result.currentChatId || result.sessions?.[0]?.id || null;
      setSelectedSessionId(nextSessionId);
      if (nextSessionId) {
        await api.selectSession(loadedWorld.id, nextSessionId);
      }
      setStatusText('Chat session created.', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create session.'), 'error');
    }
  }, [api, loadedWorld, setStatusText]);

  const onSelectSession = useCallback(async (chatId) => {
    if (!loadedWorld?.id) return;
    try {
      await api.selectSession(loadedWorld.id, chatId);
      setSelectedSessionId(chatId);
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to select session.'), 'error');
    }
  }, [api, loadedWorld, setStatusText]);

  const onSendMessage = useCallback(async () => {
    if (loading.send) return;
    if (!loadedWorld?.id || !selectedSessionId) {
      setStatusText('Select a session before sending messages.', 'error');
      return;
    }
    const content = composer.trim();
    if (!content) return;

    setLoading((value) => ({ ...value, send: true }));
    try {
      await api.sendMessage({
        worldId: loadedWorld.id,
        chatId: selectedSessionId,
        content,
        sender: 'human'
      });
      setComposer('');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to send message.'), 'error');
    } finally {
      setLoading((value) => ({ ...value, send: false }));
    }
  }, [api, composer, loading.send, selectedSessionId, loadedWorld, setStatusText]);

  const onSubmitMessage = useCallback((event) => {
    event.preventDefault();
    onSendMessage();
  }, [onSendMessage]);

  const onComposerKeyDown = useCallback((event) => {
    if (event.nativeEvent?.isComposing || event.keyCode === 229) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (composer.trim() && !loading.send) {
        onSendMessage();
      }
    }
  }, [composer, loading.send, onSendMessage]);

  useEffect(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const lineHeight = Number.parseInt(window.getComputedStyle(textarea).lineHeight, 10) || 20;
    const maxHeight = lineHeight * COMPOSER_MAX_ROWS;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
  }, [composer]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full">
        <aside
          className={`border-r border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden transition-all duration-200 ${leftSidebarCollapsed ? 'w-0 border-r-0 p-0 opacity-0' : 'w-80 px-4 pb-4 pt-2 opacity-100'
            }`}
        >
          <div className="mb-3 flex h-8 items-start justify-end gap-2" style={DRAG_REGION_STYLE}>
            <button
              type="button"
              onClick={() => setLeftSidebarCollapsed(true)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              style={NO_DRAG_REGION_STYLE}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <polyline points="15 6 9 12 15 18" />
              </svg>
            </button>
          </div>

          <div className="mb-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="uppercase tracking-wide text-sidebar-foreground/70">
                Worlds {availableWorlds.length > 0 ? `(${availableWorlds.length})` : ''}
              </div>
              <div className="flex items-center gap-1" style={NO_DRAG_REGION_STYLE}>
                <button
                  type="button"
                  onClick={() => setShowCreateWorldPrompt(true)}
                  className="rounded p-1 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  title="Create new world"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={onImportWorld}
                  className="rounded p-1 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  title="Import world from folder"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="relative" ref={workspaceDropdownRef} style={NO_DRAG_REGION_STYLE}>
              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen((value) => !value)}
                className="flex w-full items-center justify-between rounded-md border border-sidebar-border bg-sidebar px-2 py-2 text-left text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <span className="truncate">
                  {loadedWorld?.name || (availableWorlds.length > 0 ? 'Select a world' : 'No worlds available')}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`ml-2 h-4 w-4 shrink-0 transition-transform ${workspaceMenuOpen ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {workspaceMenuOpen ? (
                <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-md border border-sidebar-border bg-sidebar p-1 shadow-lg">
                  {availableWorlds.length === 0 ? (
                    <div className="px-2 py-1.5 text-sidebar-foreground/70">No worlds available</div>
                  ) : (
                    availableWorlds.map((world) => (
                      <button
                        key={world.id}
                        type="button"
                        onClick={() => onSelectWorld(world.id)}
                        className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${loadedWorld?.id === world.id ? 'bg-sidebar-accent' : ''
                          }`}
                        title={world.id}
                      >
                        <span className="truncate">{world.name}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
          {/* World Info Section */}
          {loadingWorld ? (
            <div className="mb-4 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
              <div className="flex items-center gap-2 text-sidebar-foreground">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading world from folder...</span>
              </div>
            </div>
          ) : worldLoadError ? (
            showCreateWorldPrompt ? (
              <div className="mb-4 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-medium text-sidebar-foreground">Create a World</div>
                  <button
                    type="button"
                    onClick={() => setShowCreateWorldPrompt(false)}
                    className="text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <form onSubmit={onCreateWorld} className="space-y-3">
                  <input
                    value={creatingWorld.name}
                    onChange={(event) => setCreatingWorld((value) => ({ ...value, name: event.target.value }))}
                    placeholder="World name"
                    className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                    autoFocus
                  />
                  <textarea
                    value={creatingWorld.description}
                    onChange={(event) => setCreatingWorld((value) => ({ ...value, description: event.target.value }))}
                    placeholder="Description (optional)"
                    className="h-20 w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                  />
                  <input
                    type="number"
                    min={MIN_TURN_LIMIT}
                    value={creatingWorld.turnLimit}
                    onChange={(event) => setCreatingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || MIN_TURN_LIMIT }))}
                    placeholder={`Turn limit (default: ${DEFAULT_TURN_LIMIT})`}
                    className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-md bg-sidebar-primary px-3 py-2 text-sm font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                  >
                    Create World
                  </button>
                </form>
              </div>
            ) : (
              <div className="mb-4 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
                <div className="mb-2 text-sidebar-foreground">
                  {worldLoadError}
                </div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateWorldPrompt(true)}
                    className="w-full rounded border border-sidebar-border px-2 py-1.5 text-sidebar-foreground hover:bg-sidebar hover:border-sidebar-primary"
                  >
                    Create a World
                  </button>
                </div>
              </div>
            )
          ) : availableWorlds.length === 0 && !worldLoadError ? (
            <div className="mb-4 rounded-md border border-sidebar-border bg-sidebar-accent p-4 text-xs">
              <div className="mb-2 font-medium text-sidebar-foreground">
                No worlds available
              </div>
              <div className="mb-2 text-sidebar-foreground/70">
                Create your first world or import an existing one
              </div>
              <div className="text-[10px] text-sidebar-foreground/60">
                Tip: Use the + button above to create a new world
              </div>
            </div>
          ) : loadedWorld ? (
            <div className="mb-4 space-y-2 text-xs">
              <div className="uppercase tracking-wide text-sidebar-foreground/70">World Info</div>
              <div className="rounded-md border border-sidebar-border bg-sidebar-accent p-3">
                <div className="mb-2 text-sm font-semibold text-sidebar-foreground">
                  {loadedWorld.name}
                </div>
                {loadedWorld.description ? (
                  <div className="mb-2 text-sidebar-foreground/80">
                    {loadedWorld.description}
                  </div>
                ) : null}
                <div className="space-y-1 text-sidebar-foreground/80">
                  <div>
                    Agents: {loadedWorld.totalAgents} | Turn Limit: {loadedWorld.turnLimit} | Messages: {loadedWorld.totalMessages}
                  </div>
                  <div className="text-[10px] text-sidebar-foreground/60">
                    ID: {loadedWorld.id}
                  </div>
                  <div className="break-all text-[10px] text-sidebar-foreground/60">
                    Path: {workspace.storagePath ? `${workspace.storagePath}/${loadedWorld.id}` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          ) : availableWorlds.length > 0 ? (
            <div className="mb-4 rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
              Select a world from the dropdown above
            </div>
          ) : null}
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-sidebar-foreground/70">Chat Sessions</div>
            <button
              type="button"
              onClick={onCreateSession}
              disabled={!loadedWorld}
              className="rounded border border-sidebar-border px-2 py-1 text-xs text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title={!loadedWorld ? 'Load a world first' : 'Create new session'}
            >
              New
            </button>
          </div>

          <div className="max-h-56 space-y-2 overflow-auto pr-1">
            {sessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
                {loadedWorld ? 'No sessions yet.' : 'No world loaded.'}
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full rounded-md border p-2 text-left text-xs ${selectedSessionId === session.id
                    ? 'border-sidebar-primary bg-sidebar-primary/15 text-sidebar-foreground'
                    : 'border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                >
                  <div className="font-medium">{session.name}</div>
                  <div className="mt-1 text-[11px] text-sidebar-foreground/70">
                    {session.messageCount} messages
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col bg-background">
          <header
            className={`flex items-center justify-between border-b border-border pb-3 pt-2 ${leftSidebarCollapsed ? 'pl-24 pr-5' : 'px-5'
              }`}
            style={DRAG_REGION_STYLE}
          >
            <div className="flex items-center gap-3">
              {leftSidebarCollapsed ? (
                <button
                  type="button"
                  onClick={() => setLeftSidebarCollapsed(false)}
                  className="flex h-6 w-6 self-start items-center justify-center rounded-md bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  title="Show sidebar"
                  aria-label="Show sidebar"
                  style={NO_DRAG_REGION_STYLE}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </button>
              ) : null}
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {selectedWorld ? selectedWorld.name : 'No world selected'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedSession ? `${selectedSession.name}` : 'Select a session to start chatting'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2" style={NO_DRAG_REGION_STYLE}>
              <div className="inline-flex items-center rounded-md border border-input bg-card p-0.5">
                {['system', 'light', 'dark'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setThemePreference(mode)}
                    className={`rounded px-2.5 py-1 text-xs capitalize transition-colors ${themePreference === mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    title={`Use ${mode} theme`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen((value) => !value)}
                className="rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {panelOpen ? 'Hide Panel' : 'Show Panel'}
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex-1 space-y-3 overflow-auto p-5">
                {messages.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {selectedSession
                      ? 'No messages yet. Send your first message.'
                      : 'Select a session from the left column.'}
                  </div>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={`max-w-3xl rounded-lg border p-3 ${String(message.role).toLowerCase() === 'user'
                        ? 'ml-auto border-primary/40 bg-primary/15'
                        : 'border-border bg-card/70'
                        }`}
                    >
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{message.sender}</span>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-foreground">
                        {message.content}
                      </div>
                    </article>
                  ))
                )}
              </div>

              <form onSubmit={onSubmitMessage} className="border-t border-border p-4">
                <div className="flex flex-col gap-2 rounded-lg border border-input bg-card p-3">
                  <textarea
                    ref={composerTextareaRef}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={1}
                    placeholder="Send a message..."
                    className="w-full resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    aria-label="Message input"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Attach file"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-5 w-5"
                        >
                          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={onSelectProject}
                        className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Select project folder"
                        title="Select project folder for context"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                        </svg>
                        <span>Project</span>
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={loading.send || !composer.trim()}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading.send ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                  {selectedProjectPath ? (
                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3.5 w-3.5 shrink-0"
                        >
                          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                        </svg>
                        <span className="truncate" title={selectedProjectPath}>
                          Project: {selectedProjectPath}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={onClearProject}
                        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Clear project"
                        title="Clear project"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3.5 w-3.5"
                        >
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                </div>
              </form>
            </section>

            <aside
              className={`border-l border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ${panelOpen ? 'w-80 p-4 opacity-100' : 'w-0 p-0 opacity-0'
                }`}
            >
              {panelOpen ? (
                <div className="h-full overflow-auto">
                  <h2 className="mb-3 text-xs uppercase tracking-wide text-sidebar-foreground/70">Context Panel</h2>

                  <div className="mb-5 rounded-md border border-sidebar-border bg-sidebar-accent p-3 text-xs">
                    <div className="mb-2 text-sidebar-foreground/70">Active Context</div>
                    <div className="space-y-1 text-sidebar-foreground">
                      <div>World: {selectedWorld?.name || 'N/A'}</div>
                      <div>Session: {selectedSession?.name || 'N/A'}</div>
                    </div>
                  </div>

                  <h3 className="mb-2 text-xs uppercase tracking-wide text-sidebar-foreground/70">Create World</h3>
                  <form onSubmit={onCreateWorld} className="space-y-3">
                    <input
                      value={creatingWorld.name}
                      onChange={(event) => setCreatingWorld((value) => ({ ...value, name: event.target.value }))}
                      placeholder="World name"
                      className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                    />
                    <textarea
                      value={creatingWorld.description}
                      onChange={(event) => setCreatingWorld((value) => ({ ...value, description: event.target.value }))}
                      placeholder="Description (optional)"
                      className="h-24 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                    />
                    <input
                      type="number"
                      min="1"
                      value={creatingWorld.turnLimit}
                      onChange={(event) => setCreatingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || 1 }))}
                      className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/70 focus:border-sidebar-ring"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-sidebar-primary px-3 py-2 text-sm font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                    >
                      Create World
                    </button>
                  </form>
                </div>
              ) : null}
            </aside>
          </div>

          {status.text ? (
            <div
              className={`border-t px-5 py-2 text-xs ${status.kind === 'error'
                ? 'border-destructive/40 bg-destructive/15 text-destructive'
                : status.kind === 'success'
                  ? 'border-secondary/40 bg-secondary/20 text-secondary-foreground'
                  : 'border-border bg-card text-muted-foreground'
                }`}
            >
              {status.text}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
