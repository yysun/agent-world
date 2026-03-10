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
 * - 2026-03-07: Accept messageRefreshCounter ref and increment it in onSaveEditMessage before
 *   api.editMessage to invalidate any concurrent in-flight refreshMessages call triggered by
 *   a prior chat switch, preventing the resolved history from overwriting streaming messages (AD-8).
 * - 2026-02-27: Updated submit stop-mode detection to also follow status-registry `working` state so stop remains available when pending markers are absent.
 * - 2026-02-26: Replaced edit-backup localStorage warning console traces with categorized renderer logger output controlled by env-derived log config.
 * - 2026-02-26: Set chat-scoped sending state during edit-save submission so the inline working indicator appears immediately (web parity) and clears in `finally`.
 * - 2026-02-26: Clear chat-scoped transient error/log artifacts when saving user edits so stale failure indicators do not persist into retried turns.
 * - 2026-02-22: Removed renderer-side no-agent inference on send; status now follows core-emitted activity events only.
 * - 2026-02-22: Enforced strict pending semantics: `pendingResponseSessionIds` is now populated only from realtime agent-start signals, never on send.
 * - 2026-02-21: Added assistant-message raw-markdown copy action with clipboard API + legacy fallback.
 * - 2026-02-20: Blocked composer sends while HITL prompt queue is non-empty to enforce resolve-first workflow.
 * - 2026-02-20: Added defensive renderer-side chatId invariant before IPC send so UI fails fast when session context is missing.
 * - 2026-02-20: Added optimistic user-message insertion and reconciliation aligned with web message timing behavior.
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 3 custom hook migration.
 */

import { useCallback, useState } from 'react';
import { safeMessage } from '../domain/desktop-api';
import { computeCanStopCurrentSession } from '../domain/chat-stop-state';
import { clearChatAgents, getChatStatus, getRegistry, updateRegistry } from '../domain/status-registry';
import { normalizeStringList, sortSessionsByNewest } from '../utils/data-transform';
import { getRefreshWarning } from '../utils/formatting';
import { getMessageIdentity, isTrueAgentResponseMessage } from '../utils/message-utils';
import {
  clearChatTransientErrors,
  createOptimisticUserMessage,
  reconcileOptimisticUserMessage,
  removeOptimisticUserMessage,
  trimChatMessagesFromCutoff,
  upsertMessageList,
} from '../domain/message-updates';
import { rendererLogger } from '../utils/logger';

export function useMessageManagement({
  api,
  loadedWorldId,
  selectedSessionId,
  selectedSessionIdRef,
  systemSettings,
  messages,
  messagesById,
  refreshMessages,
  setMessages,
  setSessions,
  setSelectedSessionId,
  setStatusText,
  streamingStateRef,
  hasActiveHitlPrompt = false,
  setHitlPromptQueue,
  setSubmittingHitlRequestId,
  messageRefreshCounter,
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
    if (hasActiveHitlPrompt) {
      setStatusText('Resolve the pending HITL prompt before sending a new message.', 'info');
      return;
    }

    const activeSessionId = String(selectedSessionId || '').trim() || null;
    if (activeSessionId && sendingSessionIds.has(activeSessionId)) return;
    if (!loadedWorldId || !activeSessionId) {
      setStatusText('Select a session before sending messages.', 'error');
      return;
    }

    const content = composer.trim();
    if (!content) return;

    setPendingResponseSessionIds((prev) => {
      const next = new Set(prev);
      next.delete(activeSessionId);
      return next;
    });
    setSendingSessionIds((prev) => new Set([...prev, activeSessionId]));
    setComposer('');
    try {
      if (!activeSessionId || !String(activeSessionId).trim()) {
        throw new Error('Chat ID is required before sending a message.');
      }

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
  }, [api, composer, hasActiveHitlPrompt, loadedWorldId, selectedSessionId, sendingSessionIds, setMessages, setStatusText, systemSettings]);

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
        updateRegistry(r => clearChatAgents(r, loadedWorldId, selectedSessionId));
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
    api,
    loadedWorldId,
    selectedSessionId,
    setStatusText,
    stoppingSessionIds,
    streamingStateRef,
  ]);

  const onSubmitMessage = useCallback((event) => {
    event.preventDefault();
    const isCurrentSessionSending = Boolean(selectedSessionId && sendingSessionIds.has(selectedSessionId));
    const isCurrentSessionStopping = Boolean(selectedSessionId && stoppingSessionIds.has(selectedSessionId));
    const isCurrentSessionPendingResponse = Boolean(selectedSessionId && pendingResponseSessionIds.has(selectedSessionId));
    const isCurrentSessionWorking = Boolean(
      loadedWorldId
      && selectedSessionId
      && getChatStatus(getRegistry(), loadedWorldId, selectedSessionId) === 'working'
    );
    const canStopCurrentSession = computeCanStopCurrentSession({
      selectedSessionId,
      isCurrentSessionSending,
      isCurrentSessionStopping,
      isCurrentSessionPendingResponse,
      isCurrentSessionWorking,
    });

    if (canStopCurrentSession) {
      onStopMessage();
      return;
    }
    onSendMessage();
  }, [
    loadedWorldId,
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
      rendererLogger.warn('electron.renderer.message-edit', 'Failed to save edit backup', {
        error: safeMessage(error, 'unknown')
      });
    }

    // Stop any active streaming before trimming so stale SSE chunk/update callbacks
    // cannot re-insert the messages we are about to remove from the list.
    if (streamingStateRef.current) {
      streamingStateRef.current.cleanup();
    }
    // Reset registry so the working indicator clears before the new SSE flow begins.
    updateRegistry(r => clearChatAgents(r, loadedWorldId, targetChatId));

    const optimisticEditedMessage = createOptimisticUserMessage({
      chatId: targetChatId,
      content: editedText,
      sender: 'human',
    });
    const optimisticEditedMessageId = String(optimisticEditedMessage.messageId || '').trim();

    // Trim to before the edited message and insert the optimistic replacement in a
    // single functional update so the UI never shows a gap where no user message exists.
    setMessages((existing) => {
      const trimmed = trimChatMessagesFromCutoff(existing, String(message.messageId || ''), targetChatId);
      const clearedTransientErrors = clearChatTransientErrors(trimmed, targetChatId);
      return upsertMessageList(clearedTransientErrors, optimisticEditedMessage);
    });
    setEditingMessageId(null);
    setEditingText('');
    setHitlPromptQueue?.([]);
    setSubmittingHitlRequestId?.(null);
    setPendingResponseSessionIds((prev) => {
      const next = new Set(prev);
      next.delete(targetChatId);
      return next;
    });
    setSendingSessionIds((prev) => new Set([...prev, targetChatId]));

    // Invalidate any in-flight refreshMessages triggered by a prior chat switch.
    // Without this, a concurrent refreshMessages resolving after the edit starts will
    // call setMessages(history) and overwrite the streaming agent response (AD-8).
    if (messageRefreshCounter) {
      messageRefreshCounter.current += 1;
    }

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
        setMessages((existing) => removeOptimisticUserMessage(existing, optimisticEditedMessageId));
        // Only refresh if the user is still on the edited chat; if they switched away
        // the chat will be refreshed when they return (AD-3, AD-7).
        if (selectedSessionIdRef?.current === targetChatId) {
          await refreshMessages(loadedWorldId, targetChatId);
        }
        return;
      }

      try {
        localStorage.removeItem('agent-world-desktop-edit-backup');
      } catch (error) {
        rendererLogger.warn('electron.renderer.message-edit', 'Failed to clear edit backup', {
          error: safeMessage(error, 'unknown')
        });
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
      setMessages((existing) => removeOptimisticUserMessage(existing, optimisticEditedMessageId));
      // Only refresh if the user is still on the edited chat; if they switched away
      // the chat will be refreshed when they return (AD-3, AD-7).
      if (selectedSessionIdRef?.current === targetChatId) {
        await refreshMessages(loadedWorldId, targetChatId);
      }
    } finally {
      setSendingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(targetChatId);
        return next;
      });
    }
  }, [
    api,
    editingText,
    loadedWorldId,
    messageRefreshCounter,
    refreshMessages,
    resolveMessageTargetChatId,
    selectedSessionIdRef,
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

      // Only refresh if the user is still on the deleted chat; if they switched away
      // the chat will be refreshed when they return (AD-3, AD-7).
      if (selectedSessionIdRef?.current === targetChatId) {
        await refreshMessages(loadedWorldId, targetChatId);
      }
      setStatusText('Message deleted successfully', 'success');
    } catch (error) {
      setStatusText(error.message || 'Failed to delete message', 'error');
    } finally {
      setDeletingMessageId(null);
    }
  }, [api, loadedWorldId, refreshMessages, resolveMessageTargetChatId, selectedSessionIdRef, setStatusText]);

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

  const onCopyRawMarkdownFromMessage = useCallback(async (message) => {
    const messageContent = message?.content;
    const rawMarkdown = typeof messageContent === 'string'
      ? messageContent
      : String(messageContent ?? '');

    if (!rawMarkdown) {
      setStatusText('Cannot copy: message content is empty.', 'error');
      return;
    }

    const fallbackCopy = () => {
      if (typeof document === 'undefined' || !document.body) return false;
      const textarea = document.createElement('textarea');
      textarea.value = rawMarkdown;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    };

    try {
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(rawMarkdown);
      } else if (!fallbackCopy()) {
        throw new Error('Clipboard API unavailable.');
      }
      setStatusText('Copied raw markdown.', 'success');
    } catch (error) {
      if (fallbackCopy()) {
        setStatusText('Copied raw markdown.', 'success');
        return;
      }
      setStatusText(safeMessage(error, 'Failed to copy raw markdown.'), 'error');
    }
  }, [setStatusText]);

  // Clears only edit/delete-local UI state on chat switch (AD-3).
  // Does NOT touch sendingSessionIds/stoppingSessionIds/pendingResponseSessionIds
  // to avoid disrupting concurrent per-chat send/stop state.
  const clearEditDeleteState = useCallback(() => {
    setEditingMessageId(null);
    setEditingText('');
    setDeletingMessageId(null);
  }, []);

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
    onCopyRawMarkdownFromMessage,
    clearEditDeleteState,
    resetMessageRuntimeState,
  };
}
