/**
 * useMessageQueue Hook
 *
 * Purpose:
 * - Load and manage the user message queue for the selected chat.
 * - Bind add/remove/pause/resume/stop/clear actions to IPC.
 * - Refresh queue state after user actions and when messages change.
 *
 * Key Features:
 * - Clears queue display on session switch.
 * - Reloads queue when messages change (detects when queued items are consumed).
 * - Exposes all queue control actions bound to the active world+chat context.
 *
 * Implementation Notes:
 * - Processing loops are NOT in the renderer; core drives queue advancement.
 * - This hook is purely display + control via IPC.
 */

import { useCallback, useEffect, useState } from 'react';

export interface QueuedMessageEntry {
  id: number;
  worldId: string;
  chatId: string;
  messageId: string;
  content: string;
  sender: string;
  status: 'queued' | 'sending' | 'error' | 'cancelled';
  retryCount: number;
  createdAt: string;
}

export function useMessageQueue({
  api,
  loadedWorldId,
  selectedSessionId,
  messagesVersion,
}: {
  api: any;
  loadedWorldId: string | null | undefined;
  selectedSessionId: string | null | undefined;
  messagesVersion?: number;
}) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessageEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadQueue = useCallback(async () => {
    const worldId = String(loadedWorldId || '').trim();
    const chatId = String(selectedSessionId || '').trim();
    if (!worldId || !chatId || !api?.getQueuedMessages) return;
    setIsLoading(true);
    try {
      const result = await api.getQueuedMessages(worldId, chatId);
      setQueuedMessages(Array.isArray(result) ? result : []);
    } catch {
      // Silently ignore - queue may not be initialized
    } finally {
      setIsLoading(false);
    }
  }, [api, loadedWorldId, selectedSessionId]);

  // Reset and reload when session/world changes
  useEffect(() => {
    setQueuedMessages([]);
    void loadQueue();
  }, [loadedWorldId, selectedSessionId, loadQueue]);

  // Reload when messages change (queue items get consumed)
  useEffect(() => {
    if (messagesVersion === undefined) return;
    void loadQueue();
  }, [messagesVersion, loadQueue]);

  const addToQueue = useCallback(async (content: string, sender?: string) => {
    const worldId = String(loadedWorldId || '').trim();
    const chatId = String(selectedSessionId || '').trim();
    if (!worldId || !chatId || !content.trim() || !api?.addToQueue) return;
    await api.addToQueue(worldId, chatId, content, sender);
    await loadQueue();
  }, [api, loadedWorldId, selectedSessionId, loadQueue]);

  const removeFromQueue = useCallback(async (messageId: string) => {
    const worldId = String(loadedWorldId || '').trim();
    if (!worldId || !messageId || !api?.removeFromQueue) return;
    await api.removeFromQueue(worldId, messageId);
    await loadQueue();
  }, [api, loadedWorldId, loadQueue]);

  const pauseQueue = useCallback(async () => {
    const worldId = String(loadedWorldId || '').trim();
    const chatId = String(selectedSessionId || '').trim();
    if (!worldId || !chatId || !api?.pauseChatQueue) return;
    await api.pauseChatQueue(worldId, chatId);
  }, [api, loadedWorldId, selectedSessionId]);

  const resumeQueue = useCallback(async () => {
    const worldId = String(loadedWorldId || '').trim();
    const chatId = String(selectedSessionId || '').trim();
    if (!worldId || !chatId || !api?.resumeChatQueue) return;
    await api.resumeChatQueue(worldId, chatId);
  }, [api, loadedWorldId, selectedSessionId]);

  const stopQueue = useCallback(async () => {
    const worldId = String(loadedWorldId || '').trim();
    const chatId = String(selectedSessionId || '').trim();
    if (!worldId || !chatId || !api?.stopChatQueue) return;
    await api.stopChatQueue(worldId, chatId);
    await loadQueue();
  }, [api, loadedWorldId, selectedSessionId, loadQueue]);

  const clearQueue = useCallback(async () => {
    const worldId = String(loadedWorldId || '').trim();
    const chatId = String(selectedSessionId || '').trim();
    if (!worldId || !chatId || !api?.clearQueue) return;
    await api.clearQueue(worldId, chatId);
    setQueuedMessages([]);
  }, [api, loadedWorldId, selectedSessionId]);

  const retryQueueMessage = useCallback(async (messageId: string) => {
    const worldId = String(loadedWorldId || '').trim();
    const chatId = String(selectedSessionId || '').trim();
    if (!worldId || !chatId || !messageId || !api?.retryQueueMessage) return;
    await api.retryQueueMessage(worldId, messageId, chatId);
    await loadQueue();
  }, [api, loadedWorldId, selectedSessionId, loadQueue]);

  const activeQueueItems = queuedMessages.filter((m) => m.status !== 'cancelled');

  return {
    queuedMessages: activeQueueItems,
    isLoading,
    addToQueue,
    removeFromQueue,
    pauseQueue,
    resumeQueue,
    stopQueue,
    clearQueue,
    retryQueueMessage,
    refreshQueue: loadQueue,
  };
}
