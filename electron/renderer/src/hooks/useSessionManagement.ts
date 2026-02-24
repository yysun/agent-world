/**
 * useSessionManagement Hook
 * Purpose:
 * - Manage chat session state and CRUD workflows for the renderer.
 *
 * Key Features:
 * - Tracks sessions, selection, search query, and delete-in-progress state.
 * - Exposes sorted/filtered sessions for sidebar rendering.
 * - Handles refresh/create/select/delete flows with status feedback.
 *
 * Implementation Notes:
 * - Keeps behavior parity with previous App.jsx inline callbacks.
 * - Integrates with shared loading/message state via injected setters.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 3 custom hook migration.
 */

import { useCallback, useMemo, useState } from 'react';
import { safeMessage } from '../domain/desktop-api';
import { resolveSelectedSessionId } from '../domain/session-selection';
import { sortSessionsByNewest } from '../utils/data-transform';
import { getRefreshWarning } from '../utils/formatting';

export function useSessionManagement({
  api,
  loadedWorldId,
  setStatusText,
  setMessages,
  setLoading,
  messageRefreshCounter,
}) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const filteredSessions = useMemo(() => {
    const query = String(sessionSearch || '').trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => String(session?.name || '').toLowerCase().includes(query));
  }, [sessions, sessionSearch]);

  const refreshSessions = useCallback(async (worldId: string | null | undefined, preferredSessionId: string | null = null) => {
    if (!worldId) {
      setSessions([]);
      setSelectedSessionId(null);
      setMessages([]);
      return;
    }

    setLoading((value) => ({ ...value, sessions: true }));
    try {
      const nextSessions = sortSessionsByNewest(await api.listSessions(worldId));
      setSessions(nextSessions);
      setSelectedSessionId((currentSelectedSessionId) =>
        resolveSelectedSessionId({
          sessions: nextSessions,
          backendCurrentChatId: preferredSessionId,
          currentSelectedSessionId,
        })
      );
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to load sessions.'), 'error');
    } finally {
      setLoading((value) => ({ ...value, sessions: false }));
    }
  }, [api, setLoading, setMessages, setStatusText]);

  const onCreateSession = useCallback(async () => {
    if (!loadedWorldId) {
      setStatusText('No world loaded. Please open a folder with a world first.', 'error');
      return;
    }

    try {
      const result = await api.createSession(loadedWorldId);
      const createWarning = getRefreshWarning(result);
      const nextSessions = sortSessionsByNewest(result.sessions || []);
      setSessions(nextSessions);
      const nextSessionId = result.currentChatId || nextSessions[0]?.id || null;
      setSelectedSessionId(nextSessionId);
      let selectWarning = '';
      if (nextSessionId) {
        const selectResult = await api.selectSession(loadedWorldId, nextSessionId);
        selectWarning = getRefreshWarning(selectResult);
      }
      const warning = [...new Set([createWarning, selectWarning].filter(Boolean))].join(' ');
      setStatusText(
        warning ? `Chat session created. ${warning}` : 'Chat session created.',
        warning ? 'error' : 'success'
      );
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create session.'), 'error');
    }
  }, [api, loadedWorldId, setStatusText]);

  const onSelectSession = useCallback(async (chatId) => {
    if (!loadedWorldId) return;
    const previousSessionId = selectedSessionId;
    messageRefreshCounter.current += 1;
    setSelectedSessionId(chatId);
    try {
      const result = await api.selectSession(loadedWorldId, chatId);
      const warning = getRefreshWarning(result);
      if (warning) {
        setStatusText(`Session selected. ${warning}`, 'error');
      }
    } catch (error) {
      setSelectedSessionId(previousSessionId);
      setStatusText(safeMessage(error, 'Failed to select session.'), 'error');
    }
  }, [api, loadedWorldId, messageRefreshCounter, selectedSessionId, setMessages, setStatusText]);

  const onDeleteSession = useCallback(async (chatId, event) => {
    event.stopPropagation();

    if (!loadedWorldId) return;
    const session = sessions.find((item) => item.id === chatId);
    const sessionName = session?.name || 'this session';
    if (!window.confirm(`Delete chat session "${sessionName}"?`)) return;

    setDeletingSessionId(chatId);
    try {
      const result = await api.deleteChat(loadedWorldId, chatId);
      const warning = getRefreshWarning(result);
      const nextSessions = sortSessionsByNewest(result.sessions || []);
      setSessions(nextSessions);
      const nextSessionId = result.currentChatId || nextSessions[0]?.id || null;
      setSelectedSessionId(nextSessionId);
      setStatusText(
        warning ? `Chat session deleted. ${warning}` : 'Chat session deleted.',
        warning ? 'error' : 'success'
      );
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to delete session.'), 'error');
    } finally {
      setDeletingSessionId(null);
    }
  }, [api, loadedWorldId, sessions, setStatusText]);

  return {
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
  };
}
