/**
 * useChatData Hook - Chat management and real-time messaging
 * 
 * Purpose: Manage chats, send messages, and subscribe to real-time events
 * 
 * Features:
 * - List chats for world
 * - Create/delete chats
 * - Send messages with connection check
 * - Subscribe to chat events
 * - Real-time message updates
 * - Auto-subscribe/unsubscribe
 * 
 * Usage:
 * ```tsx
 * function ChatBox({ worldId, chatId }: { worldId: string; chatId: string }) {
 *   const { messages, sendMessage, loading } = useChatData(worldId, chatId);
 *   
 *   const handleSend = async (content: string) => {
 *     await sendMessage(content);
 *   };
 *   
 *   return (
 *     <div>
 *       {messages.map(msg => <div key={msg.id}>{msg.content}</div>)}
 *       <input onSubmit={handleSend} />
 *     </div>
 *   );
 * }
 * ```
 * 
 * Changes:
 * - 2025-11-03: Initial hook implementation with connection state checking
 */

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import type { Chat, Message, UseChatDataReturn, AgentEvent } from '@/types';

export function useChatData(worldId: string, chatId?: string): UseChatDataReturn {
  const { client, state } = useWebSocket();
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch chats
  const fetchChats = useCallback(async () => {
    if (!client || state !== 'connected' || !worldId) return;

    try {
      const data = await client.sendCommand(worldId, 'list-chats');
      setChats(data || []);
    } catch (err) {
      console.error('Failed to fetch chats:', err);
    }
  }, [client, state, worldId]);

  // Subscribe to events
  const subscribeToChat = useCallback(
    async (targetChatId?: string) => {
      if (!client || state !== 'connected' || !worldId) return;

      try {
        await client.subscribe(worldId, targetChatId || chatId || null);

        // Listen for events
        const handleEvent = (event: any) => {
          if (event.worldId !== worldId) return;
          if (targetChatId && event.chatId !== targetChatId) return;
          if (chatId && event.chatId !== chatId) return;

          const agentEvent = event as AgentEvent;

          // Convert events to messages
          if (agentEvent.payload) {
            const newMessage: Message = {
              id: agentEvent.id,
              content: agentEvent.payload.content || JSON.stringify(agentEvent.payload),
              sender: agentEvent.payload.sender || agentEvent.payload.agent || 'system',
              timestamp: agentEvent.createdAt,
              chatId: agentEvent.chatId,
              worldId: agentEvent.worldId
            };

            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        };

        client.on('event', handleEvent);
      } catch (err) {
        console.error('Failed to subscribe:', err);
        setError(err as Error);
      }
    },
    [client, state, worldId, chatId]
  );

  // Unsubscribe from events
  const unsubscribeFromChat = useCallback(async () => {
    if (!client || !worldId) return;

    try {
      await client.unsubscribe(worldId, chatId || null);
    } catch (err) {
      console.error('Failed to unsubscribe:', err);
    }
  }, [client, worldId, chatId]);

  // Auto-fetch and subscribe
  useEffect(() => {
    if (state === 'connected' && worldId) {
      setLoading(true);
      fetchChats().finally(() => setLoading(false));
      subscribeToChat();
    }

    return () => {
      unsubscribeFromChat();
    };
  }, [state, worldId, chatId]);

  const sendMessage = useCallback(
    async (content: string, sender: string = 'human'): Promise<void> => {
      if (!client) throw new Error('Client not connected');
      if (state !== 'connected') throw new Error('Cannot send while disconnected');

      await client.sendMessage(worldId, content, chatId, sender);
    },
    [client, state, worldId, chatId]
  );

  const createChat = useCallback(
    async (): Promise<Chat> => {
      if (!client) throw new Error('Client not connected');

      const chat = await client.sendCommand(worldId, 'new-chat');
      await fetchChats(); // Refresh list
      return chat;
    },
    [client, worldId, fetchChats]
  );

  const deleteChat = useCallback(
    async (targetChatId: string): Promise<void> => {
      if (!client) throw new Error('Client not connected');

      await client.sendCommand(worldId, 'delete-chat', { chatId: targetChatId });
      await fetchChats(); // Refresh list
    },
    [client, worldId, fetchChats]
  );

  return {
    chats,
    messages,
    loading,
    error,
    sendMessage,
    createChat,
    deleteChat,
    subscribeToChat,
    unsubscribeFromChat
  };
}
