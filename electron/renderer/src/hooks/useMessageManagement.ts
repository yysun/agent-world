/**
 * useMessageManagement Hook
 * Purpose:
 * - Manage composer state and message mutation workflows for the renderer chat surface.
 *
 * Key Features:
 * - Tracks per-session send/stop/pending-response state for concurrent chat handling.
 * - Encapsulates send/stop/edit/delete/branch callbacks with status feedback.
 * - Exposes edit/delete UI state and submit helpers used by the composer and message list.
 *
 * Implementation Notes:
 * - Preserves prior `App.jsx` behavior, including optimistic edit updates and backup persistence.
 * - Keeps branch/session refresh semantics aligned with the existing desktop IPC flows.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 3 custom hook migration.
 */

import { useCallback, useState } from 'react';
import { safeMessage } from '../domain/desktop-api';
import { normalizeStringList, sortSessionsByNewest } from '../utils/data-transform';
import { getRefreshWarning } from '../utils/formatting';
import { getMessageIdentity, isTrueAgentResponseMessage } from '../utils/message-utils';

export function useMessageManagement({
  api,
  loadedWorldId,
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
}) {
  const [composer, setComposer] = useState('');
  const [sendingSessionIds, setSendingSessionIds] = useState<Set<string>>(new Set());
  const [stoppingSessionIds, setStoppingSessionIds] = useState<Set<string>>(new Set());
  const [pendingResponseSessionIds, setPendingResponseSessionIds] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);

  const resolveMessageTargetChatId = useCallback((message) => {
    const directChatId = String(message?.chatId || '').trim();
    if (directChatId) {
      return directChatId;
    }

    const messageId = String(message?.messageId || '').trim();
    if (!messageId) {
      return null;
    }

    const indexedMessage = messagesById.get(messageId);
    const indexedChatId = String(indexedMessage?.chatId || '').trim();
    return indexedChatId || null;
  }, [messagesById]);

  const onSendMessage = useCallback(async () => {
    const activeSessionId = String(selectedSessionId || '').trim() || null;
    if (activeSessionId && sendingSessionIds.has(activeSessionId)) return;
    if (!loadedWorldId || !activeSessionId) {
      setStatusText('Select a session before sending messages.', 'error');
      return;
    }

    const content = composer.trim();
    if (!content) return;

    setPendingResponseSessionIds((prev) => new Set([...prev, activeSessionId]));
    setSendingSessionIds((prev) => new Set([...prev, activeSessionId]));
    try {
      await api.sendMessage({
        worldId: loadedWorldId,
        chatId: activeSessionId,
        content,
        sender: 'human',
        systemSettings: {
          enableGlobalSkills: systemSettings.enableGlobalSkills !== false,
          enableProjectSkills: systemSettings.enableProjectSkills !== false,
          disabledGlobalSkillIds: normalizeStringList(systemSettings.disabledGlobalSkillIds),
          disabledProjectSkillIds: normalizeStringList(systemSettings.disabledProjectSkillIds),
        }
      });
      setComposer('');
    } catch (error) {
      setPendingResponseSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(activeSessionId);
        return next;
      });
      setStatusText(safeMessage(error, 'Failed to send message.'), 'error');
    } finally {
      setSendingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(activeSessionId);
        return next;
      });
    }
  }, [api, composer, loadedWorldId, selectedSessionId, sendingSessionIds, setStatusText, systemSettings]);

  const onStopMessage = useCallback(async () => {
    if (!loadedWorldId || !selectedSessionId) {
      setStatusText('Select a session before stopping messages.', 'error');
      return;
    }
    if (stoppingSessionIds.has(selectedSessionId)) return;

    setStoppingSessionIds((prev) => new Set([...prev, selectedSessionId]));
    try {
      const result = await api.stopMessage(loadedWorldId, selectedSessionId);
      const stopped = Boolean(result?.stopped);
      const reason = String(result?.reason || '').trim();

      setPendingResponseSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedSessionId);
        return next;
      });

      if (stopped) {
        if (streamingStateRef.current) {
          streamingStateRef.current.cleanup();
        }
        if (activityStateRef.current) {
          activityStateRef.current.cleanup();
        }
        setActiveStreamCount(0);
        setActiveTools([]);
        setIsBusy(false);
        setSessionActivity({
          eventType: 'idle',
          pendingOperations: 0,
          activityId: 0,
          source: null,
          activeSources: []
        });
      }

      if (stopped) {
        setStatusText('Stopped message processing.', 'success');
      } else if (reason === 'no-active-process') {
        setStatusText('No active message process to stop.', 'info');
      } else {
        setStatusText('Stop request completed.', 'info');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to stop message processing.'), 'error');
    } finally {
      setStoppingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedSessionId);
        return next;
      });
    }
  }, [
    activityStateRef,
    api,
    loadedWorldId,
    selectedSessionId,
    setActiveStreamCount,
    setActiveTools,
    setIsBusy,
    setSessionActivity,
    setStatusText,
    stoppingSessionIds,
    streamingStateRef,
  ]);

  const onSubmitMessage = useCallback((event) => {
    event.preventDefault();
    const isCurrentSessionSending = selectedSessionId && sendingSessionIds.has(selectedSessionId);
    const isCurrentSessionStopping = selectedSessionId && stoppingSessionIds.has(selectedSessionId);
    const isCurrentSessionPendingResponse = selectedSessionId && pendingResponseSessionIds.has(selectedSessionId);
    const canStopCurrentSession = Boolean(selectedSessionId)
      && !isCurrentSessionSending
      && !isCurrentSessionStopping
      && Boolean(isCurrentSessionPendingResponse);

    if (canStopCurrentSession) {
      onStopMessage();
      return;
    }
    onSendMessage();
  }, [
    onSendMessage,
    onStopMessage,
    pendingResponseSessionIds,
    selectedSessionId,
    sendingSessionIds,
    stoppingSessionIds,
  ]);

  const onStartEditMessage = useCallback((message) => {
    const messageIdentity = getMessageIdentity(message);
    if (!messageIdentity) return;
    setEditingMessageId(messageIdentity);
    setEditingText(message?.content || '');
  }, []);

  const onCancelEditMessage = useCallback(() => {
    setEditingMessageId(null);
    setEditingText('');
  }, []);

  const onSaveEditMessage = useCallback(async (message) => {
    const editedText = editingText.trim();
    if (!editedText) {
      setStatusText('Message cannot be empty', 'error');
      return;
    }

    const currentText = String(message?.content || '').trim();
    if (editedText === currentText) {
      return;
    }

    if (!message.messageId) {
      setStatusText('Cannot edit: message not saved yet', 'error');
      return;
    }

    const targetChatId = resolveMessageTargetChatId(message);
    if (!targetChatId) {
      setStatusText('Cannot edit: message is not bound to a chat session', 'error');
      return;
    }

    if (!loadedWorldId) {
      setStatusText('Cannot edit: no world loaded', 'error');
      return;
    }

    const backup = {
      messageId: message.messageId,
      chatId: targetChatId,
      newContent: editedText,
      timestamp: Date.now(),
      worldId: loadedWorldId
    };
    try {
      localStorage.setItem('agent-world-desktop-edit-backup', JSON.stringify(backup));
    } catch (error) {
      console.warn('Failed to save edit backup:', error);
    }

    const targetIdentity = getMessageIdentity(message);
    const editedIndex = messages.findIndex((entry) => getMessageIdentity(entry) === targetIdentity);
    const optimisticMessages = editedIndex >= 0 ? messages.slice(0, editedIndex) : messages;
    setMessages(optimisticMessages);
    setEditingMessageId(null);
    setEditingText('');

    try {
      const editResult = await api.editMessage(loadedWorldId, message.messageId, editedText, targetChatId);

      if (!editResult.success) {
        const failedAgents = editResult.failedAgents || [];
        if (failedAgents.length > 0) {
          const errors = failedAgents.map((failure) => `${failure.agentId}: ${failure.error}`).join(', ');
          throw new Error(`Edit failed for some agents: ${errors}`);
        }
        throw new Error('Failed to edit message');
      }

      if (editResult.resubmissionStatus !== 'success') {
        const details = String(editResult.resubmissionError || editResult.resubmissionStatus || 'unknown');
        setStatusText(
          `Messages removed but resubmission failed: ${details}. Please try editing again.`,
          'error'
        );
        await refreshMessages(loadedWorldId, targetChatId);
        return;
      }

      try {
        localStorage.removeItem('agent-world-desktop-edit-backup');
      } catch (error) {
        console.warn('Failed to clear edit backup:', error);
      }

      setStatusText('Message edited successfully', 'success');
    } catch (error) {
      let errorMessage = error.message || 'Failed to edit message';

      if (error.message?.includes('423')) {
        errorMessage = 'Cannot edit: world is processing. Please try again in a moment.';
      } else if (error.message?.includes('404')) {
        errorMessage = 'Message not found. It may have been already deleted.';
      } else if (error.message?.includes('400')) {
        errorMessage = 'Invalid message: only user messages can be edited.';
      }

      setStatusText(errorMessage, 'error');
      await refreshMessages(loadedWorldId, targetChatId);
    }
  }, [
    api,
    editingText,
    loadedWorldId,
    messages,
    refreshMessages,
    resolveMessageTargetChatId,
    setMessages,
    setStatusText,
  ]);

  const onDeleteMessage = useCallback(async (message) => {
    const targetChatId = resolveMessageTargetChatId(message);
    if (!message.messageId || !targetChatId) return;

    const preview = (message.content || '').substring(0, 100);
    const previewText = preview.length < (message.content || '').length ? `${preview}...` : preview;
    const confirmed = window.confirm(
      `Delete this message and all responses after it?\n\n"${previewText}"`
    );
    if (!confirmed) return;

    const targetIdentity = getMessageIdentity(message);
    setDeletingMessageId(targetIdentity);
    try {
      const deleteResult = await api.deleteMessage(loadedWorldId, message.messageId, targetChatId);

      if (!deleteResult.success) {
        const failedAgents = deleteResult.failedAgents || [];
        if (failedAgents.length > 0 && failedAgents.length < deleteResult.totalAgents) {
          const errors = failedAgents.map((failure) => failure.agentId).join(', ');
          setStatusText(`Partial failure - failed for agents: ${errors}`, 'error');
        } else {
          throw new Error(deleteResult.error || 'Failed to delete message');
        }
      }

      await refreshMessages(loadedWorldId, targetChatId);
      setStatusText('Message deleted successfully', 'success');
    } catch (error) {
      setStatusText(error.message || 'Failed to delete message', 'error');
    } finally {
      setDeletingMessageId(null);
    }
  }, [api, loadedWorldId, refreshMessages, resolveMessageTargetChatId, setStatusText]);

  const onBranchFromMessage = useCallback(async (message) => {
    const worldId = String(loadedWorldId || '').trim();
    if (!worldId) {
      setStatusText('Cannot branch: no world loaded.', 'error');
      return;
    }

    const targetChatId = resolveMessageTargetChatId(message);
    const targetMessageId = String(message?.messageId || '').trim();
    const isBranchable = isTrueAgentResponseMessage(message);

    if (!targetChatId || !targetMessageId) {
      setStatusText('Cannot branch: message is not bound to a chat session.', 'error');
      return;
    }

    if (!isBranchable) {
      setStatusText('Branch is only available for agent messages.', 'error');
      return;
    }

    try {
      const branchResult = await api.branchSessionFromMessage(worldId, targetChatId, targetMessageId);
      const branchWarning = getRefreshWarning(branchResult);
      const nextSessions = sortSessionsByNewest(branchResult?.sessions || []);
      const nextSessionId = String(branchResult?.currentChatId || '').trim() || nextSessions[0]?.id || null;

      setSessions(nextSessions);

      let selectWarning = '';
      if (nextSessionId) {
        const selectResult = await api.selectSession(worldId, nextSessionId);
        selectWarning = getRefreshWarning(selectResult);
        setSelectedSessionId(nextSessionId);
      }

      const warning = [...new Set([branchWarning, selectWarning].filter(Boolean))].join(' ');
      setStatusText(
        warning ? `Branched chat created. ${warning}` : 'Branched chat created.',
        warning ? 'error' : 'success'
      );
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to branch chat from message.'), 'error');
    }
  }, [api, loadedWorldId, resolveMessageTargetChatId, setSelectedSessionId, setSessions, setStatusText]);

  const resetMessageRuntimeState = useCallback(() => {
    setSendingSessionIds(new Set());
    setStoppingSessionIds(new Set());
    setPendingResponseSessionIds(new Set());
    setEditingMessageId(null);
    setEditingText('');
    setDeletingMessageId(null);
  }, []);

  return {
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
  };
}
