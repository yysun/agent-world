/**
 * useChatData Hook - Chat management and real-time messaging
 * 
 * Purpose: Manage chats, send messages via REST API and SSE
 * 
 * Features:
 * - List chats for world
 * - Create/delete chats
 * - Send messages with SSE streaming
 * - Real-time message updates via callbacks
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
 * - 2025-11-12: Updated to use REST API and SSE instead of WebSocket
 * - 2025-11-03: Initial hook implementation with connection state checking
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import { sendChatMessage } from '@/lib/sse-client';
import type { Chat, Message, UseChatDataReturn } from '@/types';

export function useChatData(worldId: string, chatId?: string): UseChatDataReturn {
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sseCleanup, setSseCleanup] = useState<(() => void) | null>(null);

  // Fetch chats
  const fetchChats = useCallback(async () => {
    if (!worldId) return;

    try {
      const worldData = await api.getWorld(worldId);
      setChats(worldData?.chats || []);
    } catch (err) {
      console.error('Failed to fetch chats:', err);
      setError(err as Error);
    }
  }, [worldId]);

  // Auto-fetch chats
  useEffect(() => {
    if (worldId) {
      setLoading(true);
      fetchChats().finally(() => setLoading(false));
    }
  }, [worldId, fetchChats]);

  // Cleanup SSE connection on unmount
  useEffect(() => {
    return () => {
      if (sseCleanup) {
        sseCleanup();
      }
    };
  }, [sseCleanup]);

  const sendMessage = useCallback(
    async (content: string, sender: string = 'human'): Promise<void> => {
      if (!worldId) throw new Error('World ID is required');

      // Cleanup any existing SSE connection
      if (sseCleanup) {
        sseCleanup();
      }

      // Send message via SSE
      const cleanup = await sendChatMessage(worldId, content, sender, {
        onStreamStart: (data) => {
          // Add placeholder message for streaming
          const newMessage: Message = {
            id: data.messageId,
            content: '...',
            sender: data.sender,
            timestamp: new Date().toISOString(),
            chatId,
            worldId
          };
          setMessages(prev => [...prev, newMessage]);
        },
        onStreamChunk: (data) => {
          // Update streaming message
          setMessages(prev => prev.map(msg =>
            msg.id === data.messageId
              ? { ...msg, content: data.content }
              : msg
          ));
        },
        onStreamEnd: (data) => {
          // Finalize message
          setMessages(prev => prev.map(msg =>
            msg.id === data.messageId
              ? { ...msg, content: data.content }
              : msg
          ));
        },
        onStreamError: (data) => {
          // Show error in message
          setMessages(prev => prev.map(msg =>
            msg.id === data.messageId
              ? { ...msg, content: `Error: ${data.error}` }
              : msg
          ));
        },
        onMessage: (data) => {
          // Handle non-streaming messages
          if (data.messageId) {
            const newMessage: Message = {
              id: data.messageId,
              content: data.content || data.message || '',
              sender: data.sender || data.agentName || 'system',
              timestamp: data.createdAt || new Date().toISOString(),
              chatId: chatId,
              worldId: worldId
            };
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        },
        onError: (err) => {
          console.error('SSE error:', err);
          setError(err);
        }
      });

      setSseCleanup(() => cleanup);
    },
    [worldId, chatId, sseCleanup]
  );

  const createChat = useCallback(
    async (): Promise<Chat> => {
      const result = await api.newChat(worldId);
      await fetchChats(); // Refresh list

      // Return chat object
      return {
        id: result.chatId,
        name: 'New Chat',
        createdAt: new Date().toISOString()
      };
    },
    [worldId, fetchChats]
  );

  const deleteChat = useCallback(
    async (targetChatId: string): Promise<void> => {
      await api.deleteChat(worldId, targetChatId);
      await fetchChats(); // Refresh list
    },
    [worldId, fetchChats]
  );

  // Dummy implementation for compatibility
  const subscribeToChat = useCallback(
    async (_targetChatId?: string) => {
      // No-op for API-based implementation
    },
    []
  );

  const unsubscribeFromChat = useCallback(async () => {
    // Cleanup SSE connection
    if (sseCleanup) {
      sseCleanup();
      setSseCleanup(null);
    }
  }, [sseCleanup]);

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
