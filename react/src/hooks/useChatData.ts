/**
 * useChatData Hook - Chat management and real-time messaging
 * 
 * Purpose: Manage chats, send messages via REST API and SSE
 * 
 * Features:
 * - List chats for world
 * - Create/delete chats
 * - Send messages with SSE streaming
 * - Load messages from agent memory for the current chat
 * - Real-time message updates via callbacks
 * - Auto-select default chat (currentChatId)
 * 
 * Usage:
 * ```tsx
 * function ChatBox({ worldId, chatId }: { worldId: string; chatId?: string }) {
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
 * - 2025-11-12: Added message loading from agent memory (loads messages for current chat)
 * - 2025-11-12: Added auto-select default chat when no chatId provided
 * - 2025-11-12: Updated to use REST API and SSE instead of WebSocket
 * - 2025-11-03: Initial hook implementation with connection state checking
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import { sendChatMessage } from '@/lib/sse-client';
import type { Chat, Message, UseChatDataReturn } from '@/types';

interface MemoryItem {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  sender?: string;
  chatId?: string;
  createdAt: string;
  messageId?: string;
  replyToMessageId?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

interface AgentWithMemory {
  id: string;
  name: string;
  memory?: MemoryItem[];
}

/**
 * Create a Message from a memory item
 */
function createMessageFromMemory(memoryItem: MemoryItem, _agentName: string): Message {
  return {
    id: memoryItem.messageId || `temp-${Date.now()}-${Math.random()}`,
    content: memoryItem.content,
    sender: memoryItem.sender || 'unknown',
    timestamp: memoryItem.createdAt,
    chatId: memoryItem.chatId,
    worldId: undefined,
  };
}

/**
 * Deduplicate messages by messageId (for user messages sent to multiple agents)
 */
function deduplicateMessages(messages: Message[]): Message[] {
  const seen = new Map<string, Message>();
  const result: Message[] = [];

  for (const msg of messages) {
    // For messages with messageId, deduplicate by that
    if (msg.id) {
      if (!seen.has(msg.id)) {
        seen.set(msg.id, msg);
        result.push(msg);
      }
    } else {
      // Messages without ID are always added
      result.push(msg);
    }
  }

  // Sort by timestamp
  return result.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export function useChatData(worldId: string, chatId?: string): UseChatDataReturn {
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sseCleanup, setSseCleanup] = useState<(() => void) | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | undefined>(chatId);

  // Fetch chats and messages
  const fetchChats = useCallback(async () => {
    if (!worldId) return;

    try {
      const worldData = await api.getWorld(worldId);
      setChats(worldData?.chats || []);
      return worldData;
    } catch (err) {
      console.error('Failed to fetch chats:', err);
      setError(err as Error);
      return null;
    }
  }, [worldId]);

  // Load messages for a specific chat from agent memory
  const loadChatMessages = useCallback(async (targetChatId: string) => {
    if (!worldId || !targetChatId) {
      console.log('[useChatData] loadChatMessages: Missing worldId or targetChatId', { worldId, targetChatId });
      return;
    }

    console.log('[useChatData] loadChatMessages: Loading messages', { worldId, targetChatId });
    try {
      const worldData = await api.getWorld(worldId);
      const agents = worldData?.agents || [];
      console.log('[useChatData] loadChatMessages: Got agents', { agentCount: agents.length });

      const rawMessages: Message[] = [];

      // Load messages from each agent's memory for this chat
      for (const agent of agents as AgentWithMemory[]) {
        if (!agent.memory) continue;

        console.log('[useChatData] loadChatMessages: Agent memory', { agentName: agent.name, memoryCount: agent.memory.length });
        for (const memoryItem of agent.memory) {
          if (memoryItem.chatId === targetChatId) {
            const message = createMessageFromMemory(memoryItem, agent.name);
            rawMessages.push(message);
          }
        }
      }

      console.log('[useChatData] loadChatMessages: Raw messages', { count: rawMessages.length });
      // Deduplicate and sort messages
      const deduplicatedMessages = deduplicateMessages(rawMessages);
      console.log('[useChatData] loadChatMessages: Deduplicated messages', { count: deduplicatedMessages.length });
      setMessages(deduplicatedMessages);
    } catch (err) {
      console.error('Failed to load chat messages:', err);
      setError(err as Error);
    }
  }, [worldId]);

  // Auto-fetch chats and load messages for current chat
  useEffect(() => {
    if (worldId) {
      console.log('[useChatData] useEffect: Starting', { worldId, chatId });
      setLoading(true);
      fetchChats().then((worldData) => {
        console.log('[useChatData] useEffect: Fetched world', { currentChatId: worldData?.currentChatId, chatsCount: worldData?.chats?.length });
        // If no chatId provided, use the world's currentChatId
        const targetChatId = chatId || worldData?.currentChatId;
        console.log('[useChatData] useEffect: Target chat', { targetChatId, fromProp: !!chatId, fromWorld: !!worldData?.currentChatId });
        if (targetChatId) {
          setCurrentChatId(targetChatId);
          loadChatMessages(targetChatId);
        } else {
          console.log('[useChatData] useEffect: No target chat ID available');
        }
      }).finally(() => setLoading(false));
    }
  }, [worldId, chatId, fetchChats, loadChatMessages]);

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

      // Add user message immediately to UI
      const tempUserMessage: Message = {
        id: `temp-${Date.now()}`,
        content,
        sender: 'human',
        timestamp: new Date().toISOString(),
        chatId: currentChatId,
        worldId
      };
      setMessages(prev => [...prev, tempUserMessage]);

      // Send message via SSE
      const cleanup = await sendChatMessage(worldId, content, sender, {
        onStreamStart: (data) => {
          // Add placeholder message for streaming
          const newMessage: Message = {
            id: data.messageId,
            content: '...',
            sender: data.sender,
            timestamp: new Date().toISOString(),
            chatId: currentChatId,
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
          // Finalize message and reload from backend
          setMessages(prev => prev.map(msg =>
            msg.id === data.messageId
              ? { ...msg, content: data.content }
              : msg
          ));

          // Reload messages from backend after stream ends
          if (currentChatId) {
            setTimeout(() => loadChatMessages(currentChatId), 500);
          }
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
              chatId: currentChatId,
              worldId: worldId
            };
            setMessages(prev => {
              // Avoid duplicates
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        },
        onComplete: () => {
          // Reload messages from backend when complete
          if (currentChatId) {
            loadChatMessages(currentChatId);
          }
        },
        onError: (err) => {
          console.error('SSE error:', err);
          setError(err);
        }
      });

      setSseCleanup(() => cleanup);
    },
    [worldId, currentChatId, sseCleanup, loadChatMessages]
  );

  const createChat = useCallback(
    async (): Promise<Chat> => {
      const result = await api.newChat(worldId);
      const worldData = await fetchChats(); // Refresh list

      setCurrentChatId(result.chatId);
      setMessages([]); // Clear messages for new chat

      // Return chat object from the updated world data
      const newChat = worldData?.chats?.find(c => c.id === result.chatId);
      return newChat || {
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
    unsubscribeFromChat,
    loadChatMessages
  };
}
