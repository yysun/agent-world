/**
 * Desktop Renderer App - Three-Column Workspace Chat Shell
 *
 * Features:
 * - Left column for workspace, worlds, and chat sessions
 * - Middle column for chat history and composer
 * - Right slide-in panel for context and world creation controls
 * - IPC-only data flow through preload bridge
 *
 * Implementation Notes:
 * - Keeps state local in function components with React hooks
 * - Avoids server API usage; all operations call `window.agentWorldDesktop`
 *
 * Recent Changes:
 * - 2026-02-08: Added subscription ID handling for concurrent IPC chat streams
 * - 2026-02-08: Added live chat updates via main-process IPC event subscription
 * - 2026-02-08: Updated renderer sender to canonical human value
 * - 2026-02-08: Initial Vite + React + Tailwind renderer implementation
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function getDesktopApi() {
  const api = window.agentWorldDesktop;
  if (!api) {
    throw new Error('Desktop API bridge is unavailable.');
  }
  return api;
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

  const [workspace, setWorkspace] = useState({
    workspacePath: null,
    storagePath: null,
    coreInitialized: false
  });
  const [worlds, setWorlds] = useState([]);
  const [selectedWorldId, setSelectedWorldId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [status, setStatus] = useState({ text: '', kind: 'info' });
  const [creatingWorld, setCreatingWorld] = useState({
    name: '',
    description: '',
    turnLimit: 5
  });
  const [loading, setLoading] = useState({
    worlds: false,
    sessions: false,
    messages: false,
    send: false
  });

  const setStatusText = useCallback((text, kind = 'info') => {
    setStatus({ text, kind });
  }, []);

  const selectedWorld = useMemo(
    () => worlds.find((world) => world.id === selectedWorldId) || null,
    [worlds, selectedWorldId]
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const refreshWorlds = useCallback(async (preferredWorldId = null) => {
    setLoading((value) => ({ ...value, worlds: true }));
    try {
      const nextWorlds = await api.listWorlds();
      setWorlds(nextWorlds);

      const nextSelected =
        preferredWorldId && nextWorlds.some((world) => world.id === preferredWorldId)
          ? preferredWorldId
          : nextWorlds[0]?.id || null;

      setSelectedWorldId(nextSelected);
      if (!nextSelected) {
        setSessions([]);
        setSelectedSessionId(null);
        setMessages([]);
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to load worlds.'), 'error');
    } finally {
      setLoading((value) => ({ ...value, worlds: false }));
    }
  }, [api, setStatusText]);

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
        await refreshWorlds();
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to initialize app.'), 'error');
    }
  }, [api, refreshWorlds, setStatusText]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    refreshSessions(selectedWorldId);
  }, [selectedWorldId, refreshSessions]);

  useEffect(() => {
    refreshMessages(selectedWorldId, selectedSessionId);
  }, [selectedWorldId, selectedSessionId, refreshMessages]);

  useEffect(() => {
    if (!selectedWorldId || !selectedSessionId) {
      return undefined;
    }

    const subscriptionId = `chat-${Date.now()}-${chatSubscriptionCounter.current++}`;
    let disposed = false;
    const removeListener = api.onChatEvent((payload) => {
      if (disposed || !payload || payload.type !== 'message') return;
      if (payload.subscriptionId && payload.subscriptionId !== subscriptionId) return;
      if (payload.worldId && payload.worldId !== selectedWorldId) return;

      const incomingMessage = payload.message;
      if (!incomingMessage) return;

      const incomingChatId = incomingMessage.chatId || payload.chatId || null;
      if (selectedSessionId && incomingChatId && incomingChatId !== selectedSessionId) return;

      setMessages((existing) => upsertMessageList(existing, incomingMessage));
    });

    api.subscribeChatEvents(selectedWorldId, selectedSessionId, subscriptionId).catch((error) => {
      if (!disposed) {
        setStatusText(safeMessage(error, 'Failed to subscribe to chat updates.'), 'error');
      }
    });

    return () => {
      disposed = true;
      removeListener();
      api.unsubscribeChatEvents(subscriptionId).catch(() => {});
    };
  }, [api, selectedSessionId, selectedWorldId, setStatusText]);

  useEffect(() => () => {
    api.unsubscribeChatEvents('default').catch(() => {});
  }, [api]);

  const onOpenWorkspace = useCallback(async () => {
    try {
      const nextWorkspace = await api.openWorkspace();
      setWorkspace(nextWorkspace);
      if (!nextWorkspace.canceled) {
        await refreshWorlds();
        setStatusText(`Workspace opened: ${nextWorkspace.workspacePath}`, 'success');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to open workspace.'), 'error');
    }
  }, [api, refreshWorlds, setStatusText]);

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
      await refreshWorlds(created.id);
      setStatusText(`World created: ${created.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create world.'), 'error');
    }
  }, [api, creatingWorld, refreshWorlds, setStatusText]);

  const onCreateSession = useCallback(async () => {
    if (!selectedWorldId) {
      setStatusText('Select a world first.', 'error');
      return;
    }

    try {
      const result = await api.createSession(selectedWorldId);
      setSessions(result.sessions || []);
      const nextSessionId = result.currentChatId || result.sessions?.[0]?.id || null;
      setSelectedSessionId(nextSessionId);
      if (nextSessionId) {
        await api.selectSession(selectedWorldId, nextSessionId);
      }
      setStatusText('Chat session created.', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create session.'), 'error');
    }
  }, [api, selectedWorldId, setStatusText]);

  const onSelectSession = useCallback(async (chatId) => {
    if (!selectedWorldId) return;
    try {
      await api.selectSession(selectedWorldId, chatId);
      setSelectedSessionId(chatId);
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to select session.'), 'error');
    }
  }, [api, selectedWorldId, setStatusText]);

  const onSendMessage = useCallback(async (event) => {
    event.preventDefault();
    if (!selectedWorldId || !selectedSessionId) {
      setStatusText('Select a world and session before sending messages.', 'error');
      return;
    }
    const content = composer.trim();
    if (!content) return;

    setLoading((value) => ({ ...value, send: true }));
    try {
      await api.sendMessage({
        worldId: selectedWorldId,
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
  }, [api, composer, selectedSessionId, selectedWorldId, setStatusText]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="flex h-full">
        <aside className="w-80 border-r border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-sm font-semibold tracking-wide text-slate-200">Agent World Desktop</h1>
            <button
              type="button"
              onClick={onOpenWorkspace}
              className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
            >
              Open Folder
            </button>
          </div>

          <div className="mb-4 space-y-2 text-xs">
            <div className="uppercase tracking-wide text-slate-400">Workspace</div>
            <div className="rounded-md border border-slate-700 bg-slate-900 p-2 break-all">
              {workspace.workspacePath || 'No folder selected'}
            </div>
            <div className="uppercase tracking-wide text-slate-500">Storage</div>
            <div className="rounded-md border border-slate-800 bg-slate-950 p-2 break-all text-slate-400">
              {workspace.storagePath || 'N/A'}
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-slate-400">Worlds</div>
            <button
              type="button"
              onClick={() => refreshWorlds(selectedWorldId)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
            >
              {loading.worlds ? '...' : 'Refresh'}
            </button>
          </div>

          <div className="mb-4 max-h-44 space-y-2 overflow-auto pr-1">
            {worlds.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-700 p-3 text-xs text-slate-400">
                No worlds in this workspace.
              </div>
            ) : (
              worlds.map((world) => (
                <button
                  key={world.id}
                  type="button"
                  onClick={() => setSelectedWorldId(world.id)}
                  className={`w-full rounded-md border p-2 text-left text-xs ${
                    selectedWorldId === world.id
                      ? 'border-sky-500 bg-sky-900/30 text-sky-100'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-medium">{world.name}</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    Agents {world.totalAgents} • Messages {world.totalMessages}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-slate-400">Chat Sessions</div>
            <button
              type="button"
              onClick={onCreateSession}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
            >
              New
            </button>
          </div>

          <div className="max-h-56 space-y-2 overflow-auto pr-1">
            {sessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-700 p-3 text-xs text-slate-400">
                {selectedWorldId ? 'No sessions yet.' : 'Select a world to load sessions.'}
              </div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full rounded-md border p-2 text-left text-xs ${
                    selectedSessionId === session.id
                      ? 'border-emerald-500 bg-emerald-900/30 text-emerald-100'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-medium">{session.name}</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {session.messageCount} messages
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col bg-slate-950">
          <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">
                {selectedWorld ? selectedWorld.name : 'No world selected'}
              </div>
              <div className="text-xs text-slate-400">
                {selectedSession ? `${selectedSession.name}` : 'Select a session to start chatting'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen((value) => !value)}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
            >
              {panelOpen ? 'Hide Panel' : 'Show Panel'}
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex-1 space-y-3 overflow-auto p-5">
                {messages.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                    {selectedSession
                      ? 'No messages yet. Send your first message.'
                      : 'Select a session from the left column.'}
                  </div>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={`max-w-3xl rounded-lg border p-3 ${
                        String(message.role).toLowerCase() === 'user'
                          ? 'ml-auto border-sky-700 bg-sky-950/40'
                          : 'border-slate-700 bg-slate-900/70'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{message.sender}</span>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-slate-100">
                        {message.content}
                      </div>
                    </article>
                  ))
                )}
              </div>

              <form onSubmit={onSendMessage} className="border-t border-slate-800 p-4">
                <div className="flex gap-3">
                  <input
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder="Send a message..."
                    className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={loading.send}
                    className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-60"
                  >
                    {loading.send ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </form>
            </section>

            <aside
              className={`border-l border-slate-800 bg-slate-900/80 transition-all duration-300 ${
                panelOpen ? 'w-80 p-4 opacity-100' : 'w-0 p-0 opacity-0'
              }`}
            >
              {panelOpen ? (
                <div className="h-full overflow-auto">
                  <h2 className="mb-3 text-xs uppercase tracking-wide text-slate-400">Context Panel</h2>

                  <div className="mb-5 rounded-md border border-slate-700 bg-slate-900 p-3 text-xs">
                    <div className="mb-2 text-slate-400">Active Context</div>
                    <div className="space-y-1 text-slate-200">
                      <div>Workspace: {workspace.workspacePath || 'N/A'}</div>
                      <div>World: {selectedWorld?.name || 'N/A'}</div>
                      <div>Session: {selectedSession?.name || 'N/A'}</div>
                    </div>
                  </div>

                  <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-400">Create World</h3>
                  <form onSubmit={onCreateWorld} className="space-y-3">
                    <input
                      value={creatingWorld.name}
                      onChange={(event) => setCreatingWorld((value) => ({ ...value, name: event.target.value }))}
                      placeholder="World name"
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                    <textarea
                      value={creatingWorld.description}
                      onChange={(event) => setCreatingWorld((value) => ({ ...value, description: event.target.value }))}
                      placeholder="Description (optional)"
                      className="h-24 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                    <input
                      type="number"
                      min="1"
                      value={creatingWorld.turnLimit}
                      onChange={(event) => setCreatingWorld((value) => ({ ...value, turnLimit: Number(event.target.value) || 1 }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
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
              className={`border-t px-5 py-2 text-xs ${
                status.kind === 'error'
                  ? 'border-rose-700 bg-rose-950/40 text-rose-200'
                  : status.kind === 'success'
                    ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
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
