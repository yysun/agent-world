/**
 * World Update Handlers - Core-Centric AppRun Event System
 *
 * Architecture:
 * - Core handles: Auto-restoration, auto-save, memory management
 * - Frontend handles: Display, user input, SSE streaming, UI state
 *
 * Features:
 * - World initialization with core auto-restore via getWorld()
 * - Chat management (create, load, delete) with proper state restoration
 * - Real-time messaging via SSE with auto-save integration
 * - Agent/world memory management and UI controls
 * - Settings and chat history navigation with modal management
 * - Markdown export functionality with HTML rendering
 * - Smooth streaming indicator management (removed after final message displayed)
 * - Message editing with backend API integration (remove + resubmit)
 *
 * Message Edit Feature (Frontend-Driven):
 * - Uses backend messageId (server-generated) for message identification
 * - Two-phase edit: 1) DELETE removes messages, 2) POST resubmits edited content
 * - Phase 1: Calls DELETE /worlds/:worldName/messages/:messageId (removal only)
 * - Phase 2: Reuses POST /messages with existing SSE streaming (agents respond naturally)
 * - LocalStorage backup before DELETE for recovery if POST fails
 * - Validates session mode BEFORE DELETE (not after)
 * - Optimistic UI updates with error rollback
 * - Comprehensive error handling (423 Locked, 404 Not Found, 400 Bad Request)
 * - Recovery mechanism: "Resume Edit" on POST failure
 * - User messages updated with backend messageId when message event received
 *
 * Message Deduplication (Multi-Agent):
 * - User messages deduplicated by messageId to prevent duplicate display
 * - Each agent receives same user message, but UI shows it only once
 * - Tracks which agents received message via seenByAgents array
 * - Displays delivery status: "📨 o1, a1, o3" showing all receiving agents
 * - Edit button disabled until messageId confirmed (prevents premature edit attempts)
 * - Applies deduplication in TWO paths:
 *   1. SSE streaming path: handleMessageEvent() checks for existing messageId OR temp userEntered message
 *   2. Load from storage path: deduplicateMessages() processes loaded history
 * - Uses combined check (messageId OR userEntered+text) to prevent race conditions
 * - Race condition fix: Multiple agents may process same temp message simultaneously
 *   Solution: Single findIndex with OR condition catches both messageId and temp message
 *
 * Changes:
 * - 2025-10-25: Fixed race condition in handleMessageEvent - combined messageId and temp message check
 * - 2025-10-25: Added deduplicateMessages() helper for loading chat history from storage
 * - 2025-10-25: Applied deduplication to both SSE streaming AND load-from-storage paths
 * - 2025-10-25: Added message deduplication by messageId for multi-agent scenarios
 * - 2025-10-25: Added seenByAgents tracking and delivery status display
 * - 2025-10-21: Refactored to frontend-driven approach (DELETE → POST) for SSE streaming reuse
 * - 2025-10-21: Added localStorage backup and recovery mechanism
 * - 2025-10-21: Fixed user message messageId tracking - updates temp message with backend ID
 * - 2025-10-21: Integrated message edit with backend API (remove-and-resubmit approach)
 * - 2025-08-09: Removed selectedSettingsTarget localStorage persistence
 */

import { app } from 'apprun';
import api from '../api';
import {
  sendChatMessage,
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError,
  handleLogEvent,
  handleToolError,
  handleToolStart,
  handleToolResult,
} from '../utils/sse-client';
import type { WorldComponentState, Agent, AgentMessage, Message } from '../types';
import toKebabCase from '../utils/toKebabCase';
import { renderMarkdown } from '../utils/markdown';

// Utility functions for message processing
const createMessageFromMemory = (memoryItem: AgentMessage, agentName: string): Message => {
  const sender = toKebabCase(memoryItem.sender || agentName);
  const messageType = (sender === 'HUMAN' || sender === 'USER') ? 'user' : 'agent';
  const isUserMessage = messageType === 'user';

  // Auto-generate fallback ID for legacy messages without messageId
  if (!memoryItem.messageId) {
    // Generate deterministic fallback ID based on message content and timestamp
    const timestamp = memoryItem.createdAt ? new Date(memoryItem.createdAt).getTime() : Date.now();
    const contentHash = (memoryItem.content || '').substring(0, 20).replace(/\s/g, '');
    memoryItem.messageId = `fallback-${timestamp}-${contentHash.substring(0, 10)}`;
  }

  return {
    id: `msg-${Date.now() + Math.random()}`,
    sender,
    text: memoryItem.content || '',
    messageId: memoryItem.messageId,
    createdAt: memoryItem.createdAt || new Date(),
    type: messageType,
    fromAgentId: isUserMessage ? undefined : agentName // Only set fromAgentId for agent messages
  };
};

/**
 * Deduplicates messages by messageId to handle multi-agent scenarios.
 * User messages should appear only once, with seenByAgents tracking which agents received them.
 * Agent messages remain separate (one per agent).
 */
const deduplicateMessages = (messages: Message[]): Message[] => {
  const messageMap = new Map<string, Message>();
  const messagesWithoutId: Message[] = [];

  for (const msg of messages) {
    // Only deduplicate user messages with messageId
    const isUserMessage = msg.type === 'user' ||
      (msg.sender || '').toLowerCase() === 'human' ||
      (msg.sender || '').toLowerCase() === 'user';

    if (isUserMessage && msg.messageId) {
      const existing = messageMap.get(msg.messageId);
      if (existing) {
        // Update seenByAgents for this duplicate
        const agentId = msg.fromAgentId || 'unknown';
        const seenByAgents = existing.seenByAgents || [];
        if (!seenByAgents.includes(agentId)) {
          existing.seenByAgents = [...seenByAgents, agentId];
        }
      } else {
        // First occurrence - initialize seenByAgents
        const agentId = msg.fromAgentId || 'unknown';
        messageMap.set(msg.messageId, {
          ...msg,
          seenByAgents: [agentId]
        });
      }
    } else {
      // Keep all agent messages and messages without messageId
      messagesWithoutId.push(msg);
    }
  }

  // Combine deduplicated user messages with all agent messages
  // Sort by createdAt to maintain chronological order
  return [...Array.from(messageMap.values()), ...messagesWithoutId]
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateA - dateB;
    });
};

// World initialization with core auto-restore
async function* initWorld(state: WorldComponentState, name: string, chatId?: string): AsyncGenerator<WorldComponentState> {
  if (!name) {
    location.href = '/';
    return;
  }
  try {
    const worldName = decodeURIComponent(name);

    // Default selectedSettingsTarget to 'world' on init (no persistence)
    state.selectedSettingsTarget = 'world';
    state.worldName = worldName;
    state.loading = true;

    const world = await api.getWorld(worldName);
    if (!world) {
      throw new Error('World not found: ' + worldName);
    }

    if (!chatId || !(chatId in world.chats)) {
      chatId = world.currentChatId || undefined;
    }

    if (world.currentChatId !== chatId && chatId) {
      await api.setChat(worldName, chatId);
    }

    let messages: any[] = [];

    const agents: Agent[] = Array.from(world.agents.values());
    for (const agent of agents) {
      agent.spriteIndex = agents.indexOf(agent) % 9;
      agent.messageCount = 0;
      for (const memoryItem of agent.memory || []) {
        if (memoryItem.chatId === chatId) {
          agent.messageCount++;
          const message = createMessageFromMemory(memoryItem, agent.name);
          messages.push(message);
        }
      }
    }

    // Apply deduplication to loaded messages (same as SSE streaming path)
    messages = deduplicateMessages(messages);

    yield {
      ...state,
      world,
      currentChat: world.chats.find(c => c.id === chatId) || null,
      messages,
      loading: false,
      needScroll: true,
    };

  } catch (error: any) {
    yield {
      ...state,
      error: error.message || 'Failed to load world data',
      loading: false,
      needScroll: false,
    };
  }
}


// Event handlers for SSE and system events
const handleSystemEvent = async (state: WorldComponentState, data: any): Promise<WorldComponentState> => {
  if (data.content === 'chat-title-updated') {
    const updates = initWorld(state, state.worldName, data.chatId);
    for await (const update of updates) {
      state = { ...state, ...update };
    }
    return state;
  }
  return state;
};

const handleMessageEvent = async <T extends WorldComponentState>(state: T, data: any): Promise<T> => {

  const messageData = data || {};
  const senderName = messageData.sender;

  // Find and update agent message count
  let fromAgentId: string | undefined;
  if (state.world?.agents) {
    const agent = state.world.agents.find((a: any) => a.name.toLowerCase() === senderName.toLowerCase());
    if (agent) {
      if (!agent.messageCount) {
        agent.messageCount = 0;
      }
      agent.messageCount++;
      fromAgentId = agent.id;
    }
  }

  const newMessage = {
    id: messageData.id || `msg-${Date.now() + Math.random()}`,
    type: messageData.type || 'message',
    sender: senderName,
    text: messageData.content || messageData.message || '',
    createdAt: messageData.createdAt || new Date().toISOString(),
    fromAgentId,
    messageId: messageData.messageId
  };

  const existingMessages = state.messages || [];
  const normalizedSender = (senderName || '').toLowerCase();

  // Check if this is a user message that we need to deduplicate or update
  const isUserMessage = normalizedSender === 'human' || normalizedSender === 'user';
  if (isUserMessage && messageData.messageId) {
    // Check for existing message (either by messageId or temp message with matching text)
    // This prevents race conditions where multiple agents process the same temp message
    const existingMessageIndex = existingMessages.findIndex(
      msg => msg.messageId === messageData.messageId ||
        (msg.userEntered && msg.text === newMessage.text)
    );

    if (existingMessageIndex !== -1) {
      const existingMessage = existingMessages[existingMessageIndex];
      const agentId = fromAgentId || messageData.agentId || 'unknown';

      // Check if this message already has the messageId
      if (existingMessage.messageId === messageData.messageId) {
        // Message already has messageId - this is a duplicate from another agent

        const seenByAgents = existingMessage.seenByAgents || [];
        if (!seenByAgents.includes(agentId)) {
          const updatedMessages = existingMessages.map((msg, index) => {
            if (index === existingMessageIndex) {
              return {
                ...msg,
                seenByAgents: [...seenByAgents, agentId]
              };
            }
            return msg;
          });

          return {
            ...state,
            messages: updatedMessages,
            needScroll: false // Don't scroll for duplicate message
          };
        }
        // Agent already in seenByAgents, no update needed
        return state;
      }

      // Message is temp (userEntered=true) and needs messageId
      const updatedMessages = existingMessages.map((msg, index) => {
        if (index === existingMessageIndex) {
          return {
            ...msg,
            messageId: messageData.messageId,
            createdAt: messageData.createdAt || msg.createdAt,
            userEntered: false, // No longer temporary
            seenByAgents: [agentId] // Initialize with first agent
          };
        }
        return msg;
      });

      return {
        ...state,
        messages: updatedMessages,
        needScroll: false // Don't scroll for user message update
      };
    }
  }

  // If a streaming placeholder exists for this sender, convert it to the final message
  const streamingIndex = existingMessages.findIndex(
    msg => msg?.isStreaming && (msg.sender || '').toLowerCase() === normalizedSender
  );

  if (streamingIndex !== -1) {
    const updatedMessages = existingMessages
      .map((msg, index) => {
        if (index !== streamingIndex) {
          return msg;
        }

        return {
          ...msg,
          ...newMessage,
          id: newMessage.id,
          isStreaming: false,
          messageId: newMessage.messageId ?? msg.messageId
        };
      })
      .filter(msg => !!msg && !msg.userEntered);

    return {
      ...state,
      messages: updatedMessages,
      needScroll: true
    };
  }

  // Filter out temporary placeholders and user-entered messages before adding the new one
  state.messages = existingMessages.filter(msg =>
    !msg.userEntered &&
    !(msg.isStreaming && (msg.sender || '').toLowerCase() === normalizedSender)
  );
  state.messages.push(newMessage);

  return {
    ...state,
    needScroll: true
  };
};

const handleError = <T extends WorldComponentState>(state: T, error: any): T => {
  const errorMessage = error.message || 'SSE error';

  const errorMsg = {
    id: Date.now() + Math.random(),
    type: 'error',
    sender: 'System',
    text: errorMessage,
    createdAt: new Date().toISOString(),
    worldName: state.worldName,
    hasError: true
  };

  return {
    ...state,
    error: errorMessage,
    messages: [...(state.messages || []), errorMsg],
    needScroll: true,
    isWaiting: false
  };
};


export const worldUpdateHandlers = {

  initWorld,

  '/World': initWorld,

  // Basic input and messaging handlers
  'update-input': (state: WorldComponentState, e: any): WorldComponentState => ({
    ...state,
    userInput: e.target.value
  }),

  'key-press': (state: WorldComponentState, e: any) => {
    if (e.key === 'Enter' && (state.userInput || '').trim()) {
      app.run('send-message');
    }
  },

  'send-message': async (state: WorldComponentState): Promise<WorldComponentState> => {
    const messageText = state.userInput?.trim();
    if (!messageText) return state;

    const userMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sender: 'human',
      text: messageText,
      createdAt: new Date(),
      type: 'user',
      userEntered: true,
      worldName: state.worldName
    };

    const newState = {
      ...state,
      messages: [...(state.messages || []), userMessage],
      userInput: '',
      isSending: true,
      isWaiting: true,
      needScroll: true
    };

    try {
      // Send the message via SSE stream
      const cleanup = await sendChatMessage(state.worldName, messageText, 'HUMAN');

      // Note: isWaiting will be set to false by handleStreamEnd when the stream completes or by handleStreamError/handleError on errors
      return { ...newState, isSending: false };
    } catch (error: any) {
      return {
        ...newState,
        isSending: false,
        isWaiting: false,
        error: error.message || 'Failed to send message'
      };
    }
  },
  // SSE Event Handlers
  handleStreamStart,
  handleStreamChunk,
  handleStreamEnd,
  handleStreamError,
  handleLogEvent,
  handleMessageEvent,
  handleSystemEvent,
  handleError,
  handleToolError,
  handleToolStart,
  handleToolResult,

  'toggle-log-details': (state: WorldComponentState, messageId: string | number): WorldComponentState => {
    if (!messageId || !state.messages) {
      return state;
    }

    const messages = state.messages.map(msg => {
      if (String(msg.id) === String(messageId)) {
        return {
          ...msg,
          isLogExpanded: !msg.isLogExpanded
        };
      }
      return msg;
    });

    return {
      ...state,
      messages,
      needScroll: false
    };
  },

  'ack-scroll': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    needScroll: false
  }),

  // Message editing handlers
  'start-edit-message': (state: WorldComponentState, messageId: string, messageText: string): WorldComponentState => ({
    ...state,
    editingMessageId: messageId,
    editingText: messageText
  }),

  'cancel-edit-message': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    editingMessageId: null,
    editingText: ''
  }),

  'update-edit-text': (state: WorldComponentState, e: any): WorldComponentState => ({
    ...state,
    editingText: e.target.value
  }),

  'save-edit-message': async (state: WorldComponentState, messageId: string): Promise<WorldComponentState> => {
    const editedText = state.editingText?.trim();
    if (!editedText) return state;

    // Find the message by frontend ID
    const message = state.messages.find(msg => msg.id === messageId);
    if (!message) {
      return {
        ...state,
        error: 'Message not found',
        editingMessageId: null,
        editingText: ''
      };
    }

    // Check if message has backend messageId
    if (!message.messageId) {
      return {
        ...state,
        error: 'Cannot edit message: missing message ID. Message may not be saved yet.',
        editingMessageId: null,
        editingText: ''
      };
    }

    // Check if we have a current chat
    if (!state.currentChat?.id) {
      return {
        ...state,
        error: 'Cannot edit message: no active chat session',
        editingMessageId: null,
        editingText: ''
      };
    }

    // Check session mode before proceeding
    if (!state.world?.currentChatId) {
      return {
        ...state,
        error: 'Cannot edit message: session mode is OFF. Please enable session mode first.',
        editingMessageId: null,
        editingText: ''
      };
    }

    // Store edit backup in localStorage before DELETE
    const editBackup = {
      messageId: message.messageId,
      chatId: state.currentChat.id,
      newContent: editedText,
      timestamp: Date.now(),
      worldName: state.worldName
    };
    try {
      localStorage.setItem('agent-world-edit-backup', JSON.stringify(editBackup));
    } catch (e) {
      console.warn('Failed to save edit backup to localStorage:', e);
    }

    // Optimistically update UI: remove messages from edited message onwards
    const editedIndex = state.messages.findIndex(msg => msg.id === messageId);
    const updatedMessages = editedIndex >= 0 ? state.messages.slice(0, editedIndex) : state.messages;

    const optimisticState = {
      ...state,
      messages: updatedMessages,
      editingMessageId: null,
      editingText: '',
      isSending: true,
      isWaiting: true,
      needScroll: true
    };

    try {
      // PHASE 1: Call DELETE to remove messages
      const deleteResult = await api.deleteMessage(
        state.worldName,
        message.messageId,
        state.currentChat.id
      );

      // Check DELETE result
      if (!deleteResult.success) {
        // Partial failure - some agents failed
        const failedAgentNames = deleteResult.failedAgents?.map((f: any) => f.agentId).join(', ');
        return {
          ...state,
          isSending: false,
          isWaiting: false,
          error: `Message removal partially failed for agents: ${failedAgentNames}. ${deleteResult.messagesRemovedTotal || 0} messages removed.`
        };
      }

      // PHASE 2: Call POST to resubmit edited message (reuses existing SSE streaming)
      try {
        const cleanup = await sendChatMessage(state.worldName, editedText, 'human');

        // Clear localStorage backup on successful resubmission
        try {
          localStorage.removeItem('agent-world-edit-backup');
        } catch (e) {
          console.warn('Failed to clear edit backup:', e);
        }

        // Success - message will arrive via SSE, keep waiting for responses
        return {
          ...optimisticState,
          isSending: false
          // Keep isWaiting: true until SSE events complete
        };
      } catch (resubmitError: any) {
        // POST failed after DELETE succeeded
        return {
          ...optimisticState,
          isSending: false,
          isWaiting: false,
          error: `Messages removed but resubmission failed: ${resubmitError.message || 'Unknown error'}. Please try editing again.`
        };
      }

    } catch (error: any) {
      // Handle DELETE errors
      let errorMessage = error.message || 'Failed to edit message';

      if (error.message?.includes('423')) {
        errorMessage = 'Cannot edit message: world is currently processing. Please try again in a moment.';
      } else if (error.message?.includes('404')) {
        errorMessage = 'Message not found in agent memories. It may have been already deleted.';
      } else if (error.message?.includes('400')) {
        errorMessage = 'Invalid message: only user messages can be edited.';
      }

      // Restore original messages on DELETE error
      return {
        ...state,
        isSending: false,
        isWaiting: false,
        editingMessageId: null,
        editingText: '',
        error: errorMessage
      };
    }
  },

  // Memory management handlers
  'clear-agent-messages': async (state: WorldComponentState, agent: Agent): Promise<WorldComponentState> => {
    try {
      await api.clearAgentMemory(state.worldName, agent.name);

      const updatedAgents = state.world?.agents.map(a =>
        a.id === agent.id ? { ...a, messageCount: 0 } : a
      ) ?? [];

      const updatedSelectedAgent = state.selectedAgent?.id === agent.id
        ? { ...state.selectedAgent, messageCount: 0 }
        : state.selectedAgent;

      return {
        ...state,
        world: state.world ? { ...state.world, agents: updatedAgents } : null,
        messages: (state.messages || []).filter(msg => msg.sender !== agent.name),
        selectedAgent: updatedSelectedAgent
      };
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to clear agent messages' };
    }
  },

  'clear-world-messages': async (state: WorldComponentState): Promise<WorldComponentState> => {
    try {
      await Promise.all(
        (state.world?.agents ?? []).map(agent => api.clearAgentMemory(state.worldName, agent.name))
      );

      const updatedAgents = (state.world?.agents ?? []).map(agent => ({ ...agent, messageCount: 0 }));
      const updatedSelectedAgent = state.selectedAgent ? { ...state.selectedAgent, messageCount: 0 } : null;

      return {
        ...state,
        world: state.world ? { ...state.world, agents: updatedAgents } : null,
        messages: [],
        selectedAgent: updatedSelectedAgent
      };
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to clear world messages' };
    }
  },


  // Modal and deletion handlers
  'chat-history-show-delete-confirm': (state: WorldComponentState, chat: any): WorldComponentState => ({
    ...state,
    chatToDelete: chat
  }),

  'chat-history-hide-modals': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    chatToDelete: null
  }),

  'delete-agent': async (state: WorldComponentState, agent: Agent): Promise<WorldComponentState> => {
    try {
      await api.deleteAgent(state.worldName, agent.name);

      const updatedAgents = (state.world?.agents ?? []).filter(a => a.id !== agent.id);
      const isSelectedAgent = state.selectedAgent?.id === agent.id;

      return {
        ...state,
        world: state.world ? { ...state.world, agents: updatedAgents } : null,
        messages: (state.messages || []).filter(msg => msg.sender !== agent.name),
        selectedAgent: isSelectedAgent ? null : state.selectedAgent,
        selectedSettingsTarget: isSelectedAgent ? 'world' : state.selectedSettingsTarget
      };
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to delete agent' };
    }
  },

  // Export and view handlers
  'export-world-markdown': async (state: WorldComponentState, worldName: string): Promise<WorldComponentState> => {
    try {
      window.location.href = `/api/worlds/${encodeURIComponent(worldName)}/export`;
      return state;
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to export world' };
    }
  },

  'view-world-markdown': async (state: WorldComponentState, worldName: string): Promise<WorldComponentState> => {
    try {
      const markdown = await api.getWorldMarkdown(worldName);
      const htmlContent = renderMarkdown(markdown);

      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>World Export: ${worldName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        h1, h2, h3 { color: #2c3e50; }
        h1 { border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
        code {
            background: #f8f9fa;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
        pre code { background: none; padding: 0; }
        ul { padding-left: 20px; }
        li { margin-bottom: 5px; }
        hr { border: none; height: 1px; background: #bdc3c7; margin: 30px 0; }
        strong { color: #2c3e50; }
    </style>
</head>
<body>${htmlContent}</body>
</html>`;

      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(fullHtml);
        newWindow.document.close();
      }
      return state;
    } catch (error: any) {
      return { ...state, error: error.message || 'Failed to view world markdown' };
    }
  },

  // Chat management handlers
  'create-new-chat': async function* (state: WorldComponentState): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true };

      const result = await api.newChat(state.worldName);
      if (!result.success) {
        yield { ...state, loading: false, error: 'Failed to create new chat' };
        return;
      }
      app.run('initWorld', state.worldName);
    } catch (error: any) {
      yield { ...state, loading: false, error: error.message || 'Failed to create new chat' };
    }
  },

  'load-chat-from-history': async function* (state: WorldComponentState, chatId: string): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true };

      const result = await api.setChat(state.worldName, chatId);
      if (!result.success) {
        yield state;
      }
      // app.run('initWorld', state.worldName, chatId);
      const path = `/World/${encodeURIComponent(state.worldName)}/${encodeURIComponent(chatId)}`;
      app.route(path);
      history.pushState(null, '', path);
    } catch (error: any) {
      yield { ...state, loading: false, error: error.message || 'Failed to load chat from history' };
    }
  },

  'delete-chat-from-history': async function* (state: WorldComponentState, chatId: string): AsyncGenerator<WorldComponentState> {
    try {
      yield { ...state, loading: true, chatToDelete: null };
      await api.deleteChat(state.worldName, chatId);
      const path = `/World/${encodeURIComponent(state.worldName)}`;
      app.route(path);
      history.pushState(null, '', path);
    } catch (error: any) {
      yield { ...state, loading: false, chatToDelete: null, error: error.message || 'Failed to delete chat' };
    }
  },
};
