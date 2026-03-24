/**
 * Purpose:
 * - Provide shared helper functions for the World feature runtime update implementation.
 *
 * Key Features:
 * - Encodes message reconstruction, deduplication, transient preservation, and runtime timer helpers.
 * - Keeps the composed runtime update file focused on flow orchestration instead of low-level support logic.
 *
 * Notes on Implementation:
 * - Helpers stay framework-compatible with AppRun and preserve existing chat/event semantics.
 * - This module is intentionally limited to support logic used by the World runtime handlers.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Extracted shared helper logic from `runtime.ts` into a dedicated support module.
 */

import { app } from 'apprun';
import type { Agent, AgentMessage, Message, WorldComponentState } from '../../../types';
import toKebabCase from '../../../utils/toKebabCase';

export function parseLiveToolResultEnvelope(content: unknown): {
  content: string;
  role?: string;
  toolCallId?: string;
} | null {
  if (typeof content !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || parsed.__type !== 'tool_result') {
      return null;
    }

    return {
      content: typeof parsed.content === 'string' ? parsed.content : '',
      role: 'tool',
      toolCallId: typeof parsed.tool_call_id === 'string' ? parsed.tool_call_id : undefined,
    };
  } catch {
    return null;
  }
}

export function parseSyntheticAssistantToolResult(content: unknown): {
  content: string;
  role: 'assistant';
  tool: string;
  toolCallId?: string;
  sourceMessageId?: string;
} | null {
  if (typeof content !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || parsed.__type !== 'synthetic_assistant_tool_result') {
      return null;
    }

    const tool = typeof parsed.tool === 'string' ? parsed.tool.trim() : '';
    const body = typeof parsed.content === 'string' ? parsed.content : '';
    if (!tool || !body) {
      return null;
    }

    return {
      content: body,
      role: 'assistant',
      tool,
      ...(typeof parsed.tool_call_id === 'string' ? { toolCallId: parsed.tool_call_id } : {}),
      ...(typeof parsed.source_message_id === 'string' ? { sourceMessageId: parsed.source_message_id } : {}),
    };
  } catch {
    return null;
  }
}

export function createMessageFromMemory(memoryItem: AgentMessage, agentName: string): Message {
  const sender = toKebabCase(memoryItem.sender || agentName);
  const syntheticToolResult = parseSyntheticAssistantToolResult(memoryItem.content);
  const resolvedContent = syntheticToolResult?.content ?? memoryItem.content ?? '';
  const resolvedRole = syntheticToolResult?.role ?? memoryItem.role;

  let messageType: string;
  if (sender === 'human' || sender === 'user') {
    messageType = 'user';
  } else if (resolvedRole === 'tool') {
    messageType = 'tool';
  } else if (resolvedRole === 'user') {
    messageType = 'user';
  } else if (resolvedRole === 'assistant') {
    messageType = 'agent';
  } else {
    messageType = 'agent';
  }

  const isUserMessage = messageType === 'user';

  if (!memoryItem.messageId) {
    const timestamp = memoryItem.createdAt ? new Date(memoryItem.createdAt).getTime() : Date.now();
    const contentHash = (memoryItem.content || '').substring(0, 20).replace(/\s/g, '');
    memoryItem.messageId = `fallback-${timestamp}-${contentHash.substring(0, 10)}`;
  }

  const isAgentSender = sender !== 'human' && sender !== 'user';
  const isIncomingAgentMessage = isUserMessage && isAgentSender;

  let displaySender: string;
  let displayFromAgentId: string | undefined;

  if (isIncomingAgentMessage) {
    displaySender = toKebabCase(agentName);
    displayFromAgentId = sender;
  } else {
    displaySender = sender;
    displayFromAgentId = memoryItem.agentId || (isUserMessage ? undefined : agentName);
  }

  const memoryData = memoryItem as any;

  return {
    id: `msg-${Date.now() + Math.random()}`,
    sender: displaySender,
    text: resolvedContent,
    messageId: memoryItem.messageId,
    chatId: memoryItem.chatId,
    replyToMessageId: memoryItem.replyToMessageId,
    createdAt: memoryItem.createdAt || new Date(),
    type: messageType,
    fromAgentId: displayFromAgentId,
    ownerAgentId: toKebabCase(agentName),
    role: resolvedRole,
    tool_calls: memoryData.tool_calls || memoryData.toolCalls,
    tool_call_id: memoryData.tool_call_id || memoryData.toolCallId,
    syntheticDisplayOnly: Boolean(syntheticToolResult),
    syntheticToolResult: syntheticToolResult || undefined,
  } as Message;
}

export function deduplicateMessages(messages: Message[], agents: Agent[] = []): Message[] {
  const messageMap = new Map<string, Message>();
  const messagesWithoutId: Message[] = [];

  for (const msg of messages) {
    const isUserMessage = msg.type === 'user'
      || (msg.sender || '').toLowerCase() === 'human'
      || (msg.sender || '').toLowerCase() === 'user';

    if (isUserMessage && msg.messageId) {
      const existing = messageMap.get(msg.messageId);
      if (!existing) {
        let initialSeenBy: string[];
        if (msg.fromAgentId) {
          initialSeenBy = [msg.fromAgentId];
        } else if (agents.length === 1) {
          initialSeenBy = [agents[0].id];
        } else {
          initialSeenBy = [];
        }

        messageMap.set(msg.messageId, {
          ...msg,
          seenByAgents: initialSeenBy,
        });
      }
    } else {
      messagesWithoutId.push(msg);
    }
  }

  return [...Array.from(messageMap.values()), ...messagesWithoutId]
    .sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      const roleOrderA = (a.type === 'agent' || a.type === 'assistant') ? 0 : (a.type === 'user' || a.type === 'human') ? 1 : 2;
      const roleOrderB = (b.type === 'agent' || b.type === 'assistant') ? 0 : (b.type === 'user' || b.type === 'human') ? 1 : 2;
      return roleOrderA - roleOrderB;
    });
}

export function clearSystemStatusTimer(timerId: number | null | undefined): void {
  if (typeof timerId === 'number') {
    clearTimeout(timerId);
  }
}

export function upsertSystemMessage(messages: Message[], nextMessage: Message): Message[] {
  const index = messages.findIndex((message) => message.id === nextMessage.id || message.messageId === nextMessage.messageId);
  if (index < 0) {
    return [...messages, nextMessage];
  }

  const nextMessages = [...messages];
  nextMessages[index] = nextMessage;
  return nextMessages;
}

function isTransientRealtimeMessage(message: Message): boolean {
  return Boolean(
    message?.logEvent
    || message?.worldEvent
    || message?.hasError
    || message?.type === 'error'
    || message?.type === 'log'
    || message?.type === 'system'
  );
}

export function preserveTransientMessagesAcrossRefresh(
  existingMessages: Message[],
  refreshedMessages: Message[],
  activeChatId: string | null,
): Message[] {
  if (!Array.isArray(existingMessages) || existingMessages.length === 0) {
    return refreshedMessages;
  }

  const nextMessages = Array.isArray(refreshedMessages) ? [...refreshedMessages] : [];
  const existingIds = new Set(
    nextMessages
      .map((message) => (typeof message?.id === 'string' ? message.id : ''))
      .filter(Boolean),
  );

  const transients = existingMessages.filter((message) => {
    if (!isTransientRealtimeMessage(message)) {
      return false;
    }

    const messageChatId = message.chatId ?? null;
    if (!activeChatId) {
      return true;
    }
    if (messageChatId === null) {
      return true;
    }
    return messageChatId === activeChatId;
  });

  for (const transient of transients) {
    if (transient?.id && existingIds.has(transient.id)) {
      continue;
    }
    nextMessages.push(transient);
    if (transient?.id) {
      existingIds.add(transient.id);
    }
  }

  return nextMessages;
}

export function mergeUpdatedWorldWithUiState(
  currentWorld: WorldComponentState['world'],
  updatedWorld: WorldComponentState['world'],
): WorldComponentState['world'] {
  if (!updatedWorld) {
    return currentWorld;
  }

  if (!currentWorld) {
    return updatedWorld;
  }

  const existingAgentById = new Map<string, Agent>();
  for (const existingAgent of currentWorld.agents || []) {
    existingAgentById.set(existingAgent.id, existingAgent);
  }

  const mergedAgents = (updatedWorld.agents || []).map((agent, index) => {
    const existingAgent = existingAgentById.get(agent.id);
    return {
      ...agent,
      spriteIndex: existingAgent?.spriteIndex ?? (index % 9),
      messageCount: existingAgent?.messageCount ?? 0,
    };
  });

  return {
    ...currentWorld,
    ...updatedWorld,
    agents: mergedAgents,
  };
}

export function scheduleStreamFlush(state: WorldComponentState): WorldComponentState {
  if (state.debounceFrameId !== null) {
    return state;
  }

  const frameId = requestAnimationFrame(() => {
    app.run('flush-stream-updates');
  });

  return { ...state, debounceFrameId: frameId };
}

export function startElapsedTimer(state: WorldComponentState): WorldComponentState {
  if (state.elapsedIntervalId !== null) {
    return state;
  }

  const startTime = Date.now();
  const intervalId = window.setInterval(() => {
    app.run('update-elapsed-time');
  }, 1000);

  return {
    ...state,
    activityStartTime: startTime,
    elapsedIntervalId: intervalId,
    elapsedMs: 0,
  };
}

export function stopElapsedTimer(state: WorldComponentState): WorldComponentState {
  if (state.elapsedIntervalId !== null) {
    clearInterval(state.elapsedIntervalId);
  }

  return {
    ...state,
    elapsedIntervalId: null,
    activityStartTime: null,
    elapsedMs: 0,
  };
}

export function hasActivity(state: WorldComponentState): boolean {
  return state.activeTools.length > 0 || state.pendingStreamUpdates.size > 0;
}

export function shouldIgnoreToolEventForActiveChat(
  state: WorldComponentState,
  data: any,
  options?: { allowMissingChatId?: boolean },
): boolean {
  const activeChatId = state.currentChat?.id || null;
  const incomingChatId = data?.chatId ?? null;
  if (!activeChatId) {
    return false;
  }

  if (!incomingChatId) {
    return options?.allowMissingChatId !== true;
  }

  return incomingChatId !== activeChatId;
}