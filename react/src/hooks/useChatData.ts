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
 * Implementation:
 * - Uses API calls for chat/world fetches and memory reconstruction
 * - Streams responses via `sendChatMessage` using web-compatible options payload
 * - Maintains local optimistic message state while SSE events update final content
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
 * - 2026-02-08: Added onToolStream callback for shell command output streaming
 * - 2026-02-07: Updated sendChatMessage usage to web-compatible options payload style
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
  // API returns tool_calls as JSON string from database
  // Can be either snake_case (tool_calls) or camelCase (toolCalls) depending on backend serialization
  tool_calls?: string | Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  toolCalls?: string | Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  toolCallId?: string;
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
  // Parse tool_calls if it's a JSON string (API returns it as string from database)
  // Check BOTH snake_case and camelCase (backend may serialize differently)
  let toolCalls = memoryItem.tool_calls || memoryItem.toolCalls;

  if (typeof toolCalls === 'string' && toolCalls.trim()) {
    try {
      toolCalls = JSON.parse(toolCalls);
    } catch (err) {
      console.warn('Failed to parse tool_calls JSON:', toolCalls, err);
      toolCalls = undefined;
    }
  }

  return {
    id: memoryItem.messageId || `temp-${Date.now()}-${Math.random()}`,
    type: memoryItem.role, // Preserve role as type
    text: memoryItem.content, // Use text field (primary in Message interface)
    content: memoryItem.content, // Also set content for compatibility
    sender: memoryItem.sender || 'unknown',
    timestamp: memoryItem.createdAt,
    createdAt: new Date(memoryItem.createdAt),
    chatId: memoryItem.chatId,
    worldId: undefined,
    messageId: memoryItem.messageId,
    replyToMessageId: memoryItem.replyToMessageId,
    role: memoryItem.role,
    // Preserve tool-related fields (check both snake_case and camelCase)
    ...(toolCalls && { tool_calls: toolCalls }),
    ...(memoryItem.tool_call_id || memoryItem.toolCallId) && {
      tool_call_id: memoryItem.tool_call_id || memoryItem.toolCallId
    },
  };
}

/**
 * Deduplicate messages by messageId (for user messages sent to multiple agents)
 * 
 * Logic matches web frontend (web/src/pages/World.update.ts deduplicateMessages):
 * - User messages with same messageId appear only once
 * - seenByAgents shows only the FIRST agent (intended recipient)
 * - Agent messages remain separate (one per agent)
 * - Sort by timestamp, with replies before incoming when timestamps match
 */
function deduplicateMessages(messages: Message[]): Message[] {
  const messageMap = new Map<string, Message>();
  const messagesWithoutId: Message[] = [];

  for (const msg of messages) {
    // Only deduplicate user messages with messageId
    const isUserMessage = msg.type === 'user' ||
      (msg.sender || '').toLowerCase() === 'human' ||
      (msg.sender || '').toLowerCase() === 'you' ||
      (msg.sender || '').toLowerCase() === 'user';

    if (isUserMessage && msg.messageId) {
      const existing = messageMap.get(msg.messageId);
      if (!existing) {
        // First occurrence - keep it
        messageMap.set(msg.messageId, msg);
      }
      // Subsequent occurrences are ignored (duplicates in other agents' memory)
    } else {
      // Keep all agent messages and messages without messageId
      messagesWithoutId.push(msg);
    }
  }

  // Combine deduplicated user messages with all agent messages
  // Sort by timestamp with logical flow: replies before incoming messages when timestamps match
  return [...Array.from(messageMap.values()), ...messagesWithoutId]
    .sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      // Primary sort: by timestamp
      if (dateA !== dateB) {
        return dateA - dateB;
      }

      // Secondary sort: when timestamps are equal, assistant/agent (reply) comes before user/human (incoming)
      // This ensures logical flow: agent replies first, then that reply is saved to other agents' memories
      const roleOrderA = (a.type === 'agent' || a.type === 'assistant') ? 0 : (a.type === 'user' || a.type === 'human') ? 1 : 2;
      const roleOrderB = (b.type === 'agent' || b.type === 'assistant') ? 0 : (b.type === 'user' || b.type === 'human') ? 1 : 2;
      return roleOrderA - roleOrderB;
    });
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
        type: 'user',
        text: content,
        content,
        sender: 'human',
        timestamp: new Date().toISOString(),
        createdAt: new Date(),
        chatId: currentChatId,
        worldId
      };
      setMessages(prev => [...prev, tempUserMessage]);

      // Send message via SSE
      const cleanup = await sendChatMessage(worldId, content, {
        sender,
        callbacks: {
          onStreamStart: (data) => {
            // Add placeholder message for streaming
            const newMessage: Message = {
              id: data.messageId,
              type: 'assistant',
              text: '...',
              content: '...',
              sender: data.sender,
              timestamp: new Date().toISOString(),
              createdAt: new Date(),
              chatId: currentChatId,
              worldId
            };
            setMessages(prev => [...prev, newMessage]);
          },
          onStreamChunk: (data) => {
            // Update streaming message
            setMessages(prev => prev.map(msg =>
              msg.id === data.messageId
                ? { ...msg, text: data.content, content: data.content }
                : msg
            ));
          },
          onStreamEnd: (data) => {
            // Finalize message and reload from backend
            setMessages(prev => prev.map(msg =>
              msg.id === data.messageId
                ? { ...msg, text: data.content, content: data.content }
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
          onToolStream: (data) => {
            // Update tool streaming message with accumulated output
            setMessages(prev => prev.map(msg => {
              // Find existing tool message by messageId
              if (msg.messageId === data.messageId && msg.isToolEvent) {
                return {
                  ...msg,
                  text: data.content,
                  content: data.content,
                  isToolStreaming: true,
                  streamType: data.stream,
                  toolEventType: 'progress'
                };
              }
              return msg;
            }));
          },
          onMessage: (data) => {
            // Handle non-streaming messages
            if (data.messageId) {
              const content = data.content || data.message || '';
              const newMessage: Message = {
                id: data.messageId,
                type: 'assistant',
                text: content,
                content: content,
                sender: data.sender || data.agentName || 'system',
                timestamp: data.createdAt || new Date().toISOString(),
                createdAt: new Date(data.createdAt || new Date()),
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
